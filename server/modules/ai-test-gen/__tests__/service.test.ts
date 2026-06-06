import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SSEGateway } from '../sse-gateway.ts';
import { Orchestrator } from '../orchestrator.ts';

const mockRepo = vi.hoisted(() => ({
  getCacheStore: vi.fn(() => ({
    getCache: vi.fn(), setCache: vi.fn(),
    invalidateByPromptVersion: vi.fn(), invalidateAll: vi.fn(),
  })),
  markRunFailed: vi.fn(), markRunCompleted: vi.fn(),
  getRun: vi.fn(), getRunWithThreadId: vi.fn(),
  insertAuditLog: vi.fn(), setRunRunning: vi.fn(),
  deleteRun: vi.fn(), updateThreadId: vi.fn(),
  setRunWaiting: vi.fn(), touchRun: vi.fn(),
  getWaitingRuns: vi.fn(() => []),
  getActiveProviderConfig: vi.fn(), getProviderConfigByName: vi.fn(),
  getProviderConfig: vi.fn(),
  updateProviderInfo: vi.fn(), updateBatchCount: vi.fn(), updateCurrentBatch: vi.fn(),
  getMonthlyTokenUsage: vi.fn(() => 0),
  listRunsByProject: vi.fn(() => []), getActiveRun: vi.fn(() => null),
  getRunInfo: vi.fn(() => null), getAgentLogs: vi.fn(() => []), getAuditLogs: vi.fn(() => []),
  createRun: vi.fn(),
  updateAgentLogOutput: vi.fn(),
}));

vi.mock('../repository.ts', () => ({
  pipelineRepo: mockRepo,
  decryptApiKey: vi.fn((key: string) => key),
}));

vi.mock('../../shared/db/client.ts', () => ({
  db: {
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
}));

describe('Orchestrator', () => {
  let sseGateway: SSEGateway;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = new SSEGateway();
    orchestrator = new Orchestrator(sseGateway);
  });

  it('emits pipeline:error when aborting a run', () => {
    const events: any[] = [];
    sseGateway.getEmitter('run-1').on('sse', (e, d) => events.push({ event: e, data: d }));

    orchestrator.abort('run-1');

    expect(mockRepo.markRunFailed).toHaveBeenCalledWith('run-1');
  });

  it('emits pipeline:error when deleting a run', () => {
    orchestrator.delete('run-1');

    expect(mockRepo.deleteRun).toHaveBeenCalledWith('run-1');
  });
});