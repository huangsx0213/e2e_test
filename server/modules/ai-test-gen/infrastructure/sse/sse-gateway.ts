import { EventEmitter } from 'events';
import type { Response } from 'express';

const HEARTBEAT_INTERVAL = 15_000;

interface SseStream {
  res: Response;
  heartbeat: ReturnType<typeof setInterval>;
}

export class SSEGateway {
  private readonly emitters = new Map<string, EventEmitter>();
  private readonly streams = new Map<string, SseStream>();
  private readonly eventBuffers = new Map<string, Array<{ event: string; data: unknown }>>();
  private readonly bufferTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastEvents = new Map<string, { event: string; data: unknown }>();

  getEmitter(runId: string): EventEmitter {
    let ee = this.emitters.get(runId);
    if (!ee) {
      ee = new EventEmitter();
      ee.setMaxListeners(100);
      this.emitters.set(runId, ee);
    }
    return ee;
  }

  emit(runId: string, event: string, data: unknown): void {
    // Store sticky events for reconnect replay
    if (event === 'checkpoint:waiting') {
      this.lastEvents.set(runId, { event, data });
    }
    if (event === 'pipeline:complete' || event === 'pipeline:error') {
      this.lastEvents.delete(runId);
    }

    const emitter = this.getEmitter(runId);
    if (emitter.listenerCount('sse') === 0) {
      let buf = this.eventBuffers.get(runId);
      if (!buf) {
        buf = [];
        this.eventBuffers.set(runId, buf);
      }
      buf.push({ event, data });
    } else {
      emitter.emit('sse', event, data);
    }
  }

  attachStream(runId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emitter = this.getEmitter(runId);

    let cleaned = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      emitter.off('sse', onSse);
      if (heartbeat) clearInterval(heartbeat);
      res.end();
      this.streams.delete(runId);
    };

    const onSse = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === 'pipeline:complete' || event === 'pipeline:error') {
        cleanup();
      }
    };

    emitter.on('sse', onSse);

    // Replay buffered events that were emitted before stream attached
    const buffer = this.eventBuffers.get(runId);
    if (buffer) {
      this.eventBuffers.delete(runId);
      const timer = this.bufferTimers.get(runId);
      if (timer) {
        clearTimeout(timer);
        this.bufferTimers.delete(runId);
      }
      for (const { event, data } of buffer) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (event === 'pipeline:complete' || event === 'pipeline:error') {
          cleanup();
          return;
        }
      }
    } else {
      // No buffered events — replay the last sticky event on reconnect
      const last = this.lastEvents.get(runId);
      if (last) {
        res.write(`event: ${last.event}\ndata: ${JSON.stringify(last.data)}\n\n`);
      }
    }

    heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }, HEARTBEAT_INTERVAL);

    this.streams.set(runId, { res, heartbeat });
    reqOnClose(res, cleanup);
  }

  cleanup(runId: string): void {
    const stream = this.streams.get(runId);
    if (stream) {
      stream.res.end();
      clearInterval(stream.heartbeat);
      this.streams.delete(runId);
    }
    this.emitters.delete(runId);
    if (this.eventBuffers.has(runId) && !this.bufferTimers.has(runId)) {
      const timer = setTimeout(() => {
        this.eventBuffers.delete(runId);
        this.bufferTimers.delete(runId);
      }, 300_000).unref();
      this.bufferTimers.set(runId, timer);
    }
    // Keep lastEvents for reconnect replay; cleared on pipeline:complete/:error
  }
}

function reqOnClose(res: Response, fn: () => void): void {
  res.on('close', fn);
}
