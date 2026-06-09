import { createHash } from 'node:crypto';

export interface CacheStore {
  getCache(key: string): { output: string } | undefined;
  setCache(key: string, inputHash: string, promptVersion: string, model: string, output: string): void;
  invalidateByPromptVersion(promptVersion: string): void;
  invalidateAll(): void;
}

let _store: CacheStore | undefined;

export function useCacheStore(store: CacheStore): void {
  _store = store;
}

const CACHE_TTL_HOURS = 24;

function buildKey(input: unknown, promptVersion: string, model: string): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(input) + promptVersion + model)
    .digest('hex');
  return `agent:cache:${hash}`;
}

export function getCached(input: unknown, promptVersion: string, model: string): unknown | null {
  if (!_store) return null;
  const key = buildKey(input, promptVersion, model);
  const row = _store.getCache(key);
  if (!row) return null;
  try {
    return JSON.parse(row.output);
  } catch {
    return null;
  }
}

export function setCache(input: unknown, promptVersion: string, model: string, output: unknown): void {
  if (!_store) return;
  const key = buildKey(input, promptVersion, model);
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  _store.setCache(key, inputHash, promptVersion, model, JSON.stringify(output));
}

export function invalidateCache(promptVersion?: string): void {
  if (!_store) return;
  if (promptVersion) {
    _store.invalidateByPromptVersion(promptVersion);
  } else {
    _store.invalidateAll();
  }
}