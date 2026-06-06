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
  startRetry: (nodeId: NodeId) => void;
  abort: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshCheckpointData: () => Promise<void>;
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
    return rid && state.isRunning ? `/api/test-gen/${rid}/stream` : null;
  }, [explicitRunId, state.runId, state.isRunning]);

  const handleSSEEvent = useCallback((event: { type: string; data: any }) => {
    if (event.type === 'agent:thinking') {
      console.log(`[useTestGenRun] SSE agent:thinking agent=${event.data?.agentName} textLen=${(event.data?.text ?? '').length}`);
    }
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

  // Auto-select active node (running or waiting) when pipeline is running
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

  const resume = useCallback(async (action: CheckpointAction, data?: { feedback?: string; editedData?: any }) => {
    if (!state.runId) throw new Error('No active run');
    await api.resume(state.runId, { action, feedback: data?.feedback, editedData: data?.editedData });
  }, [state.runId, api]);

  const abort = useCallback(async () => {
    if (!state.runId) throw new Error('No active run');
    await api.abort(state.runId);
    sse.disconnect();
    dispatch({ type: 'RUN_ABORTED' });
  }, [state.runId, api, sse]);

  const startRetry = useCallback((nodeId: NodeId) => {
    dispatch({ type: 'RETRY_STARTED', nodeId });
  }, []);

  const PHASE_TO_CP: Record<string, number> = {
    'review-conditions': 1, 'review-draft': 2, 'final-review': 3,
  };

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
          mode: runInfo.mode ?? state.mode,
          totalBatches: runInfo.total_batches,
        });
        if (runInfo.thread_id) {
          const cpState = await api.testGen.getCheckpointState(state.runId);
          if (cpState?.checkpointData) {
            dispatch({ type: 'SET_CHECKPOINT_DATA', checkpointData: cpState.checkpointData, phase: runInfo.phase });
          }
        }
        const logs = await api.logs(state.runId);
        if (logs.length > 0) {
          dispatch({ type: 'MERGE_AGENT_LOGS', logs });
        }
        queryClient.setQueryData([...queryKeys.testGen.logs(state.runId), 'all'], logs);

        // For completed runs, set checkpoint data from fresh logs so it survives
        // the RESTORE_RUN → MERGE_AGENT_LOGS gap (race with useAgentLogs effect)
        const cpNodeId = state.selectedNodeId;
        const cpAgentName = cpNodeId ? CHECKPOINT_AGENT_MAP[cpNodeId] : undefined;
        if (!state.isRunning && cpAgentName) {
          const agentLogs = logs.filter((l: any) => l.agent_name === cpAgentName);
          if (agentLogs.length > 0) {
            const od = mergeOutputData(agentLogs);
            let cpData: Record<string, any> | null = null;
            if (cpNodeId === 'checkpoint_1') {
              cpData = { conditions: od.testConditions || [], analysis: od.analysis || od.requirementAnalysis || null };
            } else if (cpNodeId === 'checkpoint_2') {
              cpData = { cases: od.draftTestCases || [] };
            } else if (cpNodeId === 'checkpoint_3') {
              cpData = { cases: od.finalTestCases || [], matrix: od.coverageMatrix || null };
            }
            if (cpData) {
              dispatch({ type: 'SET_CHECKPOINT_DATA', checkpointData: cpData, phase: runInfo.phase });
            }
          }
        }
      }
    } catch {
    }
  }, [state.runId, state.mode, api, queryClient, state.isRunning, state.selectedNodeId]);

  const refreshCheckpointData = useCallback(async () => {
    if (!state.runId) return;
    try {
      const [logs, cpState] = await Promise.all([
        api.logs(state.runId),
        api.testGen.getCheckpointState(state.runId),
      ]);
      const logsArr = logs ?? [];
      if (logsArr.length > 0) {
        dispatch({ type: 'MERGE_AGENT_LOGS', logs: logsArr });
      }
      if (cpState?.checkpointData) {
        dispatch({ type: 'SET_CHECKPOINT_DATA', checkpointData: cpState.checkpointData, phase: '' });
        return;
      }
      // Completed run: compute checkpoint data from agent logs
      const cpNodeId = state.selectedNodeId;
      const cpAgentName = cpNodeId ? CHECKPOINT_AGENT_MAP[cpNodeId] : undefined;
      if (!state.isRunning && cpAgentName && logsArr.length > 0) {
        const agentLogs = logsArr.filter((l: any) => l.agent_name === cpAgentName);
        if (agentLogs.length > 0) {
          const od = mergeOutputData(agentLogs);
          let cpData: Record<string, any> | null = null;
          if (cpNodeId === 'checkpoint_1') {
            cpData = { conditions: od.testConditions || [], analysis: od.analysis || od.requirementAnalysis || null };
          } else if (cpNodeId === 'checkpoint_2') {
            cpData = { cases: od.draftTestCases || [] };
          } else if (cpNodeId === 'checkpoint_3') {
            cpData = { cases: od.finalTestCases || [], matrix: od.coverageMatrix || null };
          }
          if (cpData) {
            dispatch({ type: 'SET_CHECKPOINT_DATA', checkpointData: cpData, phase: '' });
          }
        }
      }
    } catch {
    }
  }, [state.runId, state.isRunning, state.selectedNodeId, api]);

  const loadRun = useCallback(async (runId: string) => {
    let logs: any[] = [];
    try {
      const runInfo = await api.get(runId);
      if (runInfo) {
        dispatch({
          type: 'RESTORE_RUN',
          runId: runInfo.id,
          phase: runInfo.phase,
          status: runInfo.status,
          mode: runInfo.mode ?? 'auto',
          totalBatches: runInfo.total_batches,
        });
        if (runInfo.thread_id) {
          const cpState = await api.testGen.getCheckpointState(runId);
          if (cpState?.checkpointData) {
            dispatch({ type: 'SET_CHECKPOINT_DATA', checkpointData: cpState.checkpointData, phase: runInfo.phase });
          }
        }
        logs = await api.logs(runId);
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
      queryClient.setQueryData([...queryKeys.testGen.logs(runId), 'all'], logs);
    } catch {
    }
  }, [api, queryClient]);

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
    checkpoint_1: 'test-analyst',
    checkpoint_2: 'test-designer',
    checkpoint_3: 'quality-manager',
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
    const normalize = (n: string) => n.replace(/_/g, '-');
    const target = normalize(agentName);
    const logs = state.agentLogs.filter((l: any) => normalize(l.agent_name) === target);
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
    if (!state.isRunning) {
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
    }
    return null;
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
    startRetry,
    abort,
    refresh,
    refreshCheckpointData,
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
