import { describe, expect, it, vi } from 'vitest';
import { ExecutionLogger } from '../logger.ts';

function mockRes() {
  return {
    writeHead: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
    on: vi.fn(),
  } as any;
}

// ─── Constructor ───

describe('constructor', () => {
  it('stores reportId', () => {
    const logger = new ExecutionLogger('r1');
    expect(logger.reportId).toBe('r1');
  });
});

// ─── Log ───

describe('log', () => {
  it('stores log entry in memory', () => {
    const logger = new ExecutionLogger('r1');
    logger.log({ stepId: 's1', status: 'PASS', level: 'info', message: 'ok' } as any);
    expect(logger.getLogs()).toHaveLength(1);
    expect(logger.getLogs()[0].message).toBe('ok');
  });

  it('assigns a timestamp', () => {
    const logger = new ExecutionLogger('r1');
    logger.log({ stepId: 's1', status: 'PASS', message: 'ok' } as any);
    expect(logger.getLogs()[0].timestamp).toBeGreaterThan(0);
  });

  it('broadcasts to SSE clients', () => {
    const logger = new ExecutionLogger('r1');
    const res = mockRes();
    logger.addClient(res);
    logger.log({ stepId: 's1', status: 'PASS', message: 'ok' } as any);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: log'));
  });
});

// ─── addClient ───

describe('addClient', () => {
  it('replays previous logs to new client', () => {
    const logger = new ExecutionLogger('r1');
    logger.log({ stepId: 's1', status: 'PASS', message: 'first' } as any);
    const res = mockRes();
    logger.addClient(res);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('first'));
  });

  it('sets SSE headers', () => {
    const logger = new ExecutionLogger('r1');
    const res = mockRes();
    logger.addClient(res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
    }));
  });
});

// ─── progress ───

describe('progress', () => {
  it('sends progress event to SSE clients', () => {
    const logger = new ExecutionLogger('r1');
    const res = mockRes();
    logger.addClient(res);
    logger.progress({ completed: 5, total: 10, percent: 50 });
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: progress'));
  });
});

// ─── hasClients ───

describe('hasClients', () => {
  it('returns true when client connected', () => {
    const logger = new ExecutionLogger('r1');
    logger.addClient(mockRes());
    expect(logger.hasClients()).toBe(true);
  });

  it('returns false initially', () => {
    const logger = new ExecutionLogger('r1');
    expect(logger.hasClients()).toBe(false);
  });
});

// ─── complete ───

describe('complete', () => {
  it('sends done event and ends connection', () => {
    const logger = new ExecutionLogger('r1');
    const res = mockRes();
    logger.addClient(res);
    logger.complete({ reportId: 'r1', status: 'COMPLETED', passRate: 100, totalCases: 1, passedCases: 1, failedCases: 0, durationMs: 100 });
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: done'));
    expect(res.end).toHaveBeenCalled();
  });

  it('clears SSE clients after complete', () => {
    const logger = new ExecutionLogger('r1');
    logger.addClient(mockRes());
    logger.complete({} as any);
    expect(logger.hasClients()).toBe(false);
  });
});
