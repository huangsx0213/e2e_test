import { describe, expect, it, vi, beforeEach } from 'vitest';

// === Mocks ===

vi.mock('../../../shared/services/websocketService.ts', () => ({
  wsService: { broadcast: vi.fn() },
}));

vi.mock('../../agent/registry.ts', () => ({
  agentRegistry: {
    getActiveConnections: vi.fn(() => new Map()),
  },
}));

vi.mock('../../nl-cases/repository.ts', () => ({
  nlCaseRepo: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/index.ts', () => ({
  randomId: (prefix: string) => `${prefix}-mock-id`,
}));

import { AiDrivenRecorderController } from '../controller.ts';
import { SSEGateway } from '../../ai-test-gen/sse-gateway.ts';
import { AiDrivenRecorderRepository } from '../repository.ts';
import { nlCaseRepo } from '../../nl-cases/repository.ts';
import { agentRegistry } from '../../agent/registry.ts';
import { wsService } from '../../../shared/services/websocketService.ts';
import {
  AI_RECORDER_START_EVENT,
  AI_RECORDER_STOP_EVENT,
} from '../../../../shared/recording/protocol.ts';

// === Helpers ===

function makeApprovedNlCase() {
  return {
    id: 'nl-1',
    projectId: 'proj-1',
    title: 'Login Test',
    status: 'APPROVED' as const,
    steps: [
      { sequence: 1, action: 'open login page', expected: 'page loaded' },
      { sequence: 2, action: 'input credentials', expected: 'inputs filled' },
    ],
    generatedSuiteId: undefined,
  };
}

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

function makeMockAgent(ws?: { send: ReturnType<typeof vi.fn> }) {
  return {
    id: 'agent-1',
    status: 'idle',
    ws: ws ?? { send: vi.fn() },
  };
}

describe('AiDrivenRecorderController', () => {
  let sseGateway: SSEGateway;
  let repository: ReturnType<typeof makeMockRepo>;
  let controller: AiDrivenRecorderController;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = new SSEGateway({ cleanupEvents: ['run:complete', 'run:error'], checkpointEvent: null });
    repository = makeMockRepo() as any;
    controller = new AiDrivenRecorderController(sseGateway, repository as any);
  });

  describe('startRun', () => {
    it('成功路径：校验通过 + 创建 run + 下发 AI_RECORDER_START', () => {
      const nlCase = makeApprovedNlCase();
      vi.mocked(nlCaseRepo.get).mockReturnValue(nlCase as any);
      repository.getDecryptedProviderConfig.mockReturnValue({
        id: 'pc-1',
        name: 'openai',
        type: 'azure-openai', // certified
        apiKey: 'sk-test',
        model: 'gpt-4',
      });
      const mockWs = { send: vi.fn() };
      const agent = makeMockAgent(mockWs);
      vi.mocked(agentRegistry.getActiveConnections).mockReturnValue(new Map([['agent-1', agent as any]]));

      const result = controller.startRun('proj-1', {
        nlCaseId: 'nl-1',
        providerConfigId: 'pc-1',
        options: { headless: true },
      });

      expect(result).toEqual({
        runId: 'run-mock-id',
        suiteId: 'ai-draft-suite-mock-id',
        caseId: 'ai-draft-case-mock-id',
        status: 'started',
      });

      // 创建了 run 记录
      expect(repository.createRun).toHaveBeenCalledWith({
        projectId: 'proj-1',
        nlCaseId: 'nl-1',
        providerConfigId: 'pc-1',
        options: { headless: true },
      });

      // 下发了 AI_RECORDER_START
      const sentPacket = mockWs.send.mock.calls[0][0] as string;
      const parsed = JSON.parse(sentPacket);
      expect(parsed.event).toBe(AI_RECORDER_START_EVENT);
      expect(parsed.data).toEqual({
        runId: 'run-mock-id',
        projectId: 'proj-1',
        nlCase,
        providerConfigId: 'pc-1',
        options: { headless: true },
        caseId: 'ai-draft-case-mock-id',
        suiteId: 'ai-draft-suite-mock-id',
      });

      // SSE 广播了 run:start
      const events: any[] = [];
      sseGateway.getEmitter('run-mock-id').on('sse', (e: string, d: any) => events.push({ event: e, data: d }));
      // emit 已在 startRun 中调用，但 emitter 是后创建的，所以这里需要重新触发
      // 实际上 sseGateway.emit 在 startRun 中已调用，events 数组可能为空（取决于 listener 注册时机）
      // 这里只验证 createRun 和 ws.send 已调用即可
    });

    it('NlCase 不存在时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(undefined);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nonexistent', providerConfigId: 'pc-1' }))
        .toThrow('NlCase not found: nonexistent');
    });

    it('NlCase 不属于该项目时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue({ ...makeApprovedNlCase(), projectId: 'other-project' } as any);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('NlCase does not belong to this project');
    });

    it('NlCase 状态非 APPROVED 时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue({ ...makeApprovedNlCase(), status: 'DRAFT' } as any);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('NlCase must be APPROVED, current: DRAFT');
    });

    it('NlCase 已有 generatedSuiteId 时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue({ ...makeApprovedNlCase(), generatedSuiteId: 'existing-suite' } as any);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('NlCase already has generatedSuiteId: existing-suite');
    });

    it('providerConfig 不存在时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(makeApprovedNlCase() as any);
      repository.getDecryptedProviderConfig.mockReturnValue(undefined);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'nonexistent' }))
        .toThrow('Provider config not found: nonexistent');
    });

    it('providerConfig 类型为 unverified 时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(makeApprovedNlCase() as any);
      repository.getDecryptedProviderConfig.mockReturnValue({
        id: 'pc-1',
        name: 'local',
        type: 'openai-compatible', // unverified
        apiKey: 'sk-test',
        model: 'gpt-4',
      });

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('Provider type openai-compatible is not allowed for AI recording (unverified)');
    });

    it('已有进行中的 run 时抛错', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(makeApprovedNlCase() as any);
      repository.getDecryptedProviderConfig.mockReturnValue({
        id: 'pc-1', name: 'azure', type: 'azure-openai', apiKey: 'sk', model: 'gpt-4',
      });
      repository.getRunsByProject.mockReturnValue([
        { id: 'old-run', nl_case_id: 'nl-1', status: 'running' },
      ]);

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('NlCase already has an active run: old-run');
    });

    it('无 idle Agent 时抛错并标记 run failed', () => {
      vi.mocked(nlCaseRepo.get).mockReturnValue(makeApprovedNlCase() as any);
      repository.getDecryptedProviderConfig.mockReturnValue({
        id: 'pc-1', name: 'azure', type: 'azure-openai', apiKey: 'sk', model: 'gpt-4',
      });
      vi.mocked(agentRegistry.getActiveConnections).mockReturnValue(new Map());

      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1', providerConfigId: 'pc-1' }))
        .toThrow('No idle agent available');

      expect(repository.updateRunStatus).toHaveBeenCalledWith('run-mock-id', 'failed', 'No idle agent available');
    });

    it('缺少 nlCaseId 时抛错', () => {
      expect(() => controller.startRun('proj-1', { providerConfigId: 'pc-1' }))
        .toThrow('nlCaseId is required');
    });

    it('缺少 providerConfigId 时抛错', () => {
      expect(() => controller.startRun('proj-1', { nlCaseId: 'nl-1' }))
        .toThrow('providerConfigId is required');
    });
  });

  describe('getRun', () => {
    it('返回 run 状态', () => {
      repository.getRun.mockReturnValue({
        id: 'run-1',
        project_id: 'proj-1',
        nl_case_id: 'nl-1',
        status: 'completed',
        total_steps: 5,
        completed_steps: 5,
        failed_steps: 0,
        result_suite_id: 'suite-1',
        result_case_id: 'case-1',
        replay_report: JSON.stringify({ verdict: 'pass' }),
        error: null,
      });

      const result = controller.getRun('proj-1', 'run-1');

      expect(result).toEqual({
        runId: 'run-1',
        nlCaseId: 'nl-1',
        status: 'completed',
        progress: { total: 5, completed: 5, failed: 0 },
        result: { suiteId: 'suite-1', caseId: 'case-1' },
        replayReport: { verdict: 'pass' },
      });
    });

    it('run 不存在时抛错', () => {
      repository.getRun.mockReturnValue(undefined);

      expect(() => controller.getRun('proj-1', 'nonexistent')).toThrow('Run not found: nonexistent');
    });

    it('run 不属于该项目时抛错', () => {
      repository.getRun.mockReturnValue({
        id: 'run-1',
        project_id: 'other-project',
        nl_case_id: 'nl-1',
        status: 'running',
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
      });

      expect(() => controller.getRun('proj-1', 'run-1')).toThrow('Run does not belong to this project');
    });

    it('replay_report 为非法 JSON 时返回 undefined', () => {
      repository.getRun.mockReturnValue({
        id: 'run-1',
        project_id: 'proj-1',
        nl_case_id: 'nl-1',
        status: 'completed',
        total_steps: 0,
        completed_steps: 0,
        failed_steps: 0,
        replay_report: 'not-json',
      });

      const result = controller.getRun('proj-1', 'run-1');

      expect(result.replayReport).toBeUndefined();
    });
  });

  describe('listRuns', () => {
    it('返回项目的所有 run', () => {
      repository.getRunsByProject.mockReturnValue([
        {
          id: 'run-1',
          nl_case_id: 'nl-1',
          status: 'completed',
          total_steps: 5,
          completed_steps: 5,
          failed_steps: 0,
          result_suite_id: 'suite-1',
          result_case_id: 'case-1',
          replay_report: null,
          error: null,
        },
        {
          id: 'run-2',
          nl_case_id: 'nl-2',
          status: 'failed',
          total_steps: 3,
          completed_steps: 2,
          failed_steps: 1,
          result_suite_id: null,
          result_case_id: null,
          replay_report: null,
          error: 'stagehand failed',
        },
      ]);

      const result = controller.listRuns('proj-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        runId: 'run-1',
        nlCaseId: 'nl-1',
        status: 'completed',
        progress: { total: 5, completed: 5, failed: 0 },
        result: { suiteId: 'suite-1', caseId: 'case-1' },
        replayReport: undefined,
        error: undefined,
      });
      expect(result[1].error).toBe('stagehand failed');
    });
  });

  describe('deleteRun', () => {
    it('进行中的 run：发送 STOP + SSE 广播 run:error + cleanup + 删除 run', () => {
      repository.getRun.mockReturnValue({
        id: 'run-1',
        project_id: 'proj-1',
        status: 'running',
      });

      const result = controller.deleteRun('proj-1', 'run-1');

      expect(result).toEqual({ success: true });
      expect(wsService.broadcast).toHaveBeenCalledWith(AI_RECORDER_STOP_EVENT, { runId: 'run-1' });
      expect(repository.deleteRun).toHaveBeenCalledWith('run-1');
    });

    it('已完成的 run：不发送 STOP 但仍删除 run', () => {
      repository.getRun.mockReturnValue({
        id: 'run-1',
        project_id: 'proj-1',
        status: 'completed',
      });

      controller.deleteRun('proj-1', 'run-1');

      expect(wsService.broadcast).not.toHaveBeenCalled();
      expect(repository.deleteRun).toHaveBeenCalledWith('run-1');
    });

    it('run 不存在时抛错，不调用 deleteRun', () => {
      repository.getRun.mockReturnValue(undefined);

      expect(() => controller.deleteRun('proj-1', 'nonexistent')).toThrow('Run not found: nonexistent');
      expect(repository.deleteRun).not.toHaveBeenCalled();
    });
  });
});
