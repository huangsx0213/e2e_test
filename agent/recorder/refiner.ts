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

import type { TestStep } from '../../shared/contracts/index.ts';
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
    if (!step.data) return step;
    const paramName = valueToParam.get(step.data);
    return paramName ? { ...step, data: `\${${paramName}}` } : step;
  });
}

/**
 * 把敏感值替换为 ***，避免明文落盘到 draft suite。
 * secrets 是需要脱敏的明文值列表（如密码、token）。
 */
export function redactSecrets(steps: TestStep[], secrets: string[]): TestStep[] {
  if (secrets.length === 0) return steps;
  const secretSet = new Set(secrets);
  return steps.map(step => {
    if (!step.data) return step;
    return secretSet.has(step.data) ? { ...step, data: '***' } : step;
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
