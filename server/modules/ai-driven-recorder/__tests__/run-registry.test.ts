import { describe, expect, it, vi } from 'vitest';
import {
  getLocalRunHandle,
  registerLocalRun,
  unregisterLocalRun,
  type LocalRunHandle,
} from '../run-registry.ts';

function makeHandle(): LocalRunHandle {
  return { abort: vi.fn(), resolveTakeover: vi.fn() };
}

describe('run-registry', () => {
  it('register/get round-trip returns the registered handle', () => {
    const handle = makeHandle();
    registerLocalRun('run-1', handle);

    expect(getLocalRunHandle('run-1')).toBe(handle);

    unregisterLocalRun('run-1');
  });

  it('getLocalRunHandle(undefined or missing runId) returns undefined', () => {
    expect(getLocalRunHandle(undefined)).toBeUndefined();
    expect(getLocalRunHandle('')).toBeUndefined();
    expect(getLocalRunHandle('never-registered')).toBeUndefined();
  });

  it('unregister removes the handle and is idempotent', () => {
    const handle = makeHandle();
    registerLocalRun('run-2', handle);

    unregisterLocalRun('run-2');
    expect(getLocalRunHandle('run-2')).toBeUndefined();

    unregisterLocalRun('run-2');
    expect(getLocalRunHandle('run-2')).toBeUndefined();
  });

  it('re-register overwrites the previous handle', () => {
    const first = makeHandle();
    const second = makeHandle();
    registerLocalRun('run-3', first);
    registerLocalRun('run-3', second);

    expect(getLocalRunHandle('run-3')).toBe(second);
    expect(getLocalRunHandle('run-3')).not.toBe(first);

    unregisterLocalRun('run-3');
  });
});
