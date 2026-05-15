import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  registerRun, unregisterRun, isRunActive,
  setActiveRunLogger, getActiveRunLogger, removeActiveRunLogger,
  abortActiveRun, setRemoteAbortHandler, abortRun,
} from '../run-registry.ts';

beforeEach(() => {
  // Unregister all runs to get a clean state
  while (isRunActive()) {
    // We need access to activeRuns to clear it — use abortActiveRun + rely on unregister
  }
  // Clear loggers by removing all
  const anyLogger = getActiveRunLogger('any');
  if (anyLogger) removeActiveRunLogger('any');
});

// ─── Run lifecycle ───

describe('run lifecycle', () => {
  it('registers and unregisters a run', () => {
    registerRun('run1', { id: 'run1', abortController: new AbortController(), isLocal: true });
    expect(isRunActive()).toBe(true);
    unregisterRun('run1');
    expect(isRunActive()).toBe(false);
  });

  it('isRunActive returns false when only remote runs exist', () => {
    registerRun('run1', { id: 'run1', abortController: new AbortController(), isLocal: false });
    expect(isRunActive()).toBe(false);
    unregisterRun('run1');
  });
});

// ─── Logger registry ───

describe('logger registry', () => {
  it('stores and retrieves logger by reportId', () => {
    const logger = { reportId: 'r1' } as any;
    setActiveRunLogger('r1', logger);
    expect(getActiveRunLogger('r1')).toBe(logger);
    removeActiveRunLogger('r1');
    expect(getActiveRunLogger('r1')).toBeUndefined();
  });
});

// ─── abortActiveRun ───

describe('abortActiveRun', () => {
  it('aborts the abort controller', () => {
    const ac = new AbortController();
    registerRun('run1', { id: 'run1', abortController: ac, isLocal: true });
    abortActiveRun();
    expect(ac.signal.aborted).toBe(true);
    unregisterRun('run1');
  });

  it('returns true when runs are aborted', () => {
    const ac = new AbortController();
    registerRun('run1', { id: 'run1', abortController: ac, isLocal: true });
    expect(abortActiveRun()).toBe(true);
    unregisterRun('run1');
  });
});

// ─── Remote abort handler ───

describe('remote abort handler', () => {
  it('abortRun calls local abort', () => {
    const ac = new AbortController();
    registerRun('run1', { id: 'run1', abortController: ac, isLocal: true });
    abortRun('r1');
    expect(ac.signal.aborted).toBe(true);
    unregisterRun('run1');
  });

  it('abortRun calls remote handler when set', () => {
    const remoteHandler = vi.fn(() => true);
    setRemoteAbortHandler(remoteHandler);
    abortRun('remote-report');
    expect(remoteHandler).toHaveBeenCalledWith('remote-report');
  });

  it('abortRun returns false when nothing to abort', () => {
    setRemoteAbortHandler(null as any);
    expect(abortRun('nonexistent')).toBe(false);
  });

  it('remote handler result is reflected in return value', () => {
    setRemoteAbortHandler(() => true);
    expect(abortRun('remote-only')).toBe(true);
  });
});
