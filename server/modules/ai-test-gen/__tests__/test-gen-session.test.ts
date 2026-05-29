import { describe, expect, it, vi } from 'vitest';
import { TestGenSession } from '../application/test-gen-session.ts';
import type { CheckpointResolver } from '../application/checkpoint-resolver.ts';

function mockResolver(): CheckpointResolver {
  return { onInterrupt: vi.fn() };
}

function createPipelineFactory(states: Array<Record<string, unknown>>) {
  let index = 0;
  return async () => ({
    stream: vi.fn(async function* () {
      while (index < states.length) {
        const state = states[index++];
        yield state;
        if (state.__interrupt__) return;
      }
    }),
  });
}

describe('TestGenSession', () => {
  const runId = 'test-run-1';

  describe('abort', () => {
    it('causes startBatch to return interrupt', async () => {
      const session = new TestGenSession(runId, createPipelineFactory([{ finalTestCases: [] }]), mockResolver(), {
        mode: 'auto',
      });
      session.abort();
      const outcome = await session.startBatch(0, { phase: 'analysis' });
      expect(outcome.type).toBe('interrupt');
      if (outcome.type === 'interrupt') {
        expect(outcome.interrupt.phase).toBe('aborted');
      }
    });
  });

  describe('with mock pipeline', () => {
    it('startBatch streams no-interrupt pipeline once and returns result', async () => {
      const lastState = { finalTestCases: [{ id: 'tc-1' }], tokenUsage: { prompt_tokens: 10, completion_tokens: 5 } };
      const factory = createPipelineFactory([{ phase: 'analysis' }, lastState]);
      const session = new TestGenSession(runId, factory, mockResolver(), { mode: 'auto' });

      const outcome = await session.startBatch(0, { phase: 'analysis' });

      expect(outcome.type).toBe('complete');
      if (outcome.type === 'complete') {
        expect(outcome.result.batchIndex).toBe(0);
        expect(outcome.result.cases).toEqual([{ id: 'tc-1' }]);
      }
    });

    it('startBatch handles checkpoint interruption in interactive mode', async () => {
      const factory = createPipelineFactory([
        { phase: 'analysis' },
        { phase: 'review-conditions', __interrupt__: [{ value: { conditions: [] } }] },
      ]);
      const resolver = mockResolver();
      const session = new TestGenSession(runId, factory, resolver, { mode: 'interactive' });

      const outcome = await session.startBatch(0, { phase: 'analysis' });

      expect(outcome.type).toBe('interrupt');
      if (outcome.type === 'interrupt') {
        expect(outcome.interrupt.checkpointNumber).toBe(1);
        expect(outcome.interrupt.phase).toBe('review-conditions');
        expect(outcome.interrupt.payload).toEqual({ conditions: [] });
      }
      expect(resolver.onInterrupt).toHaveBeenCalledWith(runId, 1, 'review-conditions', { conditions: [] });
    });

    it('startBatch auto-resumes through checkpoints in auto mode', async () => {
      const factory = createPipelineFactory([
        { phase: 'analysis' },
        { phase: 'review-conditions', __interrupt__: [{ value: { conditions: [{ id: 'c1' }] } }] },
        { phase: 'design' },
        { phase: 'review-draft', __interrupt__: [{ value: { cases: [{ id: 'tc1' }] } }] },
        { finalTestCases: [{ id: 'tc1' }], tokenUsage: { prompt_tokens: 10, completion_tokens: 5 } },
      ]);
      const resolver = mockResolver();
      const session = new TestGenSession(runId, factory, resolver, { mode: 'auto' });

      const outcome = await session.startBatch(0, { phase: 'analysis' });

      expect(outcome.type).toBe('complete');
      if (outcome.type === 'complete') {
        expect(outcome.result.cases).toEqual([{ id: 'tc1' }]);
      }
      expect(resolver.onInterrupt).toHaveBeenCalledTimes(2);
    });

    it('startBatch returns interrupt on abort signal', async () => {
      const controller = new AbortController();
      const factory = createPipelineFactory([
        { phase: 'analysis' },
        { phase: 'review-conditions', __interrupt__: [{ value: { conditions: [] } }] },
      ]);
      const session = new TestGenSession(runId, factory, mockResolver(), {
        mode: 'auto',
        signal: controller.signal,
      });

      controller.abort();
      const outcome = await session.startBatch(0, { phase: 'analysis' });
      expect(outcome.type).toBe('interrupt');
      if (outcome.type === 'interrupt') {
        expect(outcome.interrupt.phase).toBe('aborted');
      }
    });
  });
});
