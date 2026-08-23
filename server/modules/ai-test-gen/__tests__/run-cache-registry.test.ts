import { describe, expect, it, vi } from 'vitest';

import { RunCacheRegistry } from '../run-cache-registry.ts';

describe('RunCacheRegistry', () => {
  it('attempts every callback and retries only callbacks that failed', () => {
    const registry = new RunCacheRegistry();
    const calls: string[] = [];
    let shouldFail = true;
    const first = vi.fn(() => calls.push('first'));
    const retryable = vi.fn(() => {
      calls.push('retryable');
      if (shouldFail) throw new Error('retryable failed');
    });
    const last = vi.fn(() => calls.push('last'));
    registry.register('run-1', first);
    registry.register('run-1', retryable);
    registry.register('run-1', last);

    let caught: unknown;
    try {
      registry.evict('run-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(1);
    expect(calls).toEqual(['first', 'retryable', 'last']);
    expect(registry.has('run-1')).toBe(true);

    calls.length = 0;
    shouldFail = false;
    registry.evict('run-1');

    expect(calls).toEqual(['retryable']);
    expect(first).toHaveBeenCalledOnce();
    expect(last).toHaveBeenCalledOnce();
    expect(retryable).toHaveBeenCalledTimes(2);
    expect(registry.has('run-1')).toBe(false);
  });

  it('aggregates every callback failure after attempting the complete set', () => {
    const registry = new RunCacheRegistry();
    const calls: string[] = [];
    registry.register('run-2', () => {
      calls.push('failure-a');
      throw new Error('failure-a');
    });
    registry.register('run-2', () => {
      calls.push('success');
    });
    registry.register('run-2', () => {
      calls.push('failure-b');
      throw new Error('failure-b');
    });

    let caught: unknown;
    try {
      registry.evict('run-2');
    } catch (error) {
      caught = error;
    }

    expect(calls).toEqual(['failure-a', 'success', 'failure-b']);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    expect(registry.has('run-2')).toBe(true);
  });
});
