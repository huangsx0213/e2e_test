import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';

const mockPipelineRepo = vi.hoisted(() => ({
  updateBatchCount: vi.fn(),
  getProviderConfigByName: vi.fn(),
  getActiveProviderConfig: vi.fn(),
  getMonthlyTokenUsage: vi.fn(() => 0),
  updateProviderInfo: vi.fn(),
  updateCurrentBatch: vi.fn(),
  setCheckpointData: vi.fn(),
  getRun: vi.fn(),
  getProviderConfig: vi.fn(),
  markRunFailed: vi.fn(),
  insertAuditLog: vi.fn(),
  setRunRunning: vi.fn(),
  deleteRun: vi.fn(),
  listRunsByProject: vi.fn(),
  getCacheStore: vi.fn(() => ({
    getCache: vi.fn(),
    setCache: vi.fn(),
    invalidateByPromptVersion: vi.fn(),
    invalidateAll: vi.fn(),
  })),
}));

const mockRequirementRepo = vi.hoisted(() => ({ listByProject: vi.fn() }));
const mockBuildRequirementIndex = vi.hoisted(() => vi.fn());
const mockNlCaseRepo = vi.hoisted(() => ({ save: vi.fn() }));
const mockBusinessFlowRepo = vi.hoisted(() => ({ listByProject: vi.fn(() => []) }));
const mockBuildBusinessFlowBlueprints = vi.hoisted(() => vi.fn(() => []));
const mockCreateAIProviderWithFallback = vi.hoisted(() => vi.fn());
const mockCreateNlPipeline = vi.hoisted(() => vi.fn());
const mockComputePromptVersion = vi.hoisted(() => vi.fn(() => 'test-version'));
const mockDecryptApiKey = vi.hoisted(() => vi.fn((key: string) => key));

const mockTestGenPersister = vi.hoisted(() => vi.fn(() => ({
  saveAgentLog: vi.fn(),
  updateRunStatus: vi.fn(),
  insertAuditLog: vi.fn(),
})));

vi.mock('../infrastructure/db/test-gen-repository.ts', () => ({
  pipelineRepo: mockPipelineRepo,
  decryptApiKey: mockDecryptApiKey,
}));

vi.mock('../../requirements/repository.ts', () => ({ requirementRepo: mockRequirementRepo }));
vi.mock('../../requirements/index-generator.ts', () => ({ buildRequirementIndex: mockBuildRequirementIndex }));
vi.mock('../../nl-cases/repository.ts', () => ({ nlCaseRepo: mockNlCaseRepo }));
vi.mock('../../business-flows/repository.ts', () => ({ businessFlowRepo: mockBusinessFlowRepo }));
vi.mock('../business-flow-blueprint.ts', () => ({ buildBusinessFlowBlueprints: mockBuildBusinessFlowBlueprints }));
vi.mock('../../../../shared/ai/provider.ts', () => ({ createAIProviderWithFallback: mockCreateAIProviderWithFallback }));
vi.mock('../../../../shared/ai-test-gen/test-generation.ts', () => ({ createNlPipeline: mockCreateNlPipeline }));
vi.mock('../../../../shared/ai/prompt-version.ts', () => ({ computePromptVersion: mockComputePromptVersion }));
vi.mock('../test-gen-persister.ts', () => ({ RunPersister: {}, TestGenPersister: mockTestGenPersister }));

import { TestGenService } from '../application/test-gen-service.ts';

const PROVIDER_CONFIG = {
  id: 'cfg-1', name: 'test-provider', type: 'azure-openai',
  endpoint: 'https://test.openai.azure.com', encrypted_api_key: 'enc-key',
  deployment: 'gpt-4o', api_version: '2024-02-01', model: 'gpt-4o',
  is_active: 1, monthly_token_limit: null, fallback_config_ids: '[]',
};

function captureEvents(sseGateway: SSEGateway, runId: string): { event: string; data: any }[] {
  const events: { event: string; data: any }[] = [];
  const emitter = sseGateway.getEmitter(runId);
  emitter.on('sse', (event: string, payload: any) => {
    events.push({ event, data: payload });
  });
  return events;
}

function makeIndexItem(id: string, overrides: Record<string, any> = {}): any {
  return {
    id, title: `Item ${id}`, level: 0, parent: null, dependencies: [],
    tags: [], priority: 'MEDIUM', summary: '', testType: ['functional'],
    childCount: 0, children: [], ...overrides,
  };
}

function makeRequirement(overrides: Record<string, any> = {}): any {
  return {
    id: 'req-1', projectId: 'proj-1', parentId: null,
    title: 'Login Feature', description: 'User login',
    level: 'epic', priority: 'MEDIUM', status: 'APPROVED',
    tags: [], dependencies: [], position: 0, metadata: {},
    ...overrides,
  };
}

function makeFakePipeline(): any {
  return {
    async *stream() {
      yield {
        phase: 'complete',
        finalTestCases: [{ id: 'tc-1', title: 'Login test', priority: 'high', steps: [] }],
      };
    },
    invoke: vi.fn(),
    nodes: {},
  };
}

describe('startPipeline e2e', () => {
  let service: TestGenService;
  let sseGateway: SSEGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = new SSEGateway();
    service = new TestGenService(sseGateway, 10);
  });

  describe('happy path', () => {
    it('completes a single-batch auto pipeline run', async () => {
      mockBuildRequirementIndex.mockReturnValue([
        makeIndexItem('epic-1', { title: 'Login', level: 0, childCount: 1, children: ['req-1'] }),
        makeIndexItem('req-1', { title: 'Login page', level: 1, parent: 'epic-1' }),
      ]);
      mockRequirementRepo.listByProject.mockReturnValue([makeRequirement({ id: 'req-1', parentId: 'epic-1' })]);
      mockPipelineRepo.getProviderConfigByName.mockReturnValue(PROVIDER_CONFIG);
      const fakeProvider = { chat: vi.fn(), streamChat: vi.fn() };
      mockCreateAIProviderWithFallback.mockReturnValue(fakeProvider);
      mockCreateNlPipeline.mockResolvedValue(makeFakePipeline());
      const events = captureEvents(sseGateway, 'run-1');

      await service.startPipeline('run-1', 'proj-1', {
        requirementIds: ['req-1'], providerConfigName: 'test-provider', mode: 'auto',
      });

      expect(mockBuildRequirementIndex).toHaveBeenCalledWith('proj-1');
      expect(mockPipelineRepo.getProviderConfigByName).toHaveBeenCalledWith('test-provider');
      expect(mockPipelineRepo.updateBatchCount).toHaveBeenCalledWith('run-1', 1);
      expect(mockCreateAIProviderWithFallback).toHaveBeenCalled();
      expect(mockCreateNlPipeline).toHaveBeenCalledWith(
        fakeProvider, expect.anything(), expect.anything(),
        expect.objectContaining({ modelName: 'gpt-4o', promptVersion: 'test-version' }),
        expect.anything(),
      );
      expect(mockPipelineRepo.updateCurrentBatch).toHaveBeenCalledWith('run-1', 1);

      const persisterInstance = mockTestGenPersister.mock.results[0].value;
      expect(persisterInstance.updateRunStatus).toHaveBeenCalledWith(
        'run-1', 'COMPLETED', 'complete', expect.objectContaining({ total_tokens: 0 }),
      );

      expect(mockNlCaseRepo.save).toHaveBeenCalledTimes(1);
      expect(mockNlCaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tc-1', title: 'Login test', projectId: 'proj-1' }),
      );

      const eventNames = events.map(e => e.event);
      expect(eventNames).toContain('phase:start');
      expect(eventNames).toContain('pipeline:budget');
      expect(eventNames).toContain('batch:start');
      expect(eventNames).toContain('batch:complete');
      expect(eventNames).toContain('pipeline:complete');

      const pipelineCompleteEvent = events.find(e => e.event === 'pipeline:complete');
      expect(pipelineCompleteEvent?.data).toMatchObject({
        summary: expect.stringContaining('1 test cases'),
        stats: expect.objectContaining({ totalCases: 1, totalBatches: 1 }),
      });
    });
  });

  describe('error handling', () => {
    it('fails when no requirements match selected IDs', async () => {
      mockBuildRequirementIndex.mockReturnValue([]);
      mockRequirementRepo.listByProject.mockReturnValue([]);
      mockPipelineRepo.getActiveProviderConfig.mockReturnValue(PROVIDER_CONFIG);
      const events = captureEvents(sseGateway, 'run-1');

      await service.startPipeline('run-1', 'proj-1', {
        requirementIds: ['nonexistent'], mode: 'auto',
      });

      expect(mockCreateAIProviderWithFallback).not.toHaveBeenCalled();
      expect(mockNlCaseRepo.save).not.toHaveBeenCalled();

      const errorEvent = events.find(e => e.event === 'pipeline:error');
      expect(errorEvent?.data).toMatchObject({
        phase: 'orchestrator',
        message: expect.stringContaining('No matching requirements'),
      });
    });

    it('fails when no provider config is found', async () => {
      mockBuildRequirementIndex.mockReturnValue([
        makeIndexItem('epic-1', { title: 'Login', level: 0, childCount: 1, children: ['req-1'] }),
        makeIndexItem('req-1', { title: 'Login page', level: 1, parent: 'epic-1' }),
      ]);
      mockRequirementRepo.listByProject.mockReturnValue([makeRequirement({ id: 'req-1', parentId: 'epic-1' })]);
      mockPipelineRepo.getActiveProviderConfig.mockReturnValue(undefined);
      const events = captureEvents(sseGateway, 'run-1');

      await service.startPipeline('run-1', 'proj-1', {
        requirementIds: ['req-1'], mode: 'auto',
      });

      expect(mockCreateAIProviderWithFallback).not.toHaveBeenCalled();
      expect(mockNlCaseRepo.save).not.toHaveBeenCalled();

      const errorEvent = events.find(e => e.event === 'pipeline:error');
      expect(errorEvent?.data).toMatchObject({
        phase: 'orchestrator',
        message: expect.stringContaining('No active AI provider configuration'),
      });
    });
  });

  describe('abort', () => {
    it('stops immediately when aborted before start', async () => {
      mockBuildRequirementIndex.mockReturnValue([
        makeIndexItem('epic-1', { title: 'Login', level: 0, childCount: 1, children: ['req-1'] }),
        makeIndexItem('req-1', { title: 'Login page', level: 1, parent: 'epic-1' }),
      ]);
      mockRequirementRepo.listByProject.mockReturnValue([makeRequirement()]);
      mockPipelineRepo.getActiveProviderConfig.mockReturnValue(PROVIDER_CONFIG);
      const fakeProvider = { chat: vi.fn(), streamChat: vi.fn() };
      mockCreateAIProviderWithFallback.mockReturnValue(fakeProvider);
      mockCreateNlPipeline.mockResolvedValue(makeFakePipeline());

      service.abortRun('run-1');

      await service.startPipeline('run-1', 'proj-1', {
        requirementIds: ['req-1'], mode: 'auto',
      });

      expect(mockCreateAIProviderWithFallback).not.toHaveBeenCalled();
      expect(mockCreateNlPipeline).not.toHaveBeenCalled();
      expect(mockNlCaseRepo.save).not.toHaveBeenCalled();
      expect(mockPipelineRepo.markRunFailed).toHaveBeenCalledWith('run-1');
    });
  });

  describe('SSE events', () => {
    it('emits lifecycle events in correct order for auto mode', async () => {
      mockBuildRequirementIndex.mockReturnValue([
        makeIndexItem('epic-1', { title: 'Login', level: 0, childCount: 1, children: ['req-1'] }),
        makeIndexItem('req-1', { title: 'Login page', level: 1, parent: 'epic-1' }),
      ]);
      mockRequirementRepo.listByProject.mockReturnValue([makeRequirement({ id: 'req-1', parentId: 'epic-1' })]);
      mockPipelineRepo.getProviderConfigByName.mockReturnValue(PROVIDER_CONFIG);
      const fakeProvider = { chat: vi.fn(), streamChat: vi.fn() };
      mockCreateAIProviderWithFallback.mockReturnValue(fakeProvider);
      mockCreateNlPipeline.mockResolvedValue(makeFakePipeline());
      const events = captureEvents(sseGateway, 'run-2');

      await service.startPipeline('run-2', 'proj-1', {
        requirementIds: ['req-1'], providerConfigName: 'test-provider', mode: 'auto',
      });

      const eventNames = events.map(e => e.event);
      const startIdx = eventNames.indexOf('phase:start');
      const budgetIdx = eventNames.indexOf('pipeline:budget');
      const completeIdx = eventNames.indexOf('pipeline:complete');

      expect(startIdx).toBeLessThan(budgetIdx!);
      expect(budgetIdx).toBeLessThan(completeIdx!);
      expect(eventNames.filter(e => e === 'batch:start').length).toBeGreaterThanOrEqual(1);
      expect(eventNames.filter(e => e === 'batch:complete').length).toBeGreaterThanOrEqual(1);
    });
  });
});
