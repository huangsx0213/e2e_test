/**
 * AI Recorder 步骤日志持久化（Agent 与 Local 两条执行路径共用）
 *
 * 在 step:complete / step:failed 终态事件时写入 ai_driven_recording_step_logs，
 * log_details 携带每步时间线日志与验证警告，供历史加载与 UI 展开展示。
 * 同一步骤重复上报时覆盖旧行（按 run_id + nl_step_index）。
 */
import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';

export interface StepLogPersistParams {
  runId: string;
  nlStepIndex: number;
  instruction?: string;
  expected?: string;
  success: boolean;
  error?: string;
  retryCount?: number;
  durationMs?: number;
  recordedStepCount?: number;
  verificationWarning?: string;
  logs?: Array<{ t: number; level: string; message: string }>;
}

export function persistStepLog(params: StepLogPersistParams): void {
  const logDetails: Record<string, unknown> = {};
  if (params.verificationWarning) logDetails.verificationWarning = params.verificationWarning;
  if (params.logs && params.logs.length > 0) logDetails.logs = params.logs;
  db.prepare(`
    DELETE FROM ai_driven_recording_step_logs
    WHERE run_id = ? AND nl_step_index = ?
  `).run(params.runId, params.nlStepIndex);

  db.prepare(`
    INSERT INTO ai_driven_recording_step_logs
      (id, run_id, nl_step_index, instruction, expected, success,
       recorded_step_count, retry_count, duration_ms, error, log_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomId('ai-rec-step'),
    params.runId,
    params.nlStepIndex,
    params.instruction ?? '',
    params.expected ?? null,
    params.success ? 1 : 0,
    params.recordedStepCount ?? 0,
    params.retryCount ?? 0,
    params.durationMs ?? null,
    // 只有真实失败才写 error；成功/带警告的步骤不得伪造错误文本
    params.error ?? null,
    Object.keys(logDetails).length > 0 ? JSON.stringify(logDetails) : null,
  );
}
