import { describe, expect, it, vi, beforeEach } from 'vitest';

// === Mocks ===

vi.mock('../../suites/repository.ts', () => ({
  saveSuite: vi.fn(),
}));

vi.mock('../../nl-cases/repository.ts', () => ({
  nlCaseRepo: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('../draft-suite-saver.ts', () => ({
  saveDraftSuite: vi.fn(),
}));

import { finalizeRunCompletion, finalizeRunFailure } from '../finalize-run.ts';
import { saveDraftSuite } from '../draft-suite-saver.ts';
import { saveSuite } from '../../suites/repository.ts';
import { nlCaseRepo } from '../../nl-cases/repository.ts';

// === Helpers ===

function makeMockRepo() {
  return {
    createRun: vi.fn(() => 'run-mock-id'),
    getRun: vi.fn(),
    getRunsByProject: vi.fn(() => []),
    updateRunStatus: vi.fn(),
    updateRunResult: vi.fn(),
    updateRunProgress: vi.fn(),
    deleteRun: vi.fn(),
    getDecryptedProviderConfig: vi.fn(),
    insertStepLog: vi.fn(),
    getStepLogs: vi.fn(() => []),
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    project_id: 'proj-1',
    nl_case_id: 'nl-1',
    provider_config_id: null,
    status: 'running',
    execution_mode: 'agent',
    started_at: new Date().toISOString(),
    completed_at: null,
    total_steps: 0,
    completed_steps: 0,
    failed_steps: 0,
    result_suite_id: null,
    result_case_id: null,
    replay_report: null,
    error: null,
    options: null,
    token_usage: null,
    ...overrides,
  };
}

function makeNlCase() {
  return {
    id: 'nl-1',
    projectId: 'proj-1',
    title: 'Login Test',
    status: 'APPROVED' as const,
    steps: [
      { sequence: 1, action: 'open login page', expected: 'page loaded' },
    ],
    generatedSuiteId: undefined,
  };
}

describe('finalize-run', () => {
  let repository: ReturnType<typeof makeMockRepo>;
  let sseGateway: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = makeMockRepo();
    sseGateway = { emit: vi.fn() };
  });

  describe('finalizeRunCompletion', () => {
    it('Case A: 预分配 ids 时更新已有 suite/case 并回填 generatedSuiteId', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(makeNlCase() as any);
      repository.getRun.mockReturnValue(makeRunRow());

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        {
          runId: 'r1',
          suiteId: 's1',
          caseId: 'c1',
          refinedSteps: [{ id: 'x' }],
          replayReport: { verdict: 'pass' },
        },
      );

      // 更新预分配的 suite（包含 case c1 与 refined steps）
      expect(saveSuite).toHaveBeenCalledTimes(1);
      expect(vi.mocked(saveSuite).mock.calls[0][0]).toMatchObject({
        id: 's1',
        projectId: 'proj-1',
        cases: [expect.objectContaining({ id: 'c1', steps: [{ id: 'x' }] })],
      });
      expect(saveDraftSuite).not.toHaveBeenCalled();

      // 回填 NlTestCase.generatedSuiteId
      expect(nlCaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nl-1', generatedSuiteId: 's1' }),
      );

      // 更新 DB
      expect(repository.updateRunResult).toHaveBeenCalledWith('r1', {
        suiteId: 's1',
        caseId: 'c1',
        replayReport: { verdict: 'pass' },
      });
      expect(repository.updateRunStatus).toHaveBeenCalledWith('r1', 'completed');

      // SSE 广播 run:complete
      expect(sseGateway.emit).toHaveBeenCalledTimes(1);
      expect(sseGateway.emit).toHaveBeenCalledWith(
        'r1',
        'run:complete',
        expect.objectContaining({
          runId: 'r1',
          suiteId: 's1',
          caseId: 'c1',
          replayReport: { verdict: 'pass' },
          durationMs: expect.any(Number),
        }),
      );

      expect(result).toEqual({ suiteId: 's1', caseId: 'c1' });
    });

    it('Case A 变体: 仅 suiteId 而缺 caseId 时也走 saveDraftSuite 兜底（要求两者都非空）', () => {
      repository.getRun.mockReturnValue(makeRunRow());
      vi.mocked(saveDraftSuite).mockReturnValue({ suiteId: 's9', caseId: 'c9' });

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        {
          runId: 'r1',
          suiteId: 's1',
          caseId: '',
          refinedSteps: [{ id: 'x' }],
        },
      );

      expect(saveDraftSuite).toHaveBeenCalledWith('proj-1', 'nl-1', { steps: [{ id: 'x' }] });
      expect(saveSuite).not.toHaveBeenCalled();
      expect(result).toEqual({ suiteId: 's9', caseId: 'c9' });
    });

    it('Case B: 空 ids 时通过 saveDraftSuite 创建新 draft suite', () => {
      repository.getRun.mockReturnValue(makeRunRow());
      vi.mocked(saveDraftSuite).mockReturnValue({ suiteId: 's9', caseId: 'c9' });

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        {
          runId: 'r1',
          suiteId: '',
          caseId: '',
          refinedSteps: [{ id: 'y' }],
          replayReport: { verdict: 'fail' },
        },
      );

      expect(saveDraftSuite).toHaveBeenCalledWith('proj-1', 'nl-1', { steps: [{ id: 'y' }] });
      expect(saveSuite).not.toHaveBeenCalled();
      expect(repository.updateRunResult).toHaveBeenCalledWith('r1', {
        suiteId: 's9',
        caseId: 'c9',
        replayReport: { verdict: 'fail' },
      });
      expect(sseGateway.emit).toHaveBeenCalledWith(
        'r1',
        'run:complete',
        expect.objectContaining({ suiteId: 's9', caseId: 'c9' }),
      );
      expect(result).toEqual({ suiteId: 's9', caseId: 'c9' });
    });

    it('Case B 变体: params 为空但 run 行已有 result_suite_id/case_id 时复用行内值', () => {
      repository.getRun.mockReturnValue(
        makeRunRow({ result_suite_id: 'row-suite', result_case_id: 'row-case' }),
      );
      vi.mocked(saveDraftSuite).mockReturnValue({ suiteId: 's9', caseId: 'c9' });

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        { runId: 'r1', suiteId: '', caseId: '', refinedSteps: [{ id: 'z' }] },
      );

      // 行内已有完整 ids → 走预分配更新路径而非兜底
      expect(saveSuite).toHaveBeenCalled();
      expect(saveDraftSuite).not.toHaveBeenCalled();
      expect(result).toEqual({ suiteId: 'row-suite', caseId: 'row-case' });
    });

    it('无 refinedSteps 时不落任何 suite，仅更新状态并广播', () => {
      repository.getRun.mockReturnValue(makeRunRow());

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        { runId: 'r1', suiteId: '', caseId: '' },
      );

      expect(saveSuite).not.toHaveBeenCalled();
      expect(saveDraftSuite).not.toHaveBeenCalled();
      expect(repository.updateRunResult).toHaveBeenCalledWith('r1', {
        suiteId: undefined,
        caseId: undefined,
        replayReport: undefined,
      });
      expect(repository.updateRunStatus).toHaveBeenCalledWith('r1', 'completed');
      expect(result).toEqual({ suiteId: '', caseId: '' });
    });

    it('Case C: 未知 run 时不做任何写入/广播，返回空 ids', () => {
      repository.getRun.mockReturnValue(undefined);

      const result = finalizeRunCompletion(
        { repository: repository as any, sseGateway: sseGateway as any },
        {
          runId: 'ghost-run',
          suiteId: 's1',
          caseId: 'c1',
          refinedSteps: [{ id: 'x' }],
          replayReport: { verdict: 'pass' },
        },
      );

      expect(result).toEqual({ suiteId: '', caseId: '' });
      expect(saveSuite).not.toHaveBeenCalled();
      expect(saveDraftSuite).not.toHaveBeenCalled();
      expect(nlCaseRepo.save).not.toHaveBeenCalled();
      expect(repository.updateRunResult).not.toHaveBeenCalled();
      expect(repository.updateRunStatus).not.toHaveBeenCalled();
      expect(sseGateway.emit).not.toHaveBeenCalled();
    });
  });

  describe('finalizeRunFailure', () => {
    it('Case D: 标记 failed + SSE 广播 run:error', () => {
      repository.getRun.mockReturnValue(makeRunRow());

      finalizeRunFailure(
        { repository: repository as any, sseGateway: sseGateway as any },
        { runId: 'r1', error: 'stagehand init failed' },
      );

      expect(repository.updateRunStatus).toHaveBeenCalledTimes(1);
      expect(repository.updateRunStatus).toHaveBeenCalledWith('r1', 'failed', 'stagehand init failed');
      expect(repository.updateRunResult).not.toHaveBeenCalled();
      expect(sseGateway.emit).toHaveBeenCalledTimes(1);
      expect(sseGateway.emit).toHaveBeenCalledWith('r1', 'run:error', {
        runId: 'r1',
        error: 'stagehand init failed',
      });
    });

    it('Case C 变体: 已删除/未知 run 时不做任何写入/广播', () => {
      repository.getRun.mockReturnValue(undefined);

      finalizeRunFailure(
        { repository: repository as any, sseGateway: sseGateway as any },
        { runId: 'deleted-run', error: 'boom' },
      );

      expect(repository.updateRunStatus).not.toHaveBeenCalled();
      expect(sseGateway.emit).not.toHaveBeenCalled();
    });
  });
});
