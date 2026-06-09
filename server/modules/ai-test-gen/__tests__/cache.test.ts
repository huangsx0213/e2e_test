import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCacheStore, getCached, setCache, invalidateCache } from '../infra/cache.ts';
import type { CacheStore } from '../infra/cache.ts';

function createMockStore(): CacheStore {
  const store: Record<string, { output: string }> = {};
  return {
    getCache: vi.fn((key: string) => store[key] ?? undefined),
    setCache: vi.fn((key: string, _ih: string, _pv: string, _m: string, output: string) => {
      store[key] = { output };
    }),
    invalidateByPromptVersion: vi.fn(),
    invalidateAll: vi.fn(),
  };
}

describe('cache', () => {
  let store: CacheStore;

  beforeEach(() => {
    store = createMockStore();
    useCacheStore(store);
  });

  it('getCached returns null when no store configured', () => {
    useCacheStore(undefined as any);
    expect(getCached({ x: 1 }, 'v1', 'gpt-4o')).toBeNull();
  });

  it('getCached returns null on cache miss', () => {
    expect(getCached({ x: 1 }, 'v1', 'gpt-4o')).toBeNull();
  });

  it('getCached returns parsed JSON on cache hit', () => {
    setCache({ x: 1 }, 'v1', 'gpt-4o', { result: 'hello' });
    const result = getCached({ x: 1 }, 'v1', 'gpt-4o');
    expect(result).toEqual({ result: 'hello' });
  });

  it('setCache calls store.setCache with correct arguments', () => {
    setCache({ input: 'test' }, 'v1', 'gpt-4o', { output: 'foo' });
    expect(store.setCache).toHaveBeenCalledOnce();
    const args = (store.setCache as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toMatch(/^agent:cache:/);
    expect(args[1]).toBeTypeOf('string');
    expect(args[2]).toBe('v1');
    expect(args[3]).toBe('gpt-4o');
    expect(args[4]).toBe('{"output":"foo"}');
  });

  it('invalidates all when no version given', () => {
    invalidateCache();
    expect(store.invalidateAll).toHaveBeenCalledOnce();
  });

  it('invalidates by prompt version', () => {
    invalidateCache('v2');
    expect(store.invalidateByPromptVersion).toHaveBeenCalledWith('v2');
  });
});
