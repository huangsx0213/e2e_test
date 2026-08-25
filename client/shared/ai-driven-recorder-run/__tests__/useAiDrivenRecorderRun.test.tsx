// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

import { useAiDrivenRecorderRun } from '../useAiDrivenRecorderRun';
import { AiDrivenRecorderRunDepsProvider } from '../AiDrivenRecorderRunProvider';

/**
 * 回归测试：start() 播种的 nlStepIndex 必须是 0-based（与 Agent SSE 事件一致），
 * 不得使用 NL 用例里 1-based 的 sequence。
 */
describe('useAiDrivenRecorderRun step seeding', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('seeds nlStepIndex as 0-based array index, ignoring 1-based sequence values', async () => {
    const api = {
      start: vi.fn().mockResolvedValue({ runId: 'run-1', suiteId: 's1', caseId: 'c1', status: 'started' }),
      getRun: vi.fn(),
      delete: vi.fn(),
      runs: vi.fn(),
      streamUrl: vi.fn(() => '/api/ai-driven-recorder/p1/runs/run-1/stream'),
    };

    const { result } = renderHook(() => useAiDrivenRecorderRun('p1'), {
      wrapper: ({ children }) => (
        <AiDrivenRecorderRunDepsProvider deps={{ api: api as any }}>{children}</AiDrivenRecorderRunDepsProvider>
      ),
    });

    const nlCaseSteps = [
      { sequence: 1, action: 'enter username', expected: '' },
      { sequence: 2, action: 'enter password', expected: '' },
      { sequence: 3, action: 'click sign in', expected: 'logged in' },
    ];

    await result.current.start(
      { nlCaseId: 'nl-1', providerConfigId: 'pc-1' },
      nlCaseSteps,
    );

    await waitFor(() => {
      expect(result.current.state.runId).toBe('run-1');
    });

    expect(result.current.state.steps.map((s) => s.nlStepIndex)).toEqual([0, 1, 2]);
    expect(result.current.state.steps.map((s) => s.instruction)).toEqual([
      'enter username',
      'enter password',
      'click sign in',
    ]);
    expect(result.current.state.steps.every((s) => s.status === 'pending')).toBe(true);
  });
});
