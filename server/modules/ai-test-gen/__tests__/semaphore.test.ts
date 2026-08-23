import { describe, it, expect } from 'vitest';
import { Semaphore } from '../infra/semaphore.ts';

describe('Semaphore', () => {
  it('fails immediately when no slot is available', () => {
    const semaphore = new Semaphore(1);
    expect(semaphore.tryAcquire()).toBe(true);
    expect(semaphore.tryAcquire()).toBe(false);
    semaphore.release();
    expect(semaphore.tryAcquire()).toBe(true);
  });

  it('limits concurrent operations', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    expect(sem.active).toBe(2);

    let thirdAcquired = false;
    const thirdPromise = sem.acquire().then(() => { thirdAcquired = true; });
    expect(sem.waiting).toBe(1);

    sem.release();
    await thirdPromise;
    expect(thirdAcquired).toBe(true);
    expect(sem.active).toBe(2);
  });

  it('supports timeout', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    await expect(sem.acquire(100)).rejects.toThrow('Semaphore acquire timeout');
    sem.release();
  });

  it('removes and rejects a queued acquire when its signal is aborted', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const controller = new AbortController();
    const queued = sem.acquire(undefined, controller.signal);
    expect(sem.waiting).toBe(1);

    controller.abort();

    await expect(queued).rejects.toThrow('Semaphore acquire aborted');
    expect(sem.waiting).toBe(0);
    expect(sem.active).toBe(1);
    sem.release();
    expect(sem.active).toBe(0);
  });

  it('releases correctly', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);
  });

  it('guards release underflow without changing future queue semantics', async () => {
    const sem = new Semaphore(1);
    sem.release();
    sem.release();
    expect(sem.active).toBe(0);

    await sem.acquire();
    const queued = sem.acquire();
    expect(sem.tryAcquire()).toBe(false);
    sem.release();
    await queued;
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);
    sem.release();
    expect(sem.active).toBe(0);
  });
});
