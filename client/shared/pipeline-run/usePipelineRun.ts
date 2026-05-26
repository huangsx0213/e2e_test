import { useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelineRuns, useAgentLogs } from '../hooks/useQueryHooks';
import { queryKeys } from '../hooks/queryKeys';
import { useSSEConnection } from '../sse/useSSEConnection';
import { pipelineReducer, createInitialState } from './pipeline-reducer';
import { usePipelineRunDeps } from './PipelineRunProvider';
import type {
  NodeId, RunSummary, PipelineError, StartConfig,
  CheckpointAction, PipelineNode, BatchProgress,
} from './types';
import { PIPELINE_NODE_DEFS } from './types';

export interface UsePipelineRunOptions {
  runId?: string;
  config?: {
    autoFollow?: boolean;
    autoRecover?: boolean;
    refetchLogsMs?: number;
  };
}

export interface UsePipelineRunAPI {
  runId: string | undefined;
  nodes: readonly PipelineNode[];
  isRunning: boolean;
  mode: 'auto' | 'interactive';
  batchProgress: BatchProgress | null;
  selectedNodeId: NodeId | undefined;
  selectedNode: PipelineNode | undefined;
  selectNode: (id: NodeId | null) => void;
  agentLogs: any[];
  checkpointData: any | null;
  thinkingText: string | null;
  runSummary: RunSummary | null;
  isPending: boolean;
  isConnected: boolean;
  error: PipelineError | null;
  dismissError: () => void;
  runs: any[];
  start: (config: StartConfig) => Promise<string>;
  resume: (action: CheckpointAction, data?: { feedback?: string }) => Promise<void>;
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

export function usePipelineRun(currentProjectId: string | null, options?: UsePipelineRunOptions): UsePipelineRunAPI {
  const { runId: explicitRunId, config: opts } = options ?? {};
  const autoFollow = opts?.autoFollow ?? true;
  const refetchLogsMs = opts?.refetchLogsMs ?? 3000;

  const [state, dispatch] = useReducer(pipelineReducer, undefined, createInitialState);
  const { api } = usePipelineRunDeps();
  const queryClient = useQueryClient();
  const autoFollowTimeoutRef = useRef<number | null>(null);

  // Fetch runs list
  const { data: runs = [] } = usePipelineRuns(currentProjectId ?? '');

  // Auto-detect active run on mount - DISABLED by default
  // User must explicitly select a run from history to load data
  useEffect(() => {
    // Disabled: do not auto-restore active runs on mount
    // This keeps the pipeline empty on page load
  }, [currentProjectId]);

  // SSE URL
  const sseUrl = useMemo(() => {
    const rid = explicitRunId ?? state.runId;
    return rid && state.isRunning ? `/api/pipeline/${rid}/stream` : null;
  }, [explicitRunId, state.runId, state.isRunning]);

  // SSE connection
  const handleSSEEvent = useCallback((event: { type: string; data: any }) => {
    dispatch({ type: 'SSE_EVENT', event });
  }, []);

  const sse = useSSEConnection({
    url: sseUrl,
    onEvent: handleSSEEvent,
    autoConnect: state.isRunning && !!sseUrl,
  });

  // Sync connection status
  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', connected: sse.isConnected });
  }, [sse.isConnected]);

  // Auto-follow: continuously track the active node during pipeline execution
  // This effect runs whenever nodes change, ensuring we always follow the active node
  useEffect(() => {
    // Always track during pipeline execution (cannot be disabled)
    if (state.isRunning) {
      const active = state.nodes.find(n => n.status === 'running' || n.status === 'waiting');
      if (active && active.id !== state.selectedNodeId) {
        dispatch({ type: 'SELECT_NODE', nodeId: active.id as NodeId });
      }
    } 
    // After completion: only track if auto-follow is enabled
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
    // Don't merge if there's an active checkpoint — preserves user edits
    if (state.checkpointData) return;
    dispatch({ type: 'MERGE_AGENT_LOGS', logs: agentLogs });
  }, [agentLogs, state.runId, state.checkpointData]);

  // Actions
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

  const resume = useCallback(async (action: CheckpointAction, data?: { feedback?: string }) => {
    if (!state.runId) throw new Error('No active run');
    await api.resume(state.runId, { action, feedback: data?.feedback });
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
      // Best effort
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
      // Best effort
    }
  }, [api]);

  const setAutoFollowEnabled = useCallback((enabled: boolean) => {
    // During pipeline execution, force auto-follow to stay enabled
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
    // Note: auto-follow is always active during pipeline execution
    // User can only disable it after pipeline completes
  }, []);

  const dismissError = useCallback(() => {
    dispatch({ type: 'DISMISS_ERROR' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.runs(currentProjectId ?? '') });
  }, [currentProjectId, queryClient]);

// Derived selectedNode
  const selectedNode = state.selectedNodeId
    ? state.nodes.find(n => n.id === state.selectedNodeId)
    : undefined;

  // Map checkpoint node IDs to the agent whose output they should display
  const CHECKPOINT_AGENT_MAP: Record<string, string> = {
    checkpoint_1: 'test_analyst',
    checkpoint_2: 'test_designer',
    checkpoint_3: 'quality_manager',
  };

  // Merge output_data from multiple logs into one (concatenates arrays, keeps last non-null for objects)
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

  // Get logs for agent (all batches), with merged output_data and aggregated stats
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

// For agent nodes or checkpoint nodes, get the corresponding agent log (merged for multi-batch)
// For preparation nodes: try agentLogs first (historical runs), then fall back to node meta (same-session SSE)
const selectedAgentLog = selectedNode?.agentName
  ? getMergedAgentLog(selectedNode.agentName) || null
  : selectedNode?.kind === 'checkpoint' && CHECKPOINT_AGENT_MAP[selectedNode.id]
  ? getMergedAgentLog(CHECKPOINT_AGENT_MAP[selectedNode.id]) || null
  : selectedNode?.kind === 'preparation'
  ? (getMergedAgentLog('preparation') || (selectedNode.meta?.initLogs
    ? { output_data: { initLogs: selectedNode.meta.initLogs, requirementCount: selectedNode.meta.requirementCount, totalBatches: selectedNode.meta.totalBatches, estimatedTokens: selectedNode.meta.estimatedTokens, flowCases: selectedNode.meta.flowCases } }
    : null))
  : null;

  // For checkpoint nodes, derive checkpoint data from matching agent log output
  const selectedCheckpointData = (() => {
    if (selectedNode?.kind !== 'checkpoint') return null;
    // If state has checkpointData (active checkpoint), use it
    if (state.checkpointData) return state.checkpointData;
    // Otherwise derive from agent logs (survives SSE misses)
    const agentName = CHECKPOINT_AGENT_MAP[selectedNode.id];
    if (!agentName) return null;
    const log = getMergedAgentLog(agentName);
    if (!log?.output_data) return null;
    const od = log.output_data;
    // Normalize field names from agent output_data to match checkpoint payload format
    if (selectedNode.id === 'checkpoint_1') {
      return { conditions: od.testConditions || [], analysis: od.analysis || od.requirementAnalysis || null };
    }
    if (selectedNode.id === 'checkpoint_2') {
      return { cases: od.draftTestCases || [] };
    }
    // checkpoint_3
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
