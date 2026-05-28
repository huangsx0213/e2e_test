import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TestGenSession } from '../application/test-gen-session.ts';
import type { CheckpointResolver } from '../application/checkpoint-resolver.ts';

function mockResolver(): CheckpointResolver {
  return { resolve: vi.fn().mockResolvedValue({ action: 'approve' }) };
}

function createPipeline(states: Array<Record<string, unknown>>) {
  let index = 0;
  return {
    stream: vi.fn(async function* () {
      while (index < states.length) {
        const state = states[index++];
        yield state;
        if (state.__interrupt__) return;
      }
    }),
  };
}

describe('TestGenSession', () => {
  const runId = 'test-run-1';

  describe('abort', () => {
    it('causes runBatch to return null', async () => {
      const session = new TestGenSession(runId, createPipeline([{ finalTestCases: [] }]), mockResolver(), {
        mode: 'auto',
      });
      session.abort();
      const result = await session.runBatch(0, { phase: 'analysis' });
      expect(result).toBeNull();
    });
  });

  describe('getLastState', () => {
    it('returns null for unknown batch', () => {
      const session = new TestGenSession(runId, createPipeline([]), mockResolver(), { mode: 'auto' });
      expect(session.getLastState(99)).toBeNull();
    });
  });

  describe('with mock pipeline', () => {
    it('runBatch streams no-interrupt pipeline once and returns result', async () => {
      const lastState = { finalTestCases: [{ id: 'tc-1' }], tokenUsage: { prompt_tokens: 10, completion_tokens: 5 } };
      const pipeline = createPipeline([{ phase: 'analysis' }, lastState]);
      const session = new TestGenSession(runId, pipeline, mockResolver(), { mode: 'auto' });

      const result = await session.runBatch(0, { phase: 'analysis' });

      expect(result).not.toBeNull();
      expect(result!.batchIndex).toBe(0);
      expect(result!.cases).toEqual([{ id: 'tc-1' }]);
      expect(pipeline.stream).toHaveBeenCalledTimes(1);
    });

    it('runBatch handles checkpoint interruption and resume', async () => {
      const pipeline = createPipeline([
        { phase: 'analysis' },
        { phase: 'review-conditions', __interrupt__: [{ value: { conditions: [] } }] },
        { phase: 'design', testConditions: [] },
        { phase: 'review-draft', __interrupt__: [{ value: { cases: [] } }] },
        { phase: 'quality', draftTestCases: [] },
        { finalTestCases: [{ id: 'tc-1' }], tokenUsage: {} },
      ]);
      const resolver = mockResolver();
      const session = new TestGenSession(runId, pipeline, resolver, { mode: 'auto' });

      const result = await session.runBatch(0, { phase: 'analysis' });

      expect(result).not.toBeNull();
      expect(result!.cases).toEqual([{ id: 'tc-1' }]);
      expect(pipeline.stream).toHaveBeenCalledTimes(3);
      expect(resolver.resolve).toHaveBeenCalledTimes(2);
      expect(resolver.resolve).toHaveBeenNthCalledWith(
        1, runId, 1, 'review-conditions', { conditions: [] },
      );
      expect(resolver.resolve).toHaveBeenNthCalledWith(
        2, runId, 2, 'review-draft', { cases: [] },
      );
    });

    it('runBatch returns null on abort signal', async () => {
      const controller = new AbortController();
      const pipeline = createPipeline([
        { phase: 'analysis' },
        { phase: 'review-conditions', __interrupt__: [{ value: { conditions: [] } }] },
      ]);
      const session = new TestGenSession(runId, pipeline, mockResolver(), {
        mode: 'auto',
        signal: controller.signal,
      });

      controller.abort();
      const result = await session.runBatch(0, { phase: 'analysis' });
      expect(result).toBeNull();
    });
  });
});
