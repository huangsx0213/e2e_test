import { useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTestGenRuns, useAgentLogs } from '../hooks/useQueryHooks';
import { queryKeys } from '../hooks/queryKeys';
import { useSSEConnection } from '../sse/useSSEConnection';
import { testGenReducer, createInitialState } from './test-gen-reducer';
import { useTestGenRunDeps } from './TestGenRunProvider';
import type {
  NodeId, RunSummary, TestGenError, StartConfig,
  CheckpointAction, TestGenNode, BatchProgress,
} from './types';
import { TEST_GEN_NODE_DEFS } from './types';

export interface UseTestGenRunOptions {
  runId?: string;
  config?: {
    autoFollow?: boolean;
    autoRecover?: boolean;
    refetchLogsMs?: number;
  };
}

export interface UseTestGenRunAPI {
  runId: string | undefined;
  nodes: readonly TestGenNode[];
  isRunning: boolean;
  mode: 'auto' | 'interactive';
  batchProgress: BatchProgress | null;
  selectedNodeId: NodeId | undefined;
  selectedNode: TestGenNode | undefined;
  selectNode: (id: NodeId | null) => void;
  agentLogs: any[];
  checkpointData: any | null;
  thinkingText: string | null;
  runSummary: RunSummary | null;
  isPending: boolean;
  isConnected: boolean;
  error: TestGenError | null;
  dismissError: () => void;
  runs: any[];
  start: (config: StartConfig) => Promise<string>;
  resume: (action: CheckpointAction, data?: { feedback?: string; editedData?: unknown }) => Promise<void>;
  abort: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  loadRun: (runId: string) => Promise<void>;
  isStarting: boolean;
  isAborting: boolean;
  isResuming: boolean;
  autoFollowEnabled: boolean;
  setAutoFollowEnabled: (enabled: boolean) => void;
  selectedAgentLog: any | null;
}

export function useTestGenRun(currentProjectId: string | null, options?: UseTestGenRunOptions): UseTestGenRunAPI {
  const { runId: explicitRunId, config: opts } = options ?? {};
  const autoFollow = opts?.autoFollow ?? true;
  const refetchLogsMs = opts?.refetchLogsMs ?? 3000;

  const [state, dispatch] = useReducer(testGenReducer, undefined, createInitialState);
  const { api } = useTestGenRunDeps();
  const queryClient = useQueryClient();
  const autoFollowTimeoutRef = useRef<number | null>(null);

  const { data: runs = [] } = useTestGenRuns(currentProjectId ?? '');

  useEffect(() => {
  }, [currentProjectId]);

  const sseUrl = useMemo(() => {
    const rid = explicitRunId ?? state.runId;
    return rid && state.isRunning ? `/api/pipeline/${rid}/stream` : null;
  }, [explicitRunId, state.runId, state.isRunning]);

  const handleSSEEvent = useCallback((event: { type: string; data: any }) => {
    dispatch({ type: 'SSE_EVENT', event });
  }, []);

  const sse = useSSEConnection({
    url: sseUrl,
    onEvent: handleSSEEvent,
    autoConnect: state.isRunning && !!sseUrl,
  });

  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', connected: sse.isConnected });
  }, [sse.isConnected]);

  useEffect(() => {
    if (state.isRunning) {
      const active = state.nodes.find(n => n.status === 'running' || n.status === 'waiting');
      if (active && active.id !== state.selectedNodeId) {
        dispatch({ type: 'SELECT_NODE', nodeId: active.id as NodeId });
      }
    }
    else if (state.autoFollowEnabled && state.nodes.some(n => n.id === 'complete' && n.status === 'completed')) {
      if (state.selectedNodeId !== 'complete') {
        dispatch({ type: 'SELECT_NODE', nodeId: 'complete' as NodeId });
      }
    }
  }, [state.nodes, state.isRunning, state.selectedNodeId, state.autoFollowEnabled]);

  const { data: agentLogs = [] } = useAgentLogs(
    state.runId ?? '', undefined, state.runId ? refetchLogsMs : 0,
  );

  useEffect(() => {
    if (!state.runId || !agentLogs.length) return;
    if (state.checkpointData) return;
    dispatch({ type: 'MERGE_AGENT_LOGS', logs: agentLogs });
  }, [agentLogs, state.runId, state.checkpointData]);

  const start = useCallback(async (config: StartConfig): Promise<string> => {
    if (!currentProjectId) throw new Error('No project selected');
    try {
      const { runId } = await api.start(currentProjectId, config);
      dispatch({ type: 'RUN_STARTED', runId, config });
      return runId;
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: { code: 'START_FAILED', message: err instanceof Error ? err.message : 'Failed to start pipeline' },
      });
      throw err;
    }
  }, [currentProjectId, api]);

  const resume = useCallback(async (action: CheckpointAction, data?: { feedback?: string; editedData?: unknown }) => {
    if (!state.runId) throw new Error('No active run');
    await api.resume(state.runId, { action, feedback: data?.feedback, editedData: data?.editedData });
  }, [state.runId, api]);

  const abort = useCallback(async () => {
    if (!state.runId) throw new Error('No active run');
    await api.abort(state.runId);
    sse.disconnect();
    dispatch({ type: 'RUN_ABORTED' });
  }, [state.runId, api, sse]);

  const refresh = useCallback(async () => {
    if (!state.runId) return;
    try {
      const runInfo = await api.get(state.runId);
      if (runInfo) {
        dispatch({
          type: 'RESTORE_RUN',
          runId: runInfo.id,
          phase: runInfo.phase,
          status: runInfo.status,
          checkpointData: runInfo.checkpoint_data,
          mode: runInfo.mode ?? state.mode,
          totalBatches: runInfo.total_batches,
        });
      }
    } catch {
    }
  }, [state.runId, state.mode, api]);

  const loadRun = useCallback(async (runId: string) => {
    try {
      const runInfo = await api.get(runId);
      if (runInfo) {
        dispatch({
          type: 'RESTORE_RUN',
          runId: runInfo.id,
          phase: runInfo.phase,
          status: runInfo.status,
          checkpointData: runInfo.checkpoint_data,
          mode: runInfo.mode ?? 'auto',
          totalBatches: runInfo.total_batches,
        });
        const logs = await api.logs(runId);
        if (logs.length > 0) {
          dispatch({ type: 'MERGE_AGENT_LOGS', logs });
        }
        const completedLogs = logs.filter((l: any) => l.status === 'COMPLETED');
        const totalCases = completedLogs.reduce((sum: number, l: any) => {
          const od = l.output_data;
          if (!od) return sum;
          const finalCases = od.finalTestCases;
          const count = Array.isArray(finalCases) ? finalCases.length : 0;
          return sum + count;
        }, 0);
        const tu = runInfo.token_usage;
        dispatch({
          type: 'SET_RUN_SUMMARY',
          summary: {
            totalCases,
            totalTokens: tu?.total_tokens || 0,
            totalLatencyMs: logs.reduce((sum: number, l: any) => sum + (l.latency_ms ?? 0), 0),
            totalBatches: runInfo.total_batches || 0,
          },
        });
      }
    } catch {
    }
  }, [api]);

  const setAutoFollowEnabled = useCallback((enabled: boolean) => {
    if (state.isRunning) {
      console.log('[AutoFollow] Cannot disable during pipeline execution');
      return;
    }
    if (autoFollowTimeoutRef.current !== null) {
      clearTimeout(autoFollowTimeoutRef.current);
      autoFollowTimeoutRef.current = null;
    }
    dispatch({ type: 'AUTO_FOLLOW_ENABLE', enabled });
  }, [state.isRunning]);

  const selectNode = useCallback((id: NodeId | null) => {
    dispatch({ type: 'SELECT_NODE', nodeId: id });
  }, []);

  const dismissError = useCallback(() => {
    dispatch({ type: 'DISMISS_ERROR' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    queryClient.invalidateQueries({ queryKey: queryKeys.testGen.runs(currentProjectId ?? '') });
  }, [currentProjectId, queryClient]);

  const selectedNode = state.selectedNodeId
    ? state.nodes.find(n => n.id === state.selectedNodeId)
    : undefined;

  const CHECKPOINT_AGENT_MAP: Record<string, string> = {
    checkpoint_1: 'test_analyst',
    checkpoint_2: 'test_designer',
    checkpoint_3: 'quality_manager',
  };

  const mergeOutputData = (logs: any[]): any => {
    const result: Record<string, any> = {};
    for (const log of logs) {
      const od = log.output_data;
      if (!od) continue;
      for (const [key, value] of Object.entries(od)) {
        if (Array.isArray(value)) {
          if (!Array.isArray(result[key])) result[key] = [];
          result[key] = [...result[key], ...value];
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  };

  const getMergedAgentLog = (agentName: string): any => {
    const logs = state.agentLogs.filter((l: any) => l.agent_name === agentName);
    if (logs.length === 0) return null;
    const latest = logs.reduce((best: any, l: any) =>
      (l.batch || 0) > (best?.batch || 0) ? l : best, logs[0]);
    const mergedOutputData = mergeOutputData(logs);
    const totalTokens = logs.reduce((sum: number, l: any) => {
      const tu = l.token_usage;
      return sum + (tu ? ((tu.input || 0) + (tu.output || 0) + (tu.reasoning || 0)) : 0);
    }, 0);
    const totalLatencyMs = logs.reduce((sum: number, l: any) => sum + (l.latency_ms ?? 0), 0);
    const allCompleted = logs.every((l: any) => l.status === 'COMPLETED');
    const anyFailed = logs.some((l: any) => l.status === 'FAILED');
    return {
      ...latest,
      output_data: mergedOutputData,
      token_usage: { input: 0, output: 0, reasoning: 0, total_tokens: totalTokens },
      latency_ms: totalLatencyMs,
      status: anyFailed ? 'FAILED' : allCompleted ? 'COMPLETED' : latest.status,
    };
  };

const selectedAgentLog = selectedNode?.agentName
  ? getMergedAgentLog(selectedNode.agentName) || null
  : selectedNode?.kind === 'checkpoint' && CHECKPOINT_AGENT_MAP[selectedNode.id]
  ? getMergedAgentLog(CHECKPOINT_AGENT_MAP[selectedNode.id]) || null
  : selectedNode?.kind === 'preparation'
  ? (getMergedAgentLog('preparation') || (selectedNode.meta?.initLogs
    ? { output_data: { initLogs: selectedNode.meta.initLogs, requirementCount: selectedNode.meta.requirementCount, totalBatches: selectedNode.meta.totalBatches, estimatedTokens: selectedNode.meta.estimatedTokens, flowCases: selectedNode.meta.flowCases } }
    : null))
  : null;

  const selectedCheckpointData = (() => {
    if (selectedNode?.kind !== 'checkpoint') return null;
    if (state.checkpointData) return state.checkpointData;
    const agentName = CHECKPOINT_AGENT_MAP[selectedNode.id];
    if (!agentName) return null;
    const log = getMergedAgentLog(agentName);
    if (!log?.output_data) return null;
    const od = log.output_data;
    if (selectedNode.id === 'checkpoint_1') {
      return { conditions: od.testConditions || [], analysis: od.analysis || od.requirementAnalysis || null };
    }
    if (selectedNode.id === 'checkpoint_2') {
      return { cases: od.draftTestCases || [] };
    }
    return { cases: od.finalTestCases || [], matrix: od.coverageMatrix || null };
  })();

return {
    runId: explicitRunId ?? state.runId ?? undefined,
    nodes: state.nodes,
    isRunning: state.isRunning,
    mode: state.mode,
    batchProgress: state.batchProgress,
    selectedNodeId: state.selectedNodeId ?? undefined,
    selectedNode,
    selectNode,
    agentLogs: state.agentLogs,
    checkpointData: selectedCheckpointData,
    thinkingText: state.selectedNodeId ? (state.thinkingTextByNode[state.selectedNodeId] ?? null) : null,
    runSummary: state.runSummary,
    isPending: !state.runId && !state.isRunning && runs.length === 0,
    isConnected: state.isConnected,
    error: state.error,
    dismissError,
    runs,
    start,
    resume,
    abort,
    refresh,
    reset,
    loadRun,
    isStarting: false,
    isAborting: false,
    isResuming: false,
    autoFollowEnabled: state.autoFollowEnabled,
    setAutoFollowEnabled,
    selectedAgentLog,
  };
}
