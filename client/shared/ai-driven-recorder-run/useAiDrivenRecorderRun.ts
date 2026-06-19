/**
 * AI-Driven Recorder Run — 主 Hook
 *
 * 参考 useTestGenRun + useTestGenSSE 模式：
 *   - useReducer 管理状态
 *   - fetch-based SSE 订阅驱动状态更新（与 useTestGenSSE 一致）
 */

import { useReducer, useCallback, useRef, useEffect } from 'react';
import { recorderReducer } from './ai-driven-recorder-reducer';
import {
  createInitialState,
  type RecorderRunState,
  type RecorderStep,
  type StartConfig,
  type ReplayReport,
} from './types';
import { useAiDrivenRecorderRunDeps } from './AiDrivenRecorderRunProvider';

interface UseAiDrivenRecorderRunOptions {
  /** 预选的 NlCase ID（从 NlCasesPage 跳转时传入） */
  preselectNlCaseId?: string | null;
}

export function useAiDrivenRecorderRun(
  projectId: string | null,
  _options: UseAiDrivenRecorderRunOptions = {},
) {
  const [state, dispatch] = useReducer(recorderReducer, createInitialState());
  const { api } = useAiDrivenRecorderRunDeps();
  const sseControllerRef = useRef<AbortController | null>(null);
  const onEventRef = useRef<(event: { type: string; data: any }) => void>(() => {});

  // SSE 事件 → dispatch 映射
  const handleSSEEvent = useCallback((event: { type: string; data: any }) => {
    const { type, data } = event;
    switch (type) {
      case 'step:start':
        dispatch({ type: 'STEP_START', runId: data.runId, nlStepIndex: data.nlStepIndex, instruction: data.instruction, expected: data.expected });
        break;
      case 'step:observe':
        dispatch({ type: 'STEP_OBSERVE', runId: data.runId, nlStepIndex: data.nlStepIndex, hint: data.hint });
        break;
      case 'step:complete':
        dispatch({ type: 'STEP_COMPLETE', runId: data.runId, nlStepIndex: data.nlStepIndex, recordedStepCount: data.recordedStepCount, durationMs: data.durationMs });
        break;
      case 'step:failed':
        dispatch({ type: 'STEP_FAILED', runId: data.runId, nlStepIndex: data.nlStepIndex, error: data.error, retryCount: data.retryCount });
        break;
      case 'step:takeover':
        dispatch({ type: 'STEP_TAKEOVER', runId: data.runId, nlStepIndex: data.nlStepIndex, reason: data.reason });
        break;
      case 'run:complete':
        dispatch({ type: 'RUN_COMPLETE', runId: data.runId, suiteId: data.suiteId, caseId: data.caseId, replayReport: data.replayReport });
        break;
      case 'run:error':
        dispatch({ type: 'RUN_ERROR', runId: data.runId, error: data.error });
        break;
      case 'recorder:fallback':
        dispatch({ type: 'RECORDER_FALLBACK', runId: data.runId, reason: data.reason });
        break;
      default:
        break;
    }
  }, []);

  onEventRef.current = handleSSEEvent;

  // SSE 连接（参考 useTestGenSSE 的 fetch-based 实现）
  const connectSSE = useCallback((runId: string) => {
    if (!projectId) return;
    sseControllerRef.current?.abort();
    const controller = new AbortController();
    sseControllerRef.current = controller;

    const url = api.streamUrl(projectId, runId);
    dispatch({ type: 'SET_CONNECTED', connected: false });

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          dispatch({ type: 'RUN_ERROR', runId, error: err.error || 'SSE connection failed' });
          return;
        }
        dispatch({ type: 'SET_CONNECTED', connected: true });

        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                onEventRef.current({ type: currentEvent, data });
              } catch {
                // skip malformed JSON
              }
              currentEvent = '';
            }
          }
        }
        dispatch({ type: 'SET_CONNECTED', connected: false });
      })
      .catch((err: any) => {
        if (err.name !== 'AbortError') {
          dispatch({ type: 'RUN_ERROR', runId, error: err.message });
        }
        dispatch({ type: 'SET_CONNECTED', connected: false });
      });
  }, [projectId, api]);

  const start = useCallback(
    async (config: StartConfig, nlCaseSteps?: Array<{ sequence: number; action: string; expected?: string }>) => {
      if (!projectId) return;
      dispatch({ type: 'START_REQUEST', nlCaseId: config.nlCaseId, providerConfigId: config.providerConfigId });

      try {
        const result = await api.start(projectId, config);

        const steps: RecorderStep[] = (nlCaseSteps ?? []).map((s) => ({
          nlStepIndex: s.sequence,
          instruction: s.action,
          expected: s.expected,
          status: 'pending' as const,
          retryCount: 0,
        }));

        dispatch({
          type: 'START_SUCCESS',
          runId: result.runId,
          suiteId: result.suiteId,
          caseId: result.caseId,
          steps,
        });

        connectSSE(result.runId);
      } catch (err: any) {
        dispatch({ type: 'START_ERROR', error: err?.message || 'Failed to start AI recording' });
        throw err;
      }
    },
    [projectId, api, connectSSE],
  );

  const abort = useCallback(async () => {
    if (!projectId || !state.runId) return;
    dispatch({ type: 'ABORT_REQUEST' });
    try {
      await api.delete(projectId, state.runId);
    } catch {
      // best effort
    }
    sseControllerRef.current?.abort();
    sseControllerRef.current = null;
    dispatch({ type: 'ABORT_SUCCESS' });
  }, [projectId, state.runId, api]);

  const reset = useCallback(() => {
    sseControllerRef.current?.abort();
    sseControllerRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const loadRun = useCallback(
    async (runId: string) => {
      if (!projectId) return;
      try {
        const run = await api.getRun(projectId, runId);
        const replayReport: ReplayReport | undefined = run.replayReport;
        dispatch({
          type: 'LOAD_RUN',
          runId,
          state: {
            runId,
            status: run.status,
            steps: [],
            suiteId: run.result?.suiteId ?? null,
            caseId: run.result?.caseId ?? null,
            replayReport: replayReport ?? null,
            nlCaseId: run.nlCaseId,
            error: run.error ? { message: run.error } : null,
          },
        });
      } catch {
        // best effort
      }
    },
    [projectId, api],
  );

  // 清理
  useEffect(() => {
    return () => {
      sseControllerRef.current?.abort();
      sseControllerRef.current = null;
    };
  }, []);

  const isRunning = state.status === 'running' || state.status === 'refining' || state.status === 'replaying';

  return {
    state,
    isRunning,
    start,
    abort,
    reset,
    loadRun,
  };
}
