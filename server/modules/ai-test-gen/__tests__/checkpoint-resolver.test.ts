import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AutoResolver, InteractiveResolver } from '../application/checkpoint-resolver.ts';

function mockSSEGateway() {
  return {
    emit: vi.fn(),
    getEmitter: vi.fn(() => ({ listenerCount: vi.fn(() => 0) })),
  } as any;
}

describe('AutoResolver', () => {
  it('onInterrupt is a no-op', () => {
    const resolver = new AutoResolver();
    expect(() => resolver.onInterrupt('run-1', 1, 'review-conditions', {})).not.toThrow();
  });
});

describe('InteractiveResolver', () => {
  let sse: ReturnType<typeof mockSSEGateway>;
  let resolver: InteractiveResolver;

  beforeEach(() => {
    sse = mockSSEGateway();
    resolver = new InteractiveResolver(sse);
  });

  it('emits SSE event on interrupt', () => {
    const payload = { conditions: [{ id: 'c1' }] };
    resolver.onInterrupt('run-1', 1, 'review-conditions', payload);

    expect(sse.emit).toHaveBeenCalledWith('run-1', 'checkpoint:waiting', expect.objectContaining({
      checkpointNumber: 1,
      summary: '1 Test Conditions',
    }));
  });

  it('emits correct summary for checkpoint 2', () => {
    resolver.onInterrupt('run-1', 2, 'review-draft', { cases: [{ id: 'c1' }, { id: 'c2' }] });
    expect(sse.emit).toHaveBeenCalledWith('run-1', 'checkpoint:waiting', expect.objectContaining({
      summary: '2 Draft Cases',
    }));
  });

  it('emits correct summary for checkpoint 3', () => {
    resolver.onInterrupt('run-1', 3, 'final-review', {});
    expect(sse.emit).toHaveBeenCalledWith('run-1', 'checkpoint:waiting', expect.objectContaining({
      summary: 'Final Review',
    }));
  });
});
