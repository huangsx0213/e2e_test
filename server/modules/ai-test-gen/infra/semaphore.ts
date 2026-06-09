export class Semaphore {
  private current = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(private max: number) {}

  async acquire(timeoutMs?: number): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      this.queue.push(entry);
      if (timeoutMs) {
        setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
            reject(new Error('Semaphore acquire timeout'));
          }
        }, timeoutMs);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next.resolve();
    } else {
      this.current--;
    }
  }

  get active(): number { return this.current; }
  get waiting(): number { return this.queue.length; }
}