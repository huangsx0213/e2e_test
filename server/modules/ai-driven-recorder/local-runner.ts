/**
 * LocalRecordingRunner — 本地（Server 进程内）AI 录制执行器
 *
 * 复用 Agent 端的 AIRecordingSession，在 Server 进程内执行录制：
 *   - 进度事件经 onEvent 直接写入 SSEGateway（与 ws-relay 的 agent 路径同构）
 *   - live consolidated step 经 bridgeConsolidatedStep 发射 step/element，
 *     默认走 RecordingService 持久化（与人工录制一致），无 bridge 时回退 SSE
 *   - 终态复用共享的 finalize-run（completed/run:complete 与 failed/run:error）
 *   - takeover 等待经 run-registry 句柄被 ws-relay 的 TAKEOVER_COMPLETE 唤醒
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §3.1、
 * docs/superpowers/specs/2026-08-23-ai-recorder-local-server-design.md
 */

import { Log } from '../../shared/services/logger';
import { ConflictError } from '../../shared/http/errors.ts';
import type { SSEGateway } from '../ai-test-gen/sse-gateway.ts';
import type { AiDrivenRecorderRepository } from './repository.ts';
import { finalizeRunCompletion, finalizeRunFailure } from './finalize-run.ts';
import { persistStepLog } from './step-log-persistence.ts';
import { registerLocalRun, unregisterLocalRun } from './run-registry.ts';
import {
  AIRecordingSession,
  SessionAbortedError,
} from '../../../agent/recorder/ai-recording-session.ts';
import { bridgeConsolidatedStep } from '../../../agent/recorder/recording-bridge.ts';
import { extractSecretValues } from '../../../agent/recorder/refiner.ts';
import type { NlTestCase } from '../../../shared/contracts/index.ts';
import type { DecryptedProviderConfig } from '../../../shared/recording/protocol.ts';

export interface LocalStartParams {
  runId: string;
  projectId: string;
  nlCase: NlTestCase;
  providerConfig: DecryptedProviderConfig;
  options: Record<string, any>;
  /** 显式起始 URL 覆盖（已由 controller 规范化）；缺省时由会话从用例解析 */
  startUrl?: string;
  caseId: string;
  suiteId: string;
}

export class LocalRecordingRunner {
  private readonly sseGateway: SSEGateway;
  private readonly repository: AiDrivenRecorderRepository;
  private readonly recordingBridge?:
    | {
        handleStepRecorded(d: any): void;
        handleElementRecorded(d: any): void;
      }
    | undefined;
  private readonly maxConcurrentRuns?: number | undefined;
  private readonly takeoverTimeoutMs?: number | undefined;

  /** 当前占用的并发槽位数 */
  private active = 0;

  /** runId → 待唤醒的 takeover resolver（TAKEOVER_COMPLETE 经 run-registry 路由到这里） */
  private takeoverResolvers = new Map<string, (value: boolean) => void>();

  /** runId → takeover 超时定时器（run 收尾时统一清理） */
  private takeoverTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: {
    sseGateway: SSEGateway;
    repository: AiDrivenRecorderRepository;
    recordingBridge?: {
      handleStepRecorded(d: any): void;
      handleElementRecorded(d: any): void;
    };
    maxConcurrentRuns?: number;
    takeoverTimeoutMs?: number;
  }) {
    this.sseGateway = deps.sseGateway;
    this.repository = deps.repository;
    this.recordingBridge = deps.recordingBridge;
    this.maxConcurrentRuns = deps.maxConcurrentRuns;
    this.takeoverTimeoutMs = deps.takeoverTimeoutMs;
  }

  /**
   * 并发容量：env AI_RECORDER_MAX_LOCAL_RUNS > 构造参数 > 默认 1；最小 clamp 到 1。
   */
  capacity(): number {
    const raw = Number.parseInt(process.env.AI_RECORDER_MAX_LOCAL_RUNS ?? '', 10);
    const configured = Number.isNaN(raw) ? (this.maxConcurrentRuns ?? 1) : raw;
    return Math.max(1, configured);
  }

  /** 容量预检：超限抛 409（controller 在任何副作用之前调用） */
  assertCapacity(): void {
    if (this.active >= this.capacity()) {
      throw new ConflictError('Local recorder is busy: concurrent local run limit reached');
    }
  }

  /** 同步返回：占用槽位后异步执行，避免 HTTP 201 被录制时长阻塞 */
  start(params: LocalStartParams): void {
    this.assertCapacity();
    this.active += 1;
    void this.execute(params);
  }

  private async execute(params: LocalStartParams): Promise<void> {
    const { runId, projectId, nlCase, providerConfig, caseId, suiteId, startUrl } = params;
    let options = params.options;
    const abortController = new AbortController();
    registerLocalRun(runId, {
      abort: () => {
        abortController.abort();
        // delete-during-takeover：立即解除挂起的等待（解析 false），不再阻塞到超时
        const timer = this.takeoverTimers.get(runId);
        if (timer) clearTimeout(timer);
        this.takeoverTimers.delete(runId);
        const resolver = this.takeoverResolvers.get(runId);
        this.takeoverResolvers.delete(runId);
        resolver?.(false);
      },
      resolveTakeover: (value) => this.takeoverResolvers.get(runId)?.(value),
    });

    try {
      // live consolidated step 会立即持久化，发射前按与 refiner 同一份 secrets
      // （同规则同来源）脱敏，避免明文密码/token 落库
      const secrets = extractSecretValues((nlCase as any).testData ?? []);

      // spec §6 headless 兜底：仅对省略该选项的 API 调用方默认无头，
      // config panel 显式传值时原样透传
      options = { ...options, headless: (options as any).headless ?? true };

      const session = new AIRecordingSession();
      const result = await session.start({
        nlCase,
        providerConfig,
        options,
        signal: abortController.signal,
        ...(startUrl ? { startUrl } : {}),
        onConsolidatedStep: (step) => {
          bridgeConsolidatedStep(step, projectId, caseId, suiteId, {
            secrets,
            emitStepRecorded: (data) => {
              if (this.recordingBridge) {
                this.recordingBridge.handleStepRecorded(data);
              } else {
                this.sseGateway.emit(runId, 'step-recorded', data);
              }
            },
            emitElementRecorded: (data) => {
              if (this.recordingBridge) {
                this.recordingBridge.handleElementRecorded(data);
              } else {
                this.sseGateway.emit(runId, 'element-recorded', data);
              }
            },
          });
        },
        onEvent: (event, data) => {
          // 终态步骤事件：持久化步骤日志（与 agent 路径 ws-relay 行为一致）
          if (event === 'step:complete' || event === 'step:failed') {
            try {
              persistStepLog({
                runId,
                nlStepIndex: Number(data?.nlStepIndex),
                instruction: data?.instruction,
                expected: data?.expected,
                success: event === 'step:complete',
                error: data?.error,
                retryCount: data?.retryCount,
                durationMs: data?.durationMs,
                recordedStepCount: data?.recordedStepCount,
                verificationWarning: data?.verificationWarning,
                logs: data?.logs,
              });
            } catch (persistErr: any) {
              Log.for('local-runner').warn(`step log persist failed: ${persistErr?.message}`);
            }
          }
          // 进度事件附带 runId/caseId/suiteId（与 agent 路径的 id 注入一致）
          this.sseGateway.emit(runId, event, { ...data, runId, caseId, suiteId });
        },
        onTakeoverRequest: async (_nlStepIndex: number, _instruction: string) => {
          // step:takeover 已由 session 内部 emit，此处仅等待
          // TAKEOVER_COMPLETE（经 registry 句柄）或超时
          return new Promise<boolean>((resolve) => {
            // 同一 run 的前一个 takeover 等待作废（清掉旧 timer，避免泄漏）
            const previousTimer = this.takeoverTimers.get(runId);
            if (previousTimer) clearTimeout(previousTimer);

            const timer = setTimeout(() => {
              this.takeoverTimers.delete(runId);
              this.takeoverResolvers.delete(runId);
              resolve(false);
            }, this.takeoverTimeoutMs ?? 120_000);

            this.takeoverTimers.set(runId, timer);
            this.takeoverResolvers.set(runId, resolve);
          });
        },
      });

      finalizeRunCompletion(
        { repository: this.repository, sseGateway: this.sseGateway },
        {
          runId,
          suiteId,
          caseId,
          refinedSteps: result.steps,
          replayReport: result.replayReport,
        },
      );
    } catch (error) {
      const aborted = error instanceof SessionAbortedError;
      // 用户主动中止是正常终态，不打错误日志
      if (!aborted) {
        Log.for('local-runner').error(
          `Local AI recording failed: ${(error as Error)?.message ?? String(error)}`,
        );
      }
      finalizeRunFailure(
        { repository: this.repository, sseGateway: this.sseGateway },
        {
          runId,
          error: aborted ? 'Recording aborted by user' : String((error as Error)?.message ?? error),
        },
      );
    } finally {
      const timer = this.takeoverTimers.get(runId);
      if (timer) clearTimeout(timer);
      this.takeoverTimers.delete(runId);
      this.takeoverResolvers.delete(runId);
      unregisterLocalRun(runId);
      this.active -= 1;
    }
  }
}
