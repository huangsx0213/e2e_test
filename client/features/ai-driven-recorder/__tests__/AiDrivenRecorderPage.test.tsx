import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AiDrivenRecorderPage } from '../AiDrivenRecorderPage';
import type { RecorderRunState } from '@/shared/ai-driven-recorder-run';

const hookMock = vi.hoisted(() => ({
  useAiDrivenRecorderRun: vi.fn(),
}));

vi.mock('@/shared/ai-driven-recorder-run', () => ({
  useAiDrivenRecorderRun: hookMock.useAiDrivenRecorderRun,
}));

vi.mock('@/shared/hooks/useQueryHooks', () => ({
  useNlCases: vi.fn(() => ({ data: [] })),
  useProviderConfigs: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/shared/services/api', () => ({
  api: {
    aiDrivenRecorder: {
      runs: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readyState: number = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  fireOpen(): void {
    this.onopen?.();
  }

  fireError(): void {
    this.onerror?.();
  }
}

function runningStateWithTakeover(overrides: Partial<RecorderRunState> = {}): RecorderRunState {
  return {
    runId: 'run-1',
    status: 'running',
    steps: [
      { nlStepIndex: 1, instruction: 'Type username', status: 'completed', retryCount: 0 },
      { nlStepIndex: 2, instruction: 'Solve the captcha manually', status: 'takeover', retryCount: 0 },
    ],
    suiteId: null,
    caseId: null,
    replayReport: null,
    error: null,
    isStarting: false,
    isConnected: true,
    nlCaseId: 'case-1',
    providerConfigId: 'provider-1',
    ...overrides,
  };
}

function makeHookReturn(state: RecorderRunState) {
  return {
    state,
    isRunning: state.status === 'running',
    start: vi.fn(),
    abort: vi.fn(),
    reset: vi.fn(),
    loadRun: vi.fn(),
  };
}

function renderPage(state: RecorderRunState) {
  hookMock.useAiDrivenRecorderRun.mockReturnValue(makeHookReturn(state));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AiDrivenRecorderPage currentProjectId="project-1" />
    </QueryClientProvider>,
  );
}

function getDoneButton() {
  return screen.getByRole('button', { name: /done/i });
}

describe('AiDrivenRecorderPage takeover complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    cleanup();
  });

  it('sends takeover complete wrapped in RECORDING_EVENT envelope with projectId', async () => {
    renderPage(runningStateWithTakeover());
    fireEvent.click(getDoneButton());

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    await act(async () => {
      ws.fireOpen();
    });

    expect(ws.sent).toHaveLength(1);
    const payload = JSON.parse(ws.sent[0]);
    expect(payload.event).toBe('RECORDING_EVENT');
    expect(payload.data.event).toBe('AI_RECORDER_TAKEOVER_COMPLETE');
    expect(payload.data.data).toMatchObject({
      runId: 'run-1',
      nlStepIndex: 2,
      projectId: 'project-1',
    });
    expect(getDoneButton()).toBeEnabled();
    expect(ws.closed).toBe(true);
  });

  it('guards against double-click while a send is pending', () => {
    renderPage(runningStateWithTakeover());

    fireEvent.click(getDoneButton());
    fireEvent.click(screen.getByRole('button', { name: /sending/i }));

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does not open a socket without runId or projectId context', () => {
    renderPage(runningStateWithTakeover({ runId: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Runtime' }));
    fireEvent.click(getDoneButton());
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('re-enables Done via the timeout backstop without sending', () => {
    vi.useFakeTimers();
    renderPage(runningStateWithTakeover());
    fireEvent.click(getDoneButton());
    const ws = FakeWebSocket.instances[0];
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(getDoneButton()).toBeEnabled();
    expect(ws.closed).toBe(true);
    expect(ws.sent).toHaveLength(0);
  });

  it('re-enables Done when the socket errors', () => {
    renderPage(runningStateWithTakeover());
    fireEvent.click(getDoneButton());
    const ws = FakeWebSocket.instances[0];
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    act(() => {
      ws.fireError();
    });

    expect(getDoneButton()).toBeEnabled();
    expect(ws.closed).toBe(true);
  });

  it('does not send or throw when the socket opens after the timeout backstop fired', () => {
    vi.useFakeTimers();
    renderPage(runningStateWithTakeover());
    fireEvent.click(getDoneButton());
    const ws = FakeWebSocket.instances[0];
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getDoneButton()).toBeEnabled();
    expect(ws.closed).toBe(true);

    expect(() => {
      act(() => {
        ws.fireOpen();
      });
    }).not.toThrow();

    expect(getDoneButton()).toBeEnabled();
    expect(ws.sent).toHaveLength(0);
    expect(ws.closed).toBe(true);
  });
});
