import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TestGenSession } from '../session.ts';
import { SSEGateway } from '../sse-gateway.ts';

function makeFakeGraph(streams: any[]) {
  return {
    async *stream() {
      for (const s of streams) yield s;
    },
  };
}

describe('TestGenSession', () => {
  let sseGateway: SSEGateway;
  let session: TestGenSession;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = new SSEGateway();
    session = new TestGenSession({
      runId: 'run-1',
      provider: { chat: vi.fn(), streamChat: vi.fn() } as any,
      observer: {
        onStart: vi.fn(),
        onStep: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
      modelName: 'test-model',
      tokenLimit: null,
      timeoutMs: 300_000,
      useCache: false,
      signal: undefined,
    });
  });

  describe('startBatch', () => {
    it('returns complete when graph runs without interrupt', async () => {
      const fakeGraph = makeFakeGraph([{ phase: 'complete', finalTestCases: [{ id: 'tc-1' }] }]);
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      const outcome = await session.startBatch({
        batchIndex: 0,
        inputState: { projectId: 'p', runId: 'r', mode: 'auto', generationMode: 'component', requirementIds: [], currentBatch: [], batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 }, projectContext: { name: '', pages: [], endpoints: [] }, businessFlowBlueprints: undefined, selectedFlowIds: [], phase: 'analysis', errors: [] },
      });
      expect(outcome.type).toBe('complete');
      if (outcome.type === 'complete') {
        expect(outcome.result.cases).toHaveLength(1);
      }
    });

    it('detects interrupt and returns interrupt outcome', async () => {
      const fakeGraph = makeFakeGraph([{ __interrupt__: [{ value: { conditions: [{ id: 'c1' }], phase: 'review-conditions' } }] }]);
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      const outcome = await session.startBatch({
        batchIndex: 0,
        inputState: { projectId: 'p', runId: 'r', mode: 'interactive', generationMode: 'component', requirementIds: [], currentBatch: [], batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 }, projectContext: { name: '', pages: [], endpoints: [] }, businessFlowBlueprints: undefined, selectedFlowIds: [], phase: 'analysis', errors: [] },
      });
      expect(outcome.type).toBe('interrupt');
    });
  });

  describe('resumeAt', () => {
    it('sends Command with resume payload to graph', async () => {
      const receivedInputs: any[] = [];
      const fakeGraph = {
        async *stream(input: any) {
          receivedInputs.push(input);
          yield { phase: 'complete', finalTestCases: [] };
        },
      };
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      await session.resumeAt('run-1-batch-0', { action: 'approve', feedback: 'looks good' });
      expect(receivedInputs.length).toBeGreaterThan(0);
    });
  });

  describe('retryFromAgentLogs', () => {
    it('restores completed agent outputs via updateState(asNode) then streams null to resume', async () => {
      const updateStateCalls: { values: any; asNode?: string }[] = [];
      const streamInputs: any[] = [];
      const fakeGraph = {
        async updateState(_config: any, values: any, asNode?: string) {
          updateStateCalls.push({ values, asNode });
          return _config;
        },
        async getState() {
          return { next: ['checkpoint_1'], values: {} };
        },
        async *stream(input: any) {
          streamInputs.push(input);
          yield { phase: 'complete', finalTestCases: [{ id: 'tc-1' }] };
        },
      };
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      const baseInput = { projectId: 'p', runId: 'r', generationMode: 'mixed', currentBatch: [] };
      const completedAgentOutputs = [
        { agentName: 'test_analyst', outputData: { testConditions: [{ id: 'c1' }], requirementAnalysis: { overallApproach: 'x' } } },
      ];

      const outcome = await session.retryFromAgentLogs('retry-thread-1', 0, baseInput, completedAgentOutputs);

      // updateState called once with asNode='analyst' (last completed agent's node)
      expect(updateStateCalls).toHaveLength(1);
      expect(updateStateCalls[0].asNode).toBe('analyst');
      // Merged state contains both base input and agent output
      expect(updateStateCalls[0].values).toMatchObject({
        generationMode: 'mixed',
        testConditions: [{ id: 'c1' }],
        environmentReady: true,
      });

      // stream called with null (resume from checkpoint, not from START)
      expect(streamInputs).toHaveLength(1);
      expect(streamInputs[0]).toBeNull();

      expect(outcome.type).toBe('complete');
    });

    it('uses asNode=designer when both analyst and designer completed', async () => {
      const updateStateCalls: { asNode?: string }[] = [];
      const fakeGraph = {
        async updateState(_config: any, _values: any, asNode?: string) {
          updateStateCalls.push({ asNode });
          return _config;
        },
        async getState() {
          return { next: ['checkpoint_2'], values: {} };
        },
        async *stream() {
          yield { phase: 'complete', finalTestCases: [] };
        },
      };
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      await session.retryFromAgentLogs('retry-thread-2', 0, { projectId: 'p' }, [
        { agentName: 'test_analyst', outputData: { testConditions: [] } },
        { agentName: 'test_designer', outputData: { draftTestCases: [] } },
      ]);

      // asNode should be 'designer' (the last completed agent)
      expect(updateStateCalls).toHaveLength(1);
      expect(updateStateCalls[0].asNode).toBe('designer');
    });

    it('falls back to asNode=preparation when no agents completed', async () => {
      const updateStateCalls: { asNode?: string }[] = [];
      const fakeGraph = {
        async updateState(_config: any, _values: any, asNode?: string) {
          updateStateCalls.push({ asNode });
          return _config;
        },
        async getState() {
          return { next: ['analyst'], values: {} };
        },
        async *stream() {
          yield { phase: 'complete', finalTestCases: [] };
        },
      };
      vi.spyOn(await import('../graph/graph.ts'), 'buildTestGenGraph').mockReturnValue(fakeGraph as any);

      await session.retryFromAgentLogs('retry-thread-3', 0, { projectId: 'p' }, []);

      expect(updateStateCalls).toHaveLength(1);
      expect(updateStateCalls[0].asNode).toBe('preparation');
    });
  });
});