import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';

const mockRepo = vi.hoisted(() => ({
  getCacheStore: vi.fn(() => ({
    getCache: vi.fn(),
    setCache: vi.fn(),
    invalidateByPromptVersion: vi.fn(),
    invalidateAll: vi.fn(),
  })),
  markRunFailed: vi.fn(),
  getRun: vi.fn(),
  getRunWithThreadId: vi.fn(),
  insertAuditLog: vi.fn(),
  setRunRunning: vi.fn(),
  deleteRun: vi.fn(),
  updateThreadId: vi.fn(),
  setCheckpointData: vi.fn(),
}));

vi.mock('../infrastructure/db/test-gen-repository.ts', () => ({
  pipelineRepo: mockRepo,
  decryptApiKey: vi.fn((key: string) => key),
}));

vi.mock('../application/batch-orchestrator.ts', () => ({
  BatchOrchestrator: vi.fn(),
}));

vi.mock('../../../../shared/ai/provider.ts', () => ({
  createAIProviderWithFallback: vi.fn(),
}));

vi.mock('../../../../shared/ai-test-gen/test-generation.ts', () => ({
  createTestGenerationPipeline: vi.fn(),
}));

vi.mock('../../requirements/repository.ts', () => ({
  requirementRepo: { listByProject: vi.fn(() => []) },
}));

vi.mock('../../requirements/index-generator.ts', () => ({
  buildRequirementIndex: vi.fn(() => []),
}));

vi.mock('../../business-flows/repository.ts', () => ({
  businessFlowRepo: { listByProject: vi.fn(() => []) },
}));

vi.mock('../../nl-cases/repository.ts', () => ({
  nlCaseRepo: { save: vi.fn() },
}));

import { TestGenService } from '../application/test-gen-service.ts';

describe('TestGenService', () => {
  let service: TestGenService;
  let sseGateway: SSEGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = new SSEGateway();
    service = new TestGenService(sseGateway);
  });

  describe('abortRun', () => {
    it('marks run as failed in repo', () => {
      service.abortRun('run-1');
      expect(mockRepo.markRunFailed).toHaveBeenCalledWith('run-1');
    });
  });

  describe('deleteRun', () => {
    it('deletes run and cleans up SSE', () => {
      sseGateway.getEmitter('run-1');
      service.deleteRun('run-1');
      expect(mockRepo.deleteRun).toHaveBeenCalledWith('run-1');
    });
  });

  describe('resumeRun', () => {
    it('throws if run is not WAITING_REVIEW', () => {
      mockRepo.getRunWithThreadId.mockReturnValue({ status: 'RUNNING' });
      expect(() => service.resumeRun('run-1', 'approve')).toThrow('not waiting for review');
    });

    it('inserts audit log and sets run to RUNNING', () => {
      mockRepo.getRunWithThreadId.mockReturnValue({
        status: 'WAITING_REVIEW',
        phase: 'review-conditions',
        thread_id: 'thread-1',
        checkpoint_data: {},
        config: {},
        project_id: 'proj-1',
        mode: 'auto',
        current_batch: 0,
      });
      service.resumeRun('run-1', 'approve', 'looks good', { conditions: [] });
      expect(mockRepo.insertAuditLog).toHaveBeenCalledWith(
        'run-1', 'review-conditions', 'approve', { conditions: [] },
      );
      expect(mockRepo.setRunRunning).toHaveBeenCalledWith('run-1');
    });
  });
});