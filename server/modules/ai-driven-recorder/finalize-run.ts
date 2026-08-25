/**
 * Finalize Run — AI 录制 run 完成/失败的共享持久化逻辑
 *
 * 从 ws-relay.handleAiRecorderComplete 提取，供 Agent 中继（ws-relay）与
 * 本地执行器（local runner）共用同一实现，保证 SSE/持久化行为一致。
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §1.2 (Server 职责) 和 §5 (产物落地)
 */

import { Log } from '../../shared/services/logger';
import type { SSEGateway } from '../ai-test-gen/sse-gateway.ts';
import type { AiDrivenRecorderRepository } from './repository.ts';
import { saveDraftSuite } from './draft-suite-saver.ts';
import { saveSuite } from '../suites/repository.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import type { TestSuite, TestCase, TestStep } from '../../../shared/contracts/index.ts';

export interface FinalizeRunDeps {
  repository: AiDrivenRecorderRepository;
  sseGateway: SSEGateway;
}

/**
 * 持久化一次成功完成的 run：
 *   1. 保存 refined steps（预分配 suiteId/caseId 时更新已有 suite；否则创建新的 draft suite）
 *   2. 更新 run 状态为 completed + 写入 replayReport
 *   3. SSE 广播 run:complete
 */
export function finalizeRunCompletion(
  deps: FinalizeRunDeps,
  params: {
    runId: string;
    suiteId: string;
    caseId: string;
    refinedSteps?: unknown[];
    replayReport?: unknown;
  },
): { suiteId: string; caseId: string } {
  const { repository, sseGateway } = deps;
  const { runId, replayReport } = params;

  const run = repository.getRun(runId);
  if (!run) {
    Log.for('finalize-run').warn(`AI recorder completion for unknown run: ${runId}`);
    return { suiteId: '', caseId: '' };
  }

  // 保存 refined steps（如果已预分配 suiteId/caseId，则更新 existing suite；否则创建新的）
  let suiteId = params.suiteId || run.result_suite_id || '';
  let caseId = params.caseId || run.result_case_id || '';

  if (params.refinedSteps && params.refinedSteps.length > 0) {
    if (suiteId && caseId) {
      // 预分配路径：更新已有的 suite/case 为 refined steps
      const nlCase = nlCaseRepo.get(run.nl_case_id);
      const caseTitle = nlCase?.title ?? `AI Recorded Case (${run.nl_case_id})`;
      const testCase: TestCase = {
        id: caseId,
        name: caseTitle,
        description: `AI 驱动录制生成，关联 NlCase: ${run.nl_case_id}`,
        steps: params.refinedSteps as TestStep[],
      };
      const suite: TestSuite = {
        id: suiteId,
        projectId: run.project_id,
        name: `[AI Draft] ${caseTitle}`,
        description: `AI 驱动录制生成的草稿套件，来源 NlCase: ${run.nl_case_id}`,
        cases: [testCase],
        position: 0,
      };
      saveSuite(suite);
      if (nlCase) {
        nlCaseRepo.save({ ...nlCase, generatedSuiteId: suiteId });
      }
    } else {
      // 兜底：创建新的 draft suite
      const saved = saveDraftSuite(run.project_id, run.nl_case_id, {
        steps: params.refinedSteps as TestStep[],
      });
      suiteId = saved.suiteId;
      caseId = saved.caseId;
    }
  }

  // 更新 DB
  repository.updateRunResult(runId, {
    suiteId: suiteId || undefined,
    caseId: caseId || undefined,
    replayReport,
  });
  repository.updateRunStatus(runId, 'completed');

  // SSE 广播
  sseGateway.emit(runId, 'run:complete', {
    runId,
    suiteId,
    caseId,
    replayReport,
    durationMs: run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0,
  });

  return { suiteId, caseId };
}

/**
 * 持久化一次失败的 run：
 *   1. 先复查 run 是否仍存在（已删除的 run 不能复活 SSE emitter / 覆盖状态）
 *   2. 更新 run 状态为 failed + 写入 error
 *   3. SSE 广播 run:error
 */
export function finalizeRunFailure(
  deps: FinalizeRunDeps,
  params: { runId: string; error: string },
): void {
  const { repository, sseGateway } = deps;
  const { runId, error } = params;

  // 已删除的 run：不做任何写入/广播（避免复活 SSE emitters 或覆盖最终状态）
  if (!repository.getRun(runId)) {
    return;
  }

  repository.updateRunStatus(runId, 'failed', error);
  sseGateway.emit(runId, 'run:error', { runId, error });
}
