import { describe, expect, it, vi } from 'vitest';
import { TaskQueue } from '../queue.ts';

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: 't1',
    payload: {} as any,
    tags: [],
    status: 'pending' as const,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ─── Enqueue ───

describe('enqueue', () => {
  it('adds task to queue', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1' }));
    expect(q.list()).toHaveLength(1);
  });

  it('emits task_added event', () => {
    const q = new TaskQueue();
    const handler = vi.fn();
    q.on('task_added', handler);
    q.enqueue(makeTask({ id: 't1' }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });
});

// ─── Dequeue ───

describe('dequeueNext', () => {
  it('returns the only pending task', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1' }));
    const task = q.dequeueNext('agent-1', []);
    expect(task?.id).toBe('t1');
  });

  it('removes task from queue after dequeue', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1' }));
    q.dequeueNext('agent-1', []);
    expect(q.list()).toHaveLength(0);
  });

  it('returns FIFO order', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', createdAt: 1 }));
    q.enqueue(makeTask({ id: 't2', createdAt: 2 }));
    expect(q.dequeueNext('agent-1', [])?.id).toBe('t1');
    expect(q.dequeueNext('agent-1', [])?.id).toBe('t2');
  });

  it('skips non-pending tasks', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', status: 'running' }));
    q.enqueue(makeTask({ id: 't2' }));
    expect(q.dequeueNext('agent-1', [])?.id).toBe('t2');
  });

  it('returns undefined when queue is empty', () => {
    const q = new TaskQueue();
    expect(q.dequeueNext('agent-1', [])).toBeUndefined();
  });
});

// ─── Agent targeting ───

describe('agent targeting', () => {
  it('QUEUE:ANY allows any agent', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', agentId: 'QUEUE:ANY' }));
    expect(q.dequeueNext('agent-1', [])?.id).toBe('t1');
  });

  it('specific agent ID matches only that agent', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', agentId: 'agent-specific' }));
    expect(q.dequeueNext('agent-specific', [])?.id).toBe('t1');
    q.enqueue(makeTask({ id: 't2', agentId: 'agent-specific' }));
    expect(q.dequeueNext('other-agent', [])).toBeUndefined();
  });

  it('QUEUE:LABEL: matches agents with the tag', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', agentId: 'QUEUE:LABEL:gpu' }));
    expect(q.dequeueNext('agent-1', ['gpu'])?.id).toBe('t1');
  });

  it('QUEUE:LABEL: rejects agents without the tag', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', agentId: 'QUEUE:LABEL:gpu' }));
    expect(q.dequeueNext('agent-1', ['cpu'])).toBeUndefined();
  });

  it('selects matching task among multiple', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1', agentId: 'QUEUE:LABEL:gpu' }));
    q.enqueue(makeTask({ id: 't2', agentId: 'QUEUE:LABEL:cpu' }));
    expect(q.dequeueNext('agent-1', ['cpu'])?.id).toBe('t2');
  });
});

// ─── abortTask ───

describe('abortTask', () => {
  it('removes pending task from queue', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1' }));
    expect(q.abortTask('t1')).toBe(true);
    expect(q.list()).toHaveLength(0);
  });

  it('returns false for unknown task', () => {
    const q = new TaskQueue();
    expect(q.abortTask('nonexistent')).toBe(false);
  });
});

// ─── getQueuePosition ───

describe('getQueuePosition', () => {
  it('returns 1-based position', () => {
    const q = new TaskQueue();
    q.enqueue(makeTask({ id: 't1' }));
    q.enqueue(makeTask({ id: 't2' }));
    expect(q.getQueuePosition('t1')).toBe(1);
    expect(q.getQueuePosition('t2')).toBe(2);
  });

  it('returns 0 for unknown task', () => {
    const q = new TaskQueue();
    expect(q.getQueuePosition('nope')).toBe(0);
  });
});
