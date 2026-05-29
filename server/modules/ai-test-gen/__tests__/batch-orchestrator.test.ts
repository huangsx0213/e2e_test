import { describe, expect, it, vi } from 'vitest';
import { BatchOrchestrator } from '../application/batch-orchestrator.ts';
import type { BatchResult } from '../application/test-gen-session.ts';

function mockSession(results: Array<BatchResult>) {
  let calls = 0;
  return {
    startBatch: vi.fn(async (_batchIndex: number, _inputState: Record<string, unknown>) => {
      const r = results[calls++];
      return { type: 'complete' as const, result: r };
    }),
  } as any;
}

describe('BatchOrchestrator', () => {
  it('runs batches sequentially in order', async () => {
    const session = mockSession([
      { batchIndex: 0, cases: [{ id: 'a' }], tokenUsage: { input: 10, output: 5, total: 15 }, lastState: {} },
      { batchIndex: 1, cases: [{ id: 'b' }], tokenUsage: { input: 5, output: 3, total: 8 }, lastState: {} },
    ]);
    const orchestrator = new BatchOrchestrator(session, { isAborted: () => false });

    const { results, actualBatches } = await orchestrator.runAll([
      { batchIndex: 0, inputState: {} },
      { batchIndex: 1, inputState: {} },
    ]);

    expect(actualBatches).toBe(2);
    expect(results).toHaveLength(2);
    expect(results[0].cases).toEqual([{ id: 'a' }]);
    expect(results[1].cases).toEqual([{ id: 'b' }]);
    expect(session.startBatch).toHaveBeenCalledTimes(2);
    expect(session.startBatch).toHaveBeenNthCalledWith(1, 0, {});
    expect(session.startBatch).toHaveBeenNthCalledWith(2, 1, {});
  });

  it('stops early when aborted', async () => {
    let aborted = false;
    const session = mockSession([
      { batchIndex: 0, cases: [{ id: 'a' }], tokenUsage: { input: 0, output: 0, total: 0 }, lastState: {} },
    ]);
    const orchestrator = new BatchOrchestrator(session, {
      isAborted: () => aborted,
    });

    aborted = true;
    const { results, actualBatches } = await orchestrator.runAll([
      { batchIndex: 0, inputState: {} },
      { batchIndex: 1, inputState: {} },
      { batchIndex: 2, inputState: {} },
    ]);

    expect(results).toHaveLength(0);
    expect(actualBatches).toBe(0);
    expect(session.startBatch).not.toHaveBeenCalled();
  });

  it('continues past failed batches', async () => {
    const session = {
      startBatch: vi.fn(async (batchIndex: number) => {
        if (batchIndex === 1) throw new Error('batch failed');
        return { type: 'complete' as const, result: { batchIndex, cases: [], tokenUsage: { input: 0, output: 0, total: 0 }, lastState: {} } };
      }),
    } as any;

    const errors: any[] = [];
    const orchestrator = new BatchOrchestrator(session, {
      isAborted: () => false,
      onBatchError: (_, err) => errors.push(err),
    });

    const { results, actualBatches } = await orchestrator.runAll([
      { batchIndex: 0, inputState: {} },
      { batchIndex: 1, inputState: {} },
      { batchIndex: 2, inputState: {} },
    ]);

    expect(actualBatches).toBe(2);
    expect(results).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('batch failed');
  });

  it('fires start/complete callbacks', async () => {
    const session = mockSession([
      { batchIndex: 0, cases: [], tokenUsage: { input: 0, output: 0, total: 0 }, lastState: {} },
    ]);
    const starts: number[] = [];
    const completes: number[] = [];

    const orchestrator = new BatchOrchestrator(session, {
      isAborted: () => false,
      onBatchStart: (i) => starts.push(i),
      onBatchComplete: (i) => completes.push(i),
    });

    await orchestrator.runAll([{ batchIndex: 0, inputState: {} }]);

    expect(starts).toEqual([0]);
    expect(completes).toEqual([0]);
  });
});