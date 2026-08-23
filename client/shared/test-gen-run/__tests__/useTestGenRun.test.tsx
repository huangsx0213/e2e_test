import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestGenRunDepsProvider, useTestGenRun } from '..';
import type { StartConfig } from '../types';

const queryHookMocks = vi.hoisted(() => ({
  useTestGenRuns: vi.fn(),
  useAgentLogs: vi.fn(),
}));

const useSSEConnectionMock = vi.hoisted(() => vi.fn((_options: { url: string | null }) => ({
  status: 'disconnected' as const,
  isConnected: false,
  lastError: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
})));

vi.mock('@/shared/hooks/useQueryHooks', () => ({
  useTestGenRuns: queryHookMocks.useTestGenRuns,
  useAgentLogs: queryHookMocks.useAgentLogs,
}));

vi.mock('@/shared/sse/useSSEConnection', () => ({
  useSSEConnection: useSSEConnectionMock,
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const startConfig: StartConfig = {
  requirementIds: ['story-1'],
  providerConfigName: 'provider-1',
  mode: 'auto',
};

function createDeps(start: ReturnType<typeof vi.fn>) {
  return {
    api: {
      start,
      resume: vi.fn().mockResolvedValue({ success: true }),
      abort: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      active: vi.fn().mockResolvedValue(null),
      runs: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      checkpoint: vi.fn().mockResolvedValue(null),
      logs: vi.fn().mockResolvedValue([]),
      getCheckpointState: vi.fn().mockResolvedValue(null),
      getThinkingData: vi.fn().mockResolvedValue(null),
    },
    createSSEConnection: vi.fn(),
  };
}

function createWrapper(deps: ReturnType<typeof createDeps>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TestGenRunDepsProvider deps={deps as any}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TestGenRunDepsProvider>
    );
  };
}

function latestSseUrl(): string | null {
  const calls = useSSEConnectionMock.mock.calls;
  return calls[calls.length - 1]?.[0]?.url ?? null;
}

describe('useTestGenRun start ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryHookMocks.useTestGenRuns.mockReturnValue({ data: [] });
    queryHookMocks.useAgentLogs.mockReturnValue({ data: [] });
  });

  it('keeps project B state and SSE when project A resolves last', async () => {
    const projectAStart = deferred<{ runId: string }>();
    const projectBStart = deferred<{ runId: string }>();
    const start = vi.fn((projectId: string) => (
      projectId === 'project-a' ? projectAStart.promise : projectBStart.promise
    ));
    const { result, rerender } = renderHook(
      ({ projectId }) => useTestGenRun(projectId),
      {
        initialProps: { projectId: 'project-a' as string | null },
        wrapper: createWrapper(createDeps(start)),
      },
    );

    let firstStart!: Promise<string>;
    act(() => { firstStart = result.current.start(startConfig); });
    rerender({ projectId: 'project-b' });
    let secondStart!: Promise<string>;
    act(() => { secondStart = result.current.start(startConfig); });

    await act(async () => {
      projectBStart.resolve({ runId: 'run-b' });
      await secondStart;
    });
    await waitFor(() => expect(result.current.runId).toBe('run-b'));
    expect(latestSseUrl()).toBe('/api/test-gen/run-b/stream');

    await act(async () => {
      projectAStart.resolve({ runId: 'run-a' });
      await firstStart;
    });

    expect(result.current.runId).toBe('run-b');
    expect(result.current.error).toBeNull();
    expect(latestSseUrl()).toBe('/api/test-gen/run-b/stream');
  });

  it('hydrates persisted state instead of resetting when start reuses an existing run', async () => {
    const start = deferred<{ runId: string; created?: boolean }>();
    const api = {
      ...createDeps(vi.fn().mockReturnValue(start.promise)).api,
      get: vi.fn().mockResolvedValue({
        id: 'run-existing',
        status: 'WAITING_REVIEW',
        phase: 'review-conditions',
        thread_id: 'thread-1',
        mode: 'auto',
        total_batches: 2,
        config: startConfig,
        token_usage: null,
      }),
      logs: vi.fn().mockResolvedValue([]),
      getCheckpointState: vi.fn().mockResolvedValue({
        checkpointData: { conditions: [{ id: 'cond-1' }] },
      }),
      getThinkingData: vi.fn().mockResolvedValue(null),
    };
    const deps = { ...createDeps(vi.fn()), api };
    const { result } = renderHook(
      () => useTestGenRun('project-a'),
      { wrapper: createWrapper(deps) },
    );

    let startPromise!: Promise<string>;
    act(() => { startPromise = result.current.start(startConfig); });
    await act(async () => {
      start.resolve({ runId: 'run-existing', created: false });
      await startPromise;
    });

    await waitFor(() => {
      expect(result.current.runId).toBe('run-existing');
      expect(result.current.checkpointData).toEqual({ conditions: [{ id: 'cond-1' }] });
    });
    expect(api.get).toHaveBeenCalledWith('run-existing');
    const waitingNode = result.current.nodes.find(n => n.status === 'waiting');
    expect(waitingNode?.id).toBe('checkpoint_1');
    const prep = result.current.nodes.find(n => n.id === 'preparation');
    expect(prep?.status).toBe('completed');
    expect(result.current.error).toBeNull();
  });

  it('still dispatches RUN_STARTED for a freshly created run', async () => {
    const start = deferred<{ runId: string; created?: boolean }>();
    const deps = createDeps(vi.fn().mockReturnValue(start.promise));
    const { result } = renderHook(
      () => useTestGenRun('project-a'),
      { wrapper: createWrapper(deps) },
    );

    let startPromise!: Promise<string>;
    act(() => { startPromise = result.current.start(startConfig); });
    await act(async () => {
      start.resolve({ runId: 'run-fresh' });
      await startPromise;
    });

    await waitFor(() => expect(result.current.runId).toBe('run-fresh'));
    expect(result.current.isRunning).toBe(true);
    expect(deps.api.get).not.toHaveBeenCalled();
    expect(latestSseUrl()).toBe('/api/test-gen/run-fresh/stream');
  });

  it('does not mutate state when a stale reused-run response arrives late', async () => {
    const oldStart = deferred<{ runId: string; created?: boolean }>();
    const newStart = deferred<{ runId: string; created?: boolean }>();
    const start = vi.fn()
      .mockReturnValueOnce(oldStart.promise)
      .mockReturnValueOnce(newStart.promise);
    const deps = createDeps(start);
    const { result } = renderHook(
      () => useTestGenRun('project-a'),
      { wrapper: createWrapper(deps) },
    );

    let oldStartPromise!: Promise<string>;
    let newStartPromise!: Promise<string>;
    act(() => {
      oldStartPromise = result.current.start(startConfig);
      newStartPromise = result.current.start(startConfig);
    });
    await act(async () => {
      newStart.resolve({ runId: 'run-new' });
      await newStartPromise;
    });
    await waitFor(() => expect(result.current.runId).toBe('run-new'));

    await act(async () => {
      oldStart.resolve({ runId: 'run-old', created: false });
      await oldStartPromise;
    });

    expect(result.current.runId).toBe('run-new');
    expect(result.current.error).toBeNull();
    expect(deps.api.get).not.toHaveBeenCalledWith('run-old');
    expect(latestSseUrl()).toBe('/api/test-gen/run-new/stream');
  });

  it('does not dispatch an older request error after a newer start succeeds', async () => {
    const oldStart = deferred<{ runId: string }>();
    const newStart = deferred<{ runId: string }>();
    const start = vi.fn()
      .mockReturnValueOnce(oldStart.promise)
      .mockReturnValueOnce(newStart.promise);
    const { result } = renderHook(
      () => useTestGenRun('project-a'),
      { wrapper: createWrapper(createDeps(start)) },
    );

    let oldStartPromise!: Promise<string>;
    let newStartPromise!: Promise<string>;
    act(() => {
      oldStartPromise = result.current.start(startConfig);
      newStartPromise = result.current.start(startConfig);
    });
    await act(async () => {
      newStart.resolve({ runId: 'run-new' });
      await newStartPromise;
    });
    await waitFor(() => expect(result.current.runId).toBe('run-new'));

    await act(async () => {
      oldStart.reject(new Error('stale project A error'));
      await expect(oldStartPromise).rejects.toThrow('stale project A error');
    });

    expect(result.current.runId).toBe('run-new');
    expect(result.current.error).toBeNull();
    expect(latestSseUrl()).toBe('/api/test-gen/run-new/stream');
  });
});
