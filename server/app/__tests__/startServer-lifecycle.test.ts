// @vitest-environment node
import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { startCleanupAfterListening } from '../startServer.ts';

describe('startServer HTML knowledge cleanup lifecycle', () => {
  it('does not start a cleanup timer when HTTP listen fails', async () => {
    const server = new EventEmitter();
    const startCleanup = vi.fn(() => ({ stop: vi.fn() }));
    const listening = startCleanupAfterListening(server as any, startCleanup);

    server.emit('error', new Error('listen failed'));

    await expect(listening).rejects.toThrow('listen failed');
    expect(startCleanup).not.toHaveBeenCalled();
  });

  it('reports a post-listen server error and keeps cleanup active until close', async () => {
    const server = new EventEmitter();
    const stop = vi.fn();
    const startCleanup = vi.fn(() => ({ stop }));
    const reportRuntimeError = vi.fn();
    const listening = startCleanupAfterListening(
      server as any,
      startCleanup,
      reportRuntimeError,
    );
    server.emit('listening');
    await listening;

    expect(startCleanup).toHaveBeenCalledOnce();
    const runtimeError = new Error('post-listen runtime failure');
    server.emit('error', runtimeError);

    expect(reportRuntimeError).toHaveBeenCalledWith(runtimeError);
    expect(stop).not.toHaveBeenCalled();

    server.emit('close');

    expect(stop).toHaveBeenCalledOnce();
  });

  it('rejects startup if cleanup construction fails after listening', async () => {
    const server = new EventEmitter();
    const startCleanup = vi.fn(() => {
      throw new Error('cleanup construction failed');
    });
    const listening = startCleanupAfterListening(server as any, startCleanup);

    server.emit('listening');

    await expect(listening).rejects.toThrow('cleanup construction failed');
  });
});
