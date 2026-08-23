export class Semaphore {
  private current = 0;
  private queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
    signal?: AbortSignal;
    onAbort?: () => void;
  }> = [];

  constructor(private max: number) {}

  async acquire(timeoutMs?: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error('Semaphore acquire aborted');
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise((resolve, reject) => {
      const entry: (typeof this.queue)[number] = { resolve, reject };
      this.queue.push(entry);
      if (timeoutMs) {
        entry.timer = setTimeout(
          () => this.removeQueued(entry, new Error('Semaphore acquire timeout')),
          timeoutMs,
        );
      }
      if (signal) {
        entry.signal = signal;
        entry.onAbort = () => {
          this.removeQueued(entry, new Error('Semaphore acquire aborted'));
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }
    });
  }

  tryAcquire(): boolean {
    if (this.current >= this.max) return false;
    this.current++;
    return true;
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.cleanupEntry(next);
      next.resolve();
    } else if (this.current > 0) {
      this.current--;
    }
  }

  get active(): number { return this.current; }
  get waiting(): number { return this.queue.length; }

  private removeQueued(entry: (typeof this.queue)[number], error: Error): void {
    const index = this.queue.indexOf(entry);
    if (index < 0) return;
    this.queue.splice(index, 1);
    this.cleanupEntry(entry);
    entry.reject(error);
  }

  private cleanupEntry(entry: (typeof this.queue)[number]): void {
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) {
      entry.signal.removeEventListener('abort', entry.onAbort);
    }
  }
}
