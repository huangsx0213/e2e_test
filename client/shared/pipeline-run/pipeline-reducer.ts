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
    thinkingText: null,
    runSummary: null,
    isConnected: false,
    error: null,
    isRunning: false,
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
      let thinkingText = state.thinkingText;
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
          thinkingText = data.text;
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
          thinkingText = null;
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
          thinkingText = null;
          return { ...state, nodes, checkpointData, thinkingText, batchProgress, runSummary, isRunning: false };
        case 'pipeline:error':
          return { ...state, error: { code: 'API_ERROR', message: data.message || 'Pipeline error', detail: data } };
        default:
          return state;
      }
      return { ...state, nodes, checkpointData, thinkingText, batchProgress, runSummary };
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
        thinkingText: null,
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
        thinkingText: null,
      };

    case 'RESTORE_RUN': {
      const { nodes: restoredNodes, checkpointDataResult } = buildRestoredNodes(
        action.phase, action.status, action.checkpointData,
      );
      const isRunning = action.status !== 'COMPLETED' && action.status !== 'FAILED';
      return {
        ...state,
        runId: action.runId,
        mode: action.mode ?? state.mode,
        nodes: restoredNodes,
        isRunning,
        checkpointData: checkpointDataResult,
        thinkingText: null,
        error: null,
      };
    }

    case 'MERGE_AGENT_LOGS': {
      const nodes: PipelineNode[] = state.nodes.map(n => {
        if (!n.agentName) return n;
        const log = (action.logs ?? []).find((l: any) => l.agent_name === n.agentName);
        if (!log) return n;
        const outputData = log.output_data;
        const outputCount: number = outputData
          ? (Object.values(outputData) as any[]).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0)
          : 0;
        const tu = log.token_usage;
        const totalTokens: number = tu ? ((tu.input || 0) + (tu.output || 0) + (tu.reasoning || 0)) : 0;
        const status = log.status === 'COMPLETED' ? 'completed' as const :
                       log.status === 'FAILED' ? 'error' as const :
                       n.status;
        return { ...n, status, meta: { ...n.meta, tokenUsage: totalTokens, latencyMs: log.latency_ms ?? 0, outputCount, outputData } };
      });
      return { ...state, nodes };
    }

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
