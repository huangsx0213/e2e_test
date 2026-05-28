import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AutoResolver, InteractiveResolver } from '../application/checkpoint-resolver.ts';

function mockSSEGateway() {
  return {
    emit: vi.fn(),
    getEmitter: vi.fn(() => ({ listenerCount: vi.fn(() => 0) })),
  } as any;
}

describe('AutoResolver', () => {
  it('always returns approve', async () => {
    const resolver = new AutoResolver();
    const result = await resolver.resolve('run-1', 1, 'review-conditions', {});
    expect(result).toEqual({ action: 'approve' });
  });
});

describe('InteractiveResolver', () => {
  let saveCheckpoint: ReturnType<typeof vi.fn>;
  let sse: ReturnType<typeof mockSSEGateway>;
  let resolver: InteractiveResolver;

  beforeEach(() => {
    saveCheckpoint = vi.fn();
    sse = mockSSEGateway();
    resolver = new InteractiveResolver(saveCheckpoint, sse);
  });

  it('saves checkpoint data and emits SSE event', async () => {
    const payload = { conditions: [{ id: 'c1' }] };
    const resolvePromise = resolver.resolve('run-1', 1, 'review-conditions', payload);

    resolver.resumeRun('run-1', 'approve');
    await resolvePromise;

    expect(saveCheckpoint).toHaveBeenCalledWith('run-1', payload, 'review-conditions');
    expect(sse.emit).toHaveBeenCalledWith('run-1', 'checkpoint:waiting', expect.objectContaining({
      checkpointNumber: 1,
      summary: '1 Test Conditions',
    }));
  });

  it('resumeRun resolves the pending promise', async () => {
    const resolvePromise = resolver.resolve('run-1', 1, 'review-conditions', { conditions: [] });

    resolver.resumeRun('run-1', 'approve', 'looks good', { conditions: [{ id: 'c1' }] });

    const result = await resolvePromise;
    expect(result.action).toBe('approve');
    expect(result.feedback).toBe('looks good');
    expect(result.edits).toEqual({ conditions: [{ id: 'c1' }] });
  });

  it('abortRun rejects the pending promise', async () => {
    const resolvePromise = resolver.resolve('run-1', 1, 'review-conditions', { conditions: [] });

    resolver.abortRun('run-1');

    await expect(resolvePromise).rejects.toThrow('Test gen aborted');
  });

  it('resumeRun does nothing if no waiter exists', () => {
    expect(() => resolver.resumeRun('nonexistent', 'approve')).not.toThrow();
  });

  it('abortRun does nothing if no waiter exists', () => {
    expect(() => resolver.abortRun('nonexistent')).not.toThrow();
  });
});
