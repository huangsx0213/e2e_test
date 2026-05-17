import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

import { useSuiteMutations } from '../useQueryHooks';
import { queryKeys } from '../queryKeys';
import type { TestSuite } from '@/shared/types';
import { api } from '@/shared/services/api';

vi.mock('@/shared/services/api', () => ({
  api: {
    suites: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeSuite(overrides: Partial<TestSuite> = {}): TestSuite {
  return {
    id: 'suite-1',
    projectId: 'proj-1',
    name: 'Original Suite',
    description: 'Original description',
    cases: [],
    variables: [],
    dataRows: [],
    setupSteps: [],
    teardownSteps: [],
    position: 0,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockedUpdate = vi.mocked(api.suites.update);
describe('useSuiteMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the suites cache immediately before the request resolves', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const pendingUpdate = deferred<TestSuite>();
    mockedUpdate.mockReturnValueOnce(pendingUpdate.promise);

    queryClient.setQueryData<TestSuite[]>(queryKeys.suites, [makeSuite()]);

    const { result } = renderHook(() => useSuiteMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise!: Promise<TestSuite>;
    await act(async () => {
      mutationPromise = result.current.update('suite-1', { name: 'Typed quickly' });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
        makeSuite({ name: 'Typed quickly' }),
      ]);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      pendingUpdate.resolve(makeSuite({ name: 'Typed quickly' }));
      await mutationPromise;
    });
  });

  it('does not invalidate suites after a successful update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockedUpdate.mockResolvedValueOnce(makeSuite({ name: 'Saved name' }));

    queryClient.setQueryData<TestSuite[]>(queryKeys.suites, [makeSuite()]);

    const { result } = renderHook(() => useSuiteMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let mutationPromise!: Promise<TestSuite>;
    await act(async () => {
      mutationPromise = result.current.update('suite-1', { name: 'Saved name' });
    });

    await act(async () => {
      await mutationPromise;
    });

    expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
      makeSuite({ name: 'Saved name' }),
    ]);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('restores the previous suites cache when the update fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const failure = new Error('save failed');
    mockedUpdate.mockRejectedValueOnce(failure);

    queryClient.setQueryData<TestSuite[]>(queryKeys.suites, [makeSuite()]);

    const { result } = renderHook(() => useSuiteMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.update('suite-1', { name: 'Unsaved name' });
      }),
    ).rejects.toThrow('save failed');

    expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
      makeSuite(),
    ]);
  });

  it('keeps the latest typed value when older save responses resolve later', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const firstUpdate = deferred<TestSuite>();
    const secondUpdate = deferred<TestSuite>();
    mockedUpdate
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);

    queryClient.setQueryData<TestSuite[]>(queryKeys.suites, [makeSuite()]);

    const { result } = renderHook(() => useSuiteMutations(), {
      wrapper: createWrapper(queryClient),
    });

    let firstPromise!: Promise<TestSuite>;
    let secondPromise!: Promise<TestSuite>;
    await act(async () => {
      firstPromise = result.current.update('suite-1', { name: 'A' });
      secondPromise = result.current.update('suite-1', { name: 'AB' });
    });

    expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
      makeSuite({ name: 'AB' }),
    ]);

    await act(async () => {
      secondUpdate.resolve(makeSuite({ name: 'AB' }));
      await secondPromise;
    });

    expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
      makeSuite({ name: 'AB' }),
    ]);

    await act(async () => {
      firstUpdate.resolve(makeSuite({ name: 'A' }));
      await firstPromise;
    });

    expect(queryClient.getQueryData<TestSuite[]>(queryKeys.suites)).toEqual([
      makeSuite({ name: 'AB' }),
    ]);
  });
});
