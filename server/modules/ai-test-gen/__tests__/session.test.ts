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
        inputState: { projectId: 'p', runId: 'r', mode: 'auto', requirementIds: [], currentBatch: [], batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 }, projectContext: { name: '', pages: [], endpoints: [] }, businessFlowBlueprints: undefined, phase: 'analysis', errors: [] },
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
        inputState: { projectId: 'p', runId: 'r', mode: 'interactive', requirementIds: [], currentBatch: [], batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 }, projectContext: { name: '', pages: [], endpoints: [] }, businessFlowBlueprints: undefined, phase: 'analysis', errors: [] },
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
});