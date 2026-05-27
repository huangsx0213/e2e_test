import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SSEGateway } from '../sse-gateway.ts';

function mockResponse() {
  const chunks: string[] = [];
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    end: vi.fn(),
    on: vi.fn((_event: string, _fn: () => void) => {}),
    write: vi.fn((chunk: string) => { chunks.push(chunk); }),
    _chunks: chunks,
  } as any;
}

describe('SSEGateway', () => {
  let gateway: SSEGateway;

  beforeEach(() => {
    gateway = new SSEGateway();
  });

  describe('getEmitter', () => {
    it('creates EventEmitter on first access', () => {
      const ee = gateway.getEmitter('run-1');
      expect(ee).toBeInstanceOf(EventEmitter);
    });

    it('returns same emitter for same runId', () => {
      const ee1 = gateway.getEmitter('run-1');
      const ee2 = gateway.getEmitter('run-1');
      expect(ee1).toBe(ee2);
    });

    it('returns different emitters for different runIds', () => {
      const ee1 = gateway.getEmitter('run-1');
      const ee2 = gateway.getEmitter('run-2');
      expect(ee1).not.toBe(ee2);
    });
  });

  describe('emit', () => {
    it('emits sse event on emitter when listener is attached', () => {
      const listener = vi.fn();
      gateway.getEmitter('run-1').on('sse', listener);
      gateway.emit('run-1', 'pipeline:complete', { status: 'ok' });
      expect(listener).toHaveBeenCalledWith(
        'pipeline:complete',
        { status: 'ok' },
      );
    });

    it('buffers events when no listener is attached', () => {
      gateway.emit('run-1', 'agent:start', { agentName: 'test' });
      gateway.emit('run-1', 'batch:complete', { batch: 1 });
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      expect(res.write).toHaveBeenCalledTimes(2);
      const call0 = (res.write as any).mock.calls[0][0];
      const call1 = (res.write as any).mock.calls[1][0];
      expect(call0).toContain('event: agent:start');
      expect(call0).toContain('agentName');
      expect(call1).toContain('event: batch:complete');
    });

    it('replays buffered events in order and stops at pipeline:complete', () => {
      gateway.emit('run-1', 'batch:start', { batch: 1, total: 3 });
      gateway.emit('run-1', 'agent:start', { agentName: 'test' });
      gateway.emit('run-1', 'pipeline:complete', { summary: 'done' });
      gateway.emit('run-1', 'batch:complete', { batch: 1 });
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      // Should replay 3 events, stop before the 4th (pipeline:complete triggers cleanup)
      expect(res.write).toHaveBeenCalledTimes(3);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('attachStream', () => {
    it('sets SSE headers', () => {
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('writes emitted events to response', () => {
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      gateway.emit('run-1', 'agent:start', { agentName: 'test_analyst' });
      expect(res.write).toHaveBeenCalled();
      const written = (res.write as any).mock.calls[0][0];
      expect(written).toContain('event: agent:start');
      expect(written).toContain('agentName');
    });

    it('calls cleanup on pipeline:complete event', () => {
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      gateway.emit('run-1', 'pipeline:complete', { summary: 'done' });
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes emitter after cleanup', () => {
      gateway.getEmitter('run-1');
      gateway.cleanup('run-1');
      // After cleanup, a new getEmitter call should create a new emitter
      const ee = gateway.getEmitter('run-1');
      expect(ee).toBeInstanceOf(EventEmitter);
    });

    it('preserves event buffer after cleanup for late SSE connection', () => {
      gateway.emit('run-1', 'agent:start', { agentName: 'test' });
      gateway.cleanup('run-1');
      // Buffer should still exist after cleanup
      const res = mockResponse();
      gateway.attachStream('run-1', res);
      expect(res.write).toHaveBeenCalled();
      expect((res.write as any).mock.calls[0][0]).toContain('event: agent:start');
    });
  });
});
