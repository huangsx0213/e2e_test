import { describe, it, expect } from 'vitest';
import { Semaphore } from '../infra/semaphore.ts';

describe('Semaphore', () => {
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

  it('releases correctly', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);
  });
});