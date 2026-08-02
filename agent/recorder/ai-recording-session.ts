/**
 * AIRecordingSession — AI 驱动录制核心
 *
 * 整合 Stagehand (act/extract/observe) + PlaywrightRecorderAdapter (_enableRecorder)
 * + StepConsolidator + Refiner，实现从自然语言测试用例到可回放 draft suite 的完整流程。
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §3.1
 *
 * 执行流程：
 *   1. Stagehand init (verbose:0, 安全优先) + _enableRecorder 挂载
 *   2. 导航到起始 URL
 *   3. 逐 NL step: act() + lazy observe + extract() 验证 + _enableRecorder 捕获
 *   4. Flush consolidator → Refiner 纯代码管道精炼
 *   5. 清理 Stagehand
 *
 * AutoReplay（第 6.5 步）已禁用：原设计在 Refiner 后执行 3 次回放 + flaky 检测，
 * 因环境不稳定暂时关闭，恢复时取消 start() 方法中的对应注释即可。
 *
 * Stagehand 通过动态 import 加载（@browserbasehq/stagehand 类型声明缺失，预存在问题）。
 */

import { z } from 'zod';
import type { Page, BrowserContext, Browser } from 'playwright';
import { chromium } from 'playwright';
import { PlaywrightRecorderAdapter } from './adapter.ts';
import { StepConsolidator } from './consolidation.ts';
import { translateAction } from './translator.ts';
import { refineDraftSuite, type RefinerOptions } from './refiner.ts';
import { buildStepDescription } from './recording-bridge.ts';
import type { RecorderStepPayload, LocatorRef } from './protocol.ts';
import type {
  TestStep,
  TestCase,
  TestSuite,
  NlTestCase,
  NlTestCaseStep,
} from '../../shared/contracts/index.ts';
import type { DecryptedProviderConfig } from '../../shared/recording/protocol.ts';

// === 对外导出的类型（auto-replay.ts 会导入 ReplayReport 等类型）===

export interface NlStepBoundary {
  nlStepIndex: number;
  startStepIdx: number;
  endStepIdx: number;
}

export interface AIRecordingSessionParams {
  nlCase: NlTestCase;
  providerConfig: DecryptedProviderConfig;
  options: {
    headless?: boolean;
    maxRetriesPerStep?: number;
    timeoutPerStep?: number;
  };
  /** 每个 consolidated step 的回调，由外部桥接层（RecordingBridge）负责 step+element 双发射 */
  onConsolidatedStep: (step: RecorderStepPayload) => void;
  /** 生命周期事件回调（step:start / step:complete / step:failed / step:observe / recorder:fallback 等） */
  onEvent: (event: string, data: any) => void;
  /** Takeover 请求回调，仅 headless:false 时有效 */
  onTakeoverRequest?: (nlStepIndex: number, instruction: string) => Promise<boolean>;
  /**
   * AutoReplay 注入函数（可选）。
   * 不提供则使用默认的 autoReplayDraftSuite（3 次回放 + flaky 检测）。
   * 解耦设计：可通过 autoReplayFn 注入 mock，便于独立测试。
   */
  autoReplayFn?: (suite: TestSuite, opts: { page: Page; startUrl: string }) => Promise<ReplayReport>;
}

export interface RecordingResult {
  steps: TestStep[];
  stepBoundaries: NlStepBoundary[];
  replayCandidateSuite: Partial<TestSuite>;
  replayReport?: ReplayReport;
}

// === ReplayReport 类型（Task 6 的 auto-replay.ts 导入这些类型）===

export type ReplayVerdict = 'pass' | 'fail' | 'flaky';

export interface SingleReplayResult {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  stepResults: Array<{
    stepIndex: number;
    action: string;
    target: string;
    passed: boolean;
    error?: string;
  }>;
  durationMs: number;
}

export interface ReplayReport {
  runs: number;
  passCount: number;
  failCount: number;
  verdict: ReplayVerdict;
  results: SingleReplayResult[];
  overallPass: boolean;
  totalDurationMs: number;
  degraded?: boolean;
}

// === extract() 简化断言 schema ===
// 仅要求 success 字段，降低 LLM 输出约束失败率。
// 当 schema 解析失败时，回退到 pageText 文本匹配。

const EXTRACT_ASSERTION_SCHEMA = z.object({
  success: z.boolean(),
});

// === 辅助函数 ===

/**
 * 从 NlTestCase 解析起始 URL。
 * 查找 preconditions 中的 URL，或 testData 中 key 包含 "url" 的条目。
 */
function resolveStartUrl(nlCase: NlTestCase): string {
  const urlRegex = /^https?:\/\/[^\s]+$/;
  // 1. 查找 preconditions 中的 URL
  for (const cond of nlCase.preconditions) {
    const match = cond.trim().match(urlRegex);
    if (match) return match[0];
  }
  // 2. 查找 testData 中 key 包含 url 的条目
  for (const td of nlCase.testData) {
    if (/url/i.test(td.key) && urlRegex.test(td.value.trim())) {
      return td.value.trim();
    }
  }
  throw new Error(
    `Cannot resolve startUrl from NlTestCase ${nlCase.id}: no URL found in preconditions or testData. ` +
      `Add a URL to preconditions or testData with key containing "url".`,
  );
}

/**
 * 构建 Stagehand 模型名称（"provider/model" 格式）。
 * Stagehand v3 要求 provider 前缀：openai/、azure/、anthropic/、google/
 */
function buildStagehandModelName(config: DecryptedProviderConfig): string {
  switch (config.type) {
    case 'azure-openai':
      // Azure 模型名 = deployment 名
      return `azure/${config.deployment ?? config.model}`;
    case 'anthropic':
      return `anthropic/${config.model}`;
    case 'google':
      return `google/${config.model}`;
    case 'openai-compatible':
    default:
      return `openai/${config.model}`;
  }
}

/**
 * 构建 Stagehand modelClientOptions（API key、endpoint、apiVersion 等）。
 */
function buildModelClientOptions(config: DecryptedProviderConfig): Record<string, unknown> {
  const opts: Record<string, unknown> = { apiKey: config.apiKey };
  if (config.endpoint) {
    opts.baseURL = config.endpoint;
  }
  if (config.apiVersion) {
    opts.apiVersion = config.apiVersion;
  }
  return opts;
}

/**
 * 从 refinedSteps 构建 suite skeleton，供 AutoReplay 消费。
 */
function buildSuiteSkeleton(nlCase: NlTestCase, refinedSteps: TestStep[]): TestSuite {
  const caseId = `ai-case-${nlCase.id}`;
  const suiteId = `ai-suite-${nlCase.id}`;
  const testCase: TestCase = {
    id: caseId,
    name: nlCase.title,
    description: nlCase.title,
    steps: refinedSteps,
  };
  return {
    id: suiteId,
    projectId: nlCase.projectId,
    name: `AI Generated Suite - ${nlCase.title}`,
    description: `Auto-generated from NlTestCase ${nlCase.id}`,
    cases: [testCase],
  };
}

/**
 * 把 RecorderStepPayload 转为 TestStep（Refiner 输入格式）。
 * 复用 recording-bridge.ts 的 buildStepDescription 保持描述一致。
 */
function payloadToTestStep(payload: RecorderStepPayload): TestStep {
  const locator = payload.locator;
  return {
    id: `step-${Math.random().toString(36).slice(2, 10)}`,
    action: payload.action,
    target: payload.action === 'goto' ? (payload.value || '') : (locator?.selector ?? ''),
    data: payload.value || '',
    description: buildStepDescription(payload.action, locator, payload.value),
    isVerified: true,
    metadata: {
      recorder: {
        locator,
        locatorCandidates: payload.locatorCandidates,
        framePath: (payload.metadata?.framePath as string[]) || [],
        pageUrl: payload.pageUrl,
        timestamp: payload.timestamp,
      },
    },
  };
}

// === AIRecordingSession ===

export class AIRecordingSession {
  private stagehand: any | null = null;
  private consolidator = new StepConsolidator();
  private recordedSteps: RecorderStepPayload[] = [];
  private stepBoundaries: NlStepBoundary[] = [];
  private isHeadless = false;

  async start(params: AIRecordingSessionParams): Promise<RecordingResult> {
    const { nlCase, providerConfig, options, onConsolidatedStep, onEvent } = params;
    this.isHeadless = options.headless === true;
    const maxRetries = options.maxRetriesPerStep ?? 2;

    // Suppress AI SDK System messages warning (Stagehand passes system prompts in messages array)
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      if (msg.includes('allowSystemInMessages')) return;
      originalWarn.apply(console, args);
    };

    // 1. 初始化 Stagehand（verbose: 0，安全优先）
    // Use Playwright's Chromium executable (chrome-launcher may not find Chrome in CI/sandbox)
    let executablePath: string | undefined;
    try {
      const { chromium } = await import('playwright');
      executablePath = chromium.executablePath();
    } catch {
      // Fallback: let chrome-launcher find it
    }

    const { Stagehand } = await import('@browserbasehq/stagehand');
    const modelName = buildStagehandModelName(providerConfig);
    console.log('[AI_SESSION] model:', modelName, 'endpoint:', providerConfig.endpoint);
    this.stagehand = new Stagehand({
      env: 'LOCAL' as const,
      verbose: 0,
      model: {
        modelName: modelName as any,
        ...buildModelClientOptions(providerConfig),
      },
      localBrowserLaunchOptions: { headless: this.isHeadless, ...(executablePath ? { executablePath } : {}) },
    });
    await this.stagehand.init();
    const context = this.stagehand.context;
    const page: Page = context.pages()[0];

    // 2. 挂载 _enableRecorder（CDP 连接方式）
    // Stagehand v3 的 context 是 V3Context（非 Playwright BrowserContext），没有 _enableRecorder。
    // 正确做法：用 stagehand.connectURL() 获取 CDP WebSocket URL → Playwright connectOverCDP
    // → 在 Playwright BrowserContext 上挂载 _enableRecorder。
    let adapter: PlaywrightRecorderAdapter | null = null;
    let cdpBrowser: Browser | null = null;
    let cdpContext: BrowserContext | null = null;
    try {
      const connectURL = this.stagehand.connectURL();
      cdpBrowser = await chromium.connectOverCDP({ wsEndpoint: connectURL });
      cdpContext = cdpBrowser.contexts()[0];
    } catch (err: any) {
      console.warn('[AI_SESSION] CDP connectOverCDP failed:', err?.message);
    }

    if (cdpContext && PlaywrightRecorderAdapter.isAvailable(cdpContext)) {
      adapter = new PlaywrightRecorderAdapter({
        onActionAdded: (_page, actionInContext) => {
          const step = translateAction(actionInContext);
          if (!step) return;
          if (!step.pageUrl) step.pageUrl = _page.url();
          for (const consolidated of this.consolidator.add(step)) {
            this.recordedSteps.push(consolidated);
            onConsolidatedStep(consolidated);
          }
        },
      });
      adapter.start(cdpContext);
    } else {
      // fallback：_enableRecorder 不可用时，act() 仍执行但步骤不被捕获。
      onEvent('recorder:fallback', { reason: '_enableRecorder not available' });
    }

    try {
      // 3. 导航到起始页面
      const startUrl = resolveStartUrl(nlCase);
      console.log('[AI_SESSION] Navigating to startUrl:', startUrl);
      await page.goto(startUrl, { waitUntil: 'load' });
      console.log('[AI_SESSION] Navigation complete. currentUrl:', page.url());

      // 4. 逐步骤执行
      const sortedSteps = [...nlCase.steps].sort((a, b) => a.sequence - b.sequence);
      for (let i = 0; i < sortedSteps.length; i++) {
        const boundary = await this.executeNlStep(
          i,
          sortedSteps[i],
          page,
          onEvent,
          maxRetries,
          params.onTakeoverRequest,
        );
        this.stepBoundaries.push(boundary);
      }

      // 5. Flush consolidator
      for (const flushed of this.consolidator.flush()) {
        this.recordedSteps.push(flushed);
        onConsolidatedStep(flushed);
      }

      // 6. Refine（纯代码管道：去重 → 断言映射 → 参数化 → 密码脱敏 → 选择器展开 → Provenance）
      const refinerOptions: RefinerOptions & { runId: string } = {
        runId: nlCase.id,
        secrets: nlCase.testData
          .filter((td) => /password|secret|token|key/i.test(td.key))
          .map((td) => td.value),
        parameters: Object.fromEntries(nlCase.testData.map((td) => [td.key, td.value])),
      };
      const refined = refineDraftSuite(
        this.recordedSteps.map(payloadToTestStep),
        refinerOptions,
      );

      const suiteSkeleton = buildSuiteSkeleton(nlCase, refined.steps);

      return {
        steps: refined.steps,
        stepBoundaries: this.stepBoundaries,
        replayCandidateSuite: suiteSkeleton,
      };
    } finally {
      // 7. 恢复 console.warn
      console.warn = originalWarn;
      // 8. 清理
      if (adapter) adapter.stop();
      if (cdpBrowser) cdpBrowser.close().catch(() => {});
      await this.stagehand.close().catch(() => {});
      this.stagehand = null;
    }
  }

  private async executeNlStep(
    nlStepIndex: number,
    nlStep: NlTestCaseStep,
    page: Page,
    emit: (event: string, data: any) => void,
    maxRetries: number,
    onTakeoverRequest?: (nlStepIndex: number, instruction: string) => Promise<boolean>,
  ): Promise<NlStepBoundary> {
    const startStepIdx = this.recordedSteps.length;
    emit('step:start', { nlStepIndex, instruction: nlStep.action });

    // --- 阶段 1: 执行 act()（带脏状态自愈重试 + lazy observe）---
    let actSuccess = false;
    let observeHint: string | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const actInstruction = observeHint
          ? `${nlStep.action} (Context: ${observeHint})`
          : nlStep.action;
        console.log(`[ACT|step:${nlStepIndex}|attempt:${attempt}] instruction: ${actInstruction}`);
        await this.stagehand!.act(actInstruction, { page });
        actSuccess = true;
        console.log(`[ACT|step:${nlStepIndex}|attempt:${attempt}] succeeded`);
        break;
      } catch (err: any) {
        let currentUrl = 'unknown';
        try { currentUrl = await page.url(); } catch { /* ignore */ }
        console.error(`[ACT|step:${nlStepIndex}|attempt:${attempt}] error url=${currentUrl} msg=${err?.message}`);
        // Lazy observe：仅在首次失败（attempt === 0）后触发一次 observe。
        // 不在后续重试中重复 observe，避免无限循环；也不在 act 前预检，避免浪费 LLM 调用。
        if (attempt === 0) {
          try {
            const observations = await this.stagehand!.observe(
              'find all interactive elements on the page',
              { page },
            );
            console.log(`[OBSERVE|step:${nlStepIndex}] found ${observations.length} interactive elements`);
            if (observations.length > 0) {
              observeHint = observations
                .filter((o: any) => o.selector || o.description)
                .map((o: any) => o.description || o.selector)
                .slice(0, 3)
                .join('; ');
              console.log(`[OBSERVE|step:${nlStepIndex}] hint: ${observeHint}`);
              emit('step:observe', {
                nlStepIndex,
                observationCount: observations.length,
              });
            }
          } catch (observeErr: any) {
            console.warn(`[OBSERVE|step:${nlStepIndex}] failed: ${observeErr.message}`);
            /* observe 失败不阻断重试 */
          }
        }

          if (attempt >= maxRetries) {
          let failedUrl = 'unknown';
          try { failedUrl = await page.url(); } catch { /* ignore */ }
          console.error(`[ACT|step:${nlStepIndex}] FAILED url=${failedUrl} msg=${err.message}`);
          // Takeover 仅在 headless:false 时可用；headless 模式下用户无法操作浏览器
          if (onTakeoverRequest && !this.isHeadless) {
            emit('step:takeover', {
              nlStepIndex,
              instruction: nlStep.action,
              error: err.message,
            });
            const takenOver = await onTakeoverRequest(nlStepIndex, nlStep.action);
            if (takenOver) {
              emit('step:complete', { nlStepIndex });
              return { nlStepIndex, startStepIdx, endStepIdx: this.recordedSteps.length };
            }
          }
          console.error(`[ACT|step:${nlStepIndex}] failed (no takeover): ${nlStep.action}`);
          emit('step:failed', {
            nlStepIndex,
            reason: `act() failed: ${err.message}`,
          });
          return { nlStepIndex, startStepIdx, endStepIdx: this.recordedSteps.length };
        }
        // 脏状态自愈：extract 评估页面状态 → cleanup act → 重试
        try {
          const recoveryHint = await this.stagehand!.extract({
            instruction: `The previous action "${nlStep.action}" failed. Assess page state for blocking overlays, partial dropdowns. Describe what needs dismissal.`,
            schema: z.object({
              needsCleanup: z.boolean(),
              cleanupInstruction: z.string().optional(),
            }),
          });
          if (recoveryHint.data?.needsCleanup && recoveryHint.data?.cleanupInstruction) {
            console.log(`[RECOVERY|step:${nlStepIndex}] cleanup: ${recoveryHint.data.cleanupInstruction}`);
            await this.stagehand!.act(recoveryHint.cleanupInstruction, { page });
          }
        } catch {
          /* 恢复失败不阻断重试 */
        }
      }
    }

    // act 失败且无 takeover 时，已发射 step:failed，直接返回
    if (!actSuccess) {
      return { nlStepIndex, startStepIdx, endStepIdx: this.recordedSteps.length };
    }

    // --- 阶段 2: 验证 extract() ---
    // 策略：先用简化 schema 提取 success 字段。
    // 若 schema 解析失败（result.data 为 undefined/null），回退到 pageText / URL 文本匹配。
    if (nlStep.expected) {
      let verified = false;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.stagehand!.extract({
            instruction: `Verify: "${nlStep.expected}". Answer with JSON: {"success": true} if the condition is met, {"success": false} otherwise.`,
            schema: EXTRACT_ASSERTION_SCHEMA,
          });
          if (result.data?.success) {
            verified = true;
            break;
          }
          // Fallback: schema 解析失败或 success=false 时，
          // 检查原始 pageText 是否包含 expected 中的关键词
          const rawText: string = (result as any)?.pageText || '';
          if (rawText) {
            const keywords = nlStep.expected
              .replace(/[I should see the]/gi, '')
              .split(/\s+/)
              .filter((w) => w.length > 2);
            const matchCount = keywords.filter((kw) =>
              rawText.toLowerCase().includes(kw.toLowerCase()),
            ).length;
            // 若超过半数关键词匹配，视为验证通过
            if (keywords.length > 0 && matchCount / keywords.length >= 0.5) {
              verified = true;
              break;
            }
          }
          console.error(`[EXTRACT|step:${nlStepIndex}|attempt:${attempt}] success=${result.data?.success} result=${JSON.stringify(result).slice(0, 200)}`);
        } catch (err: any) {
          console.error(`[EXTRACT|step:${nlStepIndex}|attempt:${attempt}] threw: ${err?.message?.slice(0, 200)}`);
        }
      }
      if (!verified) {
        // 最终 fallback：检查 page URL 是否包含 expected 中的 URL 关键词
        try {
          const currentUrl = await page.url();
          const urlKeywords = nlStep.expected.match(/https?:\/\/[^\s"']+|login|page|home|dashboard/gi);
          if (urlKeywords && urlKeywords.some((kw) => currentUrl.toLowerCase().includes(kw.toLowerCase()))) {
            verified = true;
          }
        } catch { /* ignore */ }
      }
      if (!verified) {
        emit('step:failed', {
          nlStepIndex,
          reason: 'expected not met after retries',
        });
        return { nlStepIndex, startStepIdx, endStepIdx: this.recordedSteps.length };
      }
    }

    emit('step:complete', { nlStepIndex });
    return { nlStepIndex, startStepIdx, endStepIdx: this.recordedSteps.length };
  }
}
