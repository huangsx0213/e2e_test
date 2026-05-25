import type { PipelineRunState, PipelineReducerAction, PipelineNode, NodeId } from './types';
import { createFreshNodes, buildRestoredNodes } from './types';

const CHECKPOINT_NODE_IDS: Record<number, NodeId> = { 1: 'checkpoint_1', 2: 'checkpoint_2', 3: 'checkpoint_3' };
const AGENT_NAME_TO_NODE_ID: Record<string, NodeId> = {
  test_analyst: 'agent_test_analyst',
  test_designer: 'agent_test_designer',
  quality_manager: 'agent_quality_manager',
};

export function createInitialState(): PipelineRunState {
  return {
    runId: null,
    mode: 'auto',
    startConfig: null,
    nodes: createFreshNodes(),
    selectedNodeId: null,
    autoFollowEnabled: true,
    batchProgress: null,
    checkpointData: null,
    thinkingTextByNode: {},
    runSummary: null,
    isConnected: false,
    error: null,
    isRunning: false,
    agentLogs: [],
  };
}

function markPrecedingDone(nodes: PipelineNode[], activeNodeId: NodeId): PipelineNode[] {
  const idx = nodes.findIndex(n => n.id === activeNodeId);
  return nodes.map((n, i) =>
    i < idx && n.status !== 'completed'
      ? { ...n, status: 'completed' as const, subSteps: n.subSteps?.map(s => ({ ...s, done: true })) }
      : n,
  );
}

export function pipelineReducer(state: PipelineRunState, action: PipelineReducerAction): PipelineRunState {
  switch (action.type) {
    case 'SSE_EVENT': {
      const { type, data } = action.event;
      let nodes = state.nodes;
      let checkpointData = state.checkpointData;
      let thinkingTextByNode = state.thinkingTextByNode;
      let batchProgress = state.batchProgress;
      let runSummary = state.runSummary;

      switch (type) {
        case 'agent:start': {
          const nodeId = AGENT_NAME_TO_NODE_ID[data.agentName];
          if (!nodeId) return state;
          nodes = markPrecedingDone(nodes, nodeId);
          nodes = nodes.map(n =>
            n.id === nodeId
              ? { ...n, status: 'running' as const, subSteps: n.subSteps?.map(s => ({ ...s, done: false, running: false })) }
              : n,
          );
          break;
        }
        case 'agent:complete': {
          const nodeId = AGENT_NAME_TO_NODE_ID[data.agentName];
          if (!nodeId) return state;
          nodes = nodes.map(n =>
            n.id === nodeId
              ? { ...n, status: 'completed' as const,
                meta: { ...n.meta, outputCount: data.outputCount, outputLabel: data.outputLabel || data.outputSummary,
                  tokenUsage: data.tokenUsage, latencyMs: data.latencyMs } }
              : n,
          );
          break;
        }
        case 'agent:step': {
          const nodeId = AGENT_NAME_TO_NODE_ID[data.agentName];
          if (!nodeId) return state;
          nodes = nodes.map(n =>
            n.id === nodeId && n.subSteps
              ? { ...n, subSteps: n.subSteps.map((s, i) => ({
                  ...s, done: i < data.stepIndex, running: i === data.stepIndex,
                })) }
              : n,
          );
          break;
        }
        case 'agent:thinking': {
          const nodeId = AGENT_NAME_TO_NODE_ID[data.agentName];
          if (!nodeId) return state;
          thinkingTextByNode = { ...thinkingTextByNode, [nodeId]: data.text };
          break;
        }
        case 'checkpoint:waiting': {
          const cpId = CHECKPOINT_NODE_IDS[data.checkpointNumber];
          if (!cpId) return state;
          checkpointData = data.payload;
          nodes = nodes.map(n =>
            n.id === cpId ? { ...n, status: 'waiting' as const } : n,
          );
          break;
        }
        case 'checkpoint:resolved': {
          const cpId = CHECKPOINT_NODE_IDS[data.checkpointNumber];
          if (!cpId) return state;
          checkpointData = null;
          nodes = markPrecedingDone(nodes, cpId);
          nodes = nodes.map(n =>
            n.id === cpId ? { ...n, status: 'completed' as const } : n,
          );
          break;
        }
        case 'batch:start':
          batchProgress = { current: data.batch, total: data.total, generatedCases: state.batchProgress?.generatedCases ?? 0 };
          break;
        case 'batch:complete':
          batchProgress = state.batchProgress
            ? { ...state.batchProgress, generatedCases: (state.batchProgress.generatedCases || 0) + (data.testCases || 0) }
            : null;
          break;
        case 'pipeline:complete':
          runSummary = {
            totalCases: data.stats?.totalCases || 0,
            totalTokens: data.stats?.totalTokens || 0,
            totalLatencyMs: data.stats?.totalLatencyMs || 0,
            totalBatches: data.stats?.totalBatches || 0,
          };
          nodes = nodes.map(n => ({
            ...n,
            status: n.status === 'running' || n.status === 'waiting' || n.status === 'idle'
              ? 'completed' as const : n.status,
            meta: n.id === 'complete' ? { ...n.meta, ...runSummary } : n.meta,
          }));
          return { ...state, nodes, checkpointData, thinkingTextByNode, batchProgress, runSummary, isRunning: false };
        case 'pipeline:error':
          return { ...state, error: { code: 'API_ERROR', message: data.message || 'Pipeline error', detail: data } };
        default:
          return state;
      }
      return { ...state, nodes, checkpointData, thinkingTextByNode, batchProgress, runSummary };
    }

    case 'RUN_STARTED':
      return {
        ...state,
        runId: action.runId,
        startConfig: action.config,
        mode: action.config.mode,
        nodes: createFreshNodes(),
        selectedNodeId: null,
        batchProgress: null,
        checkpointData: null,
        thinkingTextByNode: {},
        runSummary: null,
        error: null,
        isRunning: true,
        autoFollowEnabled: true,
      };

    case 'RUN_ABORTED':
      return {
        ...state,
        isRunning: false,
        isConnected: false,
        error: null,
        thinkingTextByNode: {},
      };

    case 'RESTORE_RUN': {
      const { nodes: restoredNodes, checkpointDataResult } = buildRestoredNodes(
        action.phase, action.status, action.checkpointData, action.totalBatches,
      );
      const isRunning = action.status !== 'COMPLETED' && action.status !== 'FAILED';
      return {
        ...state,
        runId: action.runId,
        mode: action.mode ?? state.mode,
        nodes: restoredNodes,
        isRunning,
        checkpointData:         checkpointDataResult,
        thinkingTextByNode: {},
        error: null,
        agentLogs: [],
      };
    }

    case 'MERGE_AGENT_LOGS': {
      const nodes: PipelineNode[] = state.nodes.map(n => {
        if (n.id === 'complete') {
          const logs = action.logs ?? [];
          const completedLogs = logs.filter((l: any) => l.status === 'COMPLETED');
          let totalOutputCount = 0;
          let totalTokens = 0;
          let totalLatencyMs = 0;
          const mergedOutputData: Record<string, any> = {};
          for (const log of completedLogs) {
            const od = log.output_data;
            if (od) {
              const finalCases = od.finalTestCases;
              const count = Array.isArray(finalCases) ? finalCases.length : 0;
              totalOutputCount += count;
              for (const [key, val] of Object.entries(od)) {
                if (!(key in mergedOutputData)) mergedOutputData[key] = val;
              }
            }
            const tu = log.token_usage;
            if (tu) totalTokens += (tu.input || 0) + (tu.output || 0) + (tu.reasoning || 0);
            totalLatencyMs += log.latency_ms ?? 0;
          }
          return {
            ...n, status: 'completed' as const,
            meta: { ...n.meta, outputCount: totalOutputCount, tokenUsage: totalTokens, latencyMs: totalLatencyMs, totalCases: totalOutputCount, totalTokens, totalLatencyMs, totalBatches: n.meta?.totalBatches ?? 0, outputData: Object.keys(mergedOutputData).length > 0 ? mergedOutputData : undefined },
          };
        }
        if (!n.agentName) return n;
        const agentLogs = (action.logs ?? []).filter((l: any) => l.agent_name === n.agentName);
        if (agentLogs.length === 0) return n;
        // Use latest batch's status, but merge output_data and sum stats across all batches
        const latest = agentLogs.reduce((best: any, l: any) =>
          (l.batch || 0) > (best?.batch || 0) ? l : best, agentLogs[0]);
        let outputCount = 0;
        const mergedOutputData: Record<string, any> = {};
        let totalTokens = 0;
        let totalLatencyMs = 0;
        for (const log of agentLogs) {
          const od = log.output_data;
          if (od) {
            outputCount += (Object.values(od) as any[]).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0);
            for (const [key, val] of Object.entries(od)) {
              if (Array.isArray(val)) {
                if (!Array.isArray(mergedOutputData[key])) mergedOutputData[key] = [];
                mergedOutputData[key] = [...mergedOutputData[key], ...val];
              } else {
                mergedOutputData[key] = val;
              }
            }
          }
          const tu = log.token_usage;
          if (tu) totalTokens += (tu.input || 0) + (tu.output || 0) + (tu.reasoning || 0);
          totalLatencyMs += log.latency_ms ?? 0;
        }
        const status = latest.status === 'COMPLETED' ? 'completed' as const :
                       latest.status === 'FAILED' ? 'error' as const :
                       n.status;
        return { ...n, status, meta: { ...n.meta, tokenUsage: totalTokens, latencyMs: totalLatencyMs, outputCount, outputData: Object.keys(mergedOutputData).length > 0 ? mergedOutputData : undefined } };
      });
      return { ...state, nodes, agentLogs: action.logs ?? [] };
    }

    case 'SET_RUN_SUMMARY':
      return { ...state, runSummary: action.summary };

    case 'SELECT_NODE':
      return {
        ...state,
        selectedNodeId: action.nodeId,
        autoFollowEnabled: action.nodeId === null,
      };

    case 'AUTO_FOLLOW_ENABLE':
      return { ...state, autoFollowEnabled: action.enabled };

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.connected };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'DISMISS_ERROR':
      return { ...state, error: null };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}
