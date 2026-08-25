/**
 * Refiner — 纯代码精炼管道
 *
 * 把 AIRecordingSession 产出的 raw TestStep[] 精炼为可回放、可维护的 draft suite。
 * 全部为同步纯函数，无 LLM 调用，无 IO，便于测试和复用。
 *
 * 管道顺序（每一步的输出是下一步的输入）：
 *   1. dedupeSteps       — 去除连续重复步骤（AI 录制常见噪声）
 *   2. mapAssertions     — 识别 assert/verify 动作并标记 isAssertion
 *   3. parameterize      — 把已知参数值替换为 ${paramName} 模板
 *   4. redactSecrets     — 把敏感值替换为 ***（不落盘明文）
 *   5. expandSelectors   — 把 locatorCandidates 展开为 allLocators 数组（回放容错）
 *   6. markProvenance    — 标记来源为 ai-recorder + runId，便于审计和回溯
 *
 * 设计原则：
 *   - 每个函数都是 (steps, opts) => steps，可独立测试和组合
 *   - 不修改输入数组，返回新数组（immutability）
 *   - 不依赖任何外部状态或 IO
 */

import type { TestStep, NlTestCaseTestData, StepAssertion, AssertionSource, AssertionOperator } from '../../shared/contracts/index.ts';
import type { LocatorRef } from './protocol.ts';

export interface RefinerOptions {
  secrets?: string[];
  parameters?: Record<string, string>;
}

export interface RefinedSuite {
  steps: TestStep[];
  provenance: {
    source: 'ai-recorder';
    runId: string;
    refinedAt: string;
  };
}

export interface ProvenanceInfo {
  source: 'ai-recorder';
  runId: string;
  ts: number;
}

/**
 * 完整管道入口。runId 用于 provenance 标记。
 */
export function refineDraftSuite(
  rawSteps: TestStep[],
  options: RefinerOptions & { runId?: string } = {},
): RefinedSuite {
  const runId = options.runId ?? 'unknown';
  let steps = dedupeSteps(rawSteps);
  steps = mapAssertions(steps);
  steps = applyAiAssertions(steps);
  steps = parameterize(steps, options.parameters ?? {});
  steps = redactSecrets(steps, options.secrets ?? []);
  steps = expandSelectors(steps);
  steps = markProvenance(steps, { source: 'ai-recorder', runId, ts: Date.now() });
  return {
    steps,
    provenance: { source: 'ai-recorder', runId, refinedAt: new Date().toISOString() },
  };
}

/**
 * 去除连续重复步骤（相同 action+target+data）。
 * AI 录制时 Stagehand 可能重试同一动作，产生连续重复。
 */
export function dedupeSteps(steps: TestStep[]): TestStep[] {
  if (steps.length === 0) return [];
  const result: TestStep[] = [steps[0]];
  for (let i = 1; i < steps.length; i++) {
    const prev = result[result.length - 1];
    const curr = steps[i];
    if (prev.action !== curr.action || prev.target !== curr.target || prev.data !== curr.data) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * 识别断言类动作并标记 isAssertion。
 * 约定：action 以 assert/verify 开头的步骤为断言。
 */
export function mapAssertions(steps: TestStep[]): TestStep[] {
  return steps.map(step => {
    const isAssertion = /^(assert|verify)/i.test(step.action);
    return isAssertion ? { ...step, isAssertion } : step;
  });
}

// === AI 断言挂载 ===

/** 录制元数据里允许的 UI 断言 source / operator 白名单（与执行引擎 assertions.ts 对齐） */
const AI_ASSERTION_SOURCES: readonly AssertionSource[] = [
  'UI_TEXT', 'UI_VALUE', 'UI_ATTRIBUTE', 'UI_PAGE_URL', 'UI_PAGE_TITLE',
  'UI_ELEMENT_VISIBLE', 'UI_ELEMENT_ENABLED', 'UI_ELEMENT_CHECKED', 'UI_ELEMENT_COUNT',
];
const AI_ASSERTION_OPERATORS: readonly AssertionOperator[] = [
  'EQUALS', 'CONTAINS', 'NOT_EQUALS', 'NOT_CONTAINS', 'EXISTS', 'MATCHES_REGEX',
];

export interface AiAssertionProposal {
  source: string;
  operator: string;
  expectedValue?: string;
  /** 生成来源的 expected 原文，用于 message 溯源 */
  expectedText?: string;
}

/**
 * 把录制元数据中的 AI 断言建议（metadata.aiAssertion）转为 StepAssertion。
 * 校验 source/operator 枚举与 expectedValue 必填性，非法建议静默丢弃。
 * message 带 "AI:" 前缀溯源，用户可在 Test Designer 中编辑或删除。
 */
export function applyAiAssertions(steps: TestStep[]): TestStep[] {
  return steps.map(step => {
    const meta = (step.metadata as any)?.aiAssertion as AiAssertionProposal | undefined;
    if (!meta || typeof meta !== 'object') return step;
    if (!AI_ASSERTION_SOURCES.includes(meta.source as AssertionSource)) return step;
    if (!AI_ASSERTION_OPERATORS.includes(meta.operator as AssertionOperator)) return step;
    const needsExpectedValue = meta.operator !== 'EXISTS' && meta.operator !== 'NOT_EXISTS';
    if (needsExpectedValue && (!meta.expectedValue || typeof meta.expectedValue !== 'string')) return step;

    const assertion: StepAssertion = {
      id: `assert-${step.id}`,
      source: meta.source as AssertionSource,
      operator: meta.operator as AssertionOperator,
      ...(meta.expectedValue ? { expectedValue: meta.expectedValue } : {}),
      message: `AI generated from expected: "${(meta.expectedText ?? '').slice(0, 150)}"`,
    };
    return { ...step, assertions: [...(step.assertions ?? []), assertion] };
  });
}

/**
 * 把已知参数值替换为 ${paramName} 模板语法。
 * 例如 parameters = { username: 'admin' }，则 data='admin' → data='${username}'。
 */
export function parameterize(steps: TestStep[], parameters: Record<string, string>): TestStep[] {
  if (Object.keys(parameters).length === 0) return steps;
  // 反向映射：value -> paramName（取第一个匹配）
  const valueToParam = new Map<string, string>();
  for (const [name, value] of Object.entries(parameters)) {
    if (!valueToParam.has(value)) valueToParam.set(value, name);
  }
  return steps.map(step => {
    let next: TestStep = { ...step };
    if (next.data) {
      const paramName = valueToParam.get(next.data);
      if (paramName) next = { ...next, data: `\${${paramName}}` };
    }
    // 断言期望值同步参数化（如 UI_VALUE EQUALS admin → ${username}）
    if (next.assertions && next.assertions.length > 0) {
      next = {
        ...next,
        assertions: next.assertions.map(a =>
          a.expectedValue && valueToParam.has(a.expectedValue)
            ? { ...a, expectedValue: `\${${valueToParam.get(a.expectedValue)!}}` }
            : a,
        ),
      };
    }
    return next;
  });
}

/**
 * 精确匹配脱敏：值等于任一 secret 时替换为 ***（与 redactSecrets 同规则）。
 * 仅做全串精确匹配，不做子串替换；空值安全。
 */
export function redactValue(value: string, secrets: string[]): string {
  if (!value || secrets.length === 0) return value;
  return secrets.includes(value) ? '***' : value;
}

/**
 * 从 nlCase.testData 提取敏感明文值列表。
 * key 命中 password/secret/token/key（不区分大小写）即视为敏感，
 * 与 refiner options 构建处共用，保证两份列表永不漂移。
 */
export function extractSecretValues(testData: NlTestCaseTestData[]): string[] {
  return (testData ?? [])
    .filter((td) => /password|secret|token|key/i.test(td.key))
    .map((td) => td.value);
}

/**
 * 把敏感值替换为 ***，避免明文落盘到 draft suite。
 * secrets 是需要脱敏的明文值列表（如密码、token）。
 * 同时覆盖断言期望值（如密码输入值断言）。
 */
export function redactSecrets(steps: TestStep[], secrets: string[]): TestStep[] {
  if (secrets.length === 0) return steps;
  return steps.map(step => {
    let next: TestStep = step.data
      ? { ...step, data: redactValue(step.data, secrets) }
      : step;
    if (next.assertions && next.assertions.length > 0) {
      next = {
        ...next,
        assertions: next.assertions.map(a =>
          a.expectedValue ? { ...a, expectedValue: redactValue(a.expectedValue, secrets) } : a,
        ),
      };
    }
    return next;
  });
}

/**
 * 把 locatorCandidates 展开到 allLocators 字段，供回放时容错尝试多个选择器。
 * allLocators = [primary, ...candidates]
 */
export function expandSelectors(steps: TestStep[]): TestStep[] {
  return steps.map(step => {
    const recorder = (step.metadata as any)?.recorder;
    if (!recorder) return step;
    const primary: LocatorRef | undefined = recorder.locator;
    const candidates: LocatorRef[] = Array.isArray(recorder.locatorCandidates) ? recorder.locatorCandidates : [];
    if (!primary && candidates.length === 0) return step;
    const allLocators = [primary, ...candidates].filter(Boolean) as LocatorRef[];
    return {
      ...step,
      metadata: {
        ...step.metadata,
        recorder: { ...recorder, allLocators },
      },
    };
  });
}

/**
 * 标记每个步骤的 provenance（来源），便于审计和回溯。
 */
export function markProvenance(steps: TestStep[], info: ProvenanceInfo): TestStep[] {
  return steps.map(step => ({
    ...step,
    metadata: {
      ...step.metadata,
      provenance: { source: info.source, runId: info.runId, ts: info.ts },
    },
  }));
}
