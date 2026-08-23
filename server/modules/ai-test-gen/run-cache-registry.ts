export type RunCacheEviction = () => void;

export class RunCacheRegistry {
  private readonly entries = new Map<string, Set<RunCacheEviction>>();

  register(runId: string, evict: RunCacheEviction): () => void {
    const callbacks = this.entries.get(runId) ?? new Set<RunCacheEviction>();
    callbacks.add(evict);
    this.entries.set(runId, callbacks);
    return () => {
      callbacks.delete(evict);
      if (callbacks.size === 0) this.entries.delete(runId);
    };
  }

  evict(runId: string): void {
    const callbacks = this.entries.get(runId);
    if (!callbacks) return;
    const failedCallbacks = new Set<RunCacheEviction>();
    const errors: unknown[] = [];
    for (const evict of [...callbacks]) {
      try {
        evict();
      } catch (error) {
        failedCallbacks.add(evict);
        errors.push(error);
      }
    }
    callbacks.clear();
    for (const failed of failedCallbacks) callbacks.add(failed);
    if (callbacks.size === 0) {
      this.entries.delete(runId);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `Run cache eviction failed for ${runId}`);
    }
  }

  has(runId: string): boolean {
    return this.entries.has(runId);
  }
}

export const runCacheRegistry = new RunCacheRegistry();
