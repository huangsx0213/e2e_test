export type NodeId =
  | 'preparation'
  | 'agent_test_analyst'
  | 'checkpoint_1'
  | 'agent_test_designer'
  | 'checkpoint_2'
  | 'agent_quality_manager'
  | 'checkpoint_3'
  | 'complete';

export type NodeStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'auto-passed';
export type NodeKind = 'preparation' | 'agent' | 'checkpoint' | 'complete';
export type RunMode = 'auto' | 'interactive';

export interface TestGenNode {
  id: NodeId;
  label: string;
  kind: NodeKind;
  status: NodeStatus;
  agentName?: string;
  subSteps?: { label: string; done: boolean; running?: boolean }[];
  meta?: {
    tokenUsage?: number;
    latencyMs?: number;
    outputCount?: number;
    outputLabel?: string;
    errorMessage?: string;
    totalCases?: number;
    totalBatches?: number;
    totalTokens?: number;
    totalLatencyMs?: number;
    outputData?: any;
    initLogs?: Array<{ type: string; data: any; timestamp: string }>;
    requirementCount?: number;
    estimatedTokens?: number;
    flowCases?: number;
    // L1 Epic 索引（preparation:context 事件注入）
    globalStats?: { totalRequirements: number; totalEpics: number; totalFlows: number };
    globalEpicIndex?: Array<{
      epicId: string;
      title: string;
      requirementCount: number;
      flowCount: number;
    }>;
  };
}

export interface BatchProgress {
  current: number;
  total: number;
  generatedCases: number;
}

export interface RunSummary {
  totalCases: number;
  totalTokens: number;
  totalLatencyMs: number;
  totalBatches: number;
}

export interface TestGenError {
  code: 'DISCONNECTED' | 'API_ERROR' | 'INVALID_STATE' | 'RECOVERY_FAILED' | 'START_FAILED';
  message: string;
  detail?: unknown;
}

export type CheckpointAction = 'approve' | 'edit' | 'retry' | 'continue';

export interface StartConfig {
  requirementIds: string[];
  providerConfigName?: string;
  model?: string;
  modelName?: string;
  mode: RunMode;
  flowIds?: string[];
  useCache?: boolean;
  reasoningEffort?: string;
  reasoningSummary?: string;
  textVerbosity?: string;
  referenceRunIds?: string[];
}

export interface TestGenEvent {
  type: string;
  data: any;
}

export interface ThinkingEntry {
  type: 'reasoning' | 'content';
  phase: 'react' | 'extraction';
  text: string;
  timestamp: number;
  batch?: number;
}

export interface TestGenRunState {
  runId: string | null;
  mode: RunMode;
  startConfig: StartConfig | null;
  nodes: TestGenNode[];
  selectedNodeId: NodeId | null;
  autoFollowEnabled: boolean;
  batchProgress: BatchProgress | null;
  checkpointData: any | null;
  thinkingTextByNode: Record<string, ThinkingEntry[]>;
  runSummary: RunSummary | null;
  isConnected: boolean;
  error: TestGenError | null;
  isRunning: boolean;
  agentLogs: any[];
  modelName: string | null;
}

export type TestGenReducerAction =
  | { type: 'SSE_EVENT'; event: TestGenEvent }
  | { type: 'RUN_STARTED'; runId: string; config: StartConfig }
  | { type: 'RUN_ABORTED' }
  | { type: 'RETRY_STARTED'; nodeId: NodeId }
  | { type: 'RESTORE_RUN'; runId: string; phase: string; status: string; mode?: RunMode; totalBatches?: number }
  | { type: 'SET_CHECKPOINT_DATA'; checkpointData: any; phase: string }
  | { type: 'MERGE_AGENT_LOGS'; logs: any[] }
  | { type: 'SET_RUN_SUMMARY'; summary: RunSummary }
  | { type: 'SELECT_NODE'; nodeId: NodeId | null }
  | { type: 'AUTO_FOLLOW_ENABLE'; enabled: boolean }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'SET_ERROR'; error: TestGenError | null }
  | { type: 'DISMISS_ERROR' }
  | { type: 'RESET' }
  | { type: 'SET_THINKING_DATA'; thinkingData: Record<string, ThinkingEntry[]> }
  | { type: 'RESTORE_RUN_COMPLETE'; runId: string; phase: string; status: string; mode?: RunMode; totalBatches?: number; checkpointData?: any; logs: any[]; summary: RunSummary; modelName?: string | null; startConfig?: StartConfig | null };

export type TestGenNodeDef = Pick<TestGenNode, 'id' | 'label' | 'kind' | 'agentName' | 'subSteps'>;

export const TEST_GEN_NODE_DEFS: TestGenNodeDef[] = [
  { id: 'preparation', label: 'Preparation', kind: 'preparation' },
  { id: 'agent_test_analyst', label: 'Test Analyst', kind: 'agent', agentName: 'test-analyst',
    subSteps: [
      { label: 'Assess risk & priority', done: false },
      { label: 'Extract test conditions', done: false },
      { label: 'Select ISTQB techniques', done: false },
    ] },
  { id: 'checkpoint_1', label: 'Review Conditions', kind: 'checkpoint' },
  { id: 'agent_test_designer', label: 'Test Designer', kind: 'agent', agentName: 'test-designer',
    subSteps: [
      { label: 'Design test cases', done: false },
      { label: 'Apply test techniques', done: false },
      { label: 'Self-review quality', done: false },
    ] },
  { id: 'checkpoint_2', label: 'Review Drafts', kind: 'checkpoint' },
  { id: 'agent_quality_manager', label: 'Quality Manager', kind: 'agent', agentName: 'quality-manager',
    subSteps: [
      { label: 'Review 6 dimensions', done: false },
      { label: 'Merge human feedback', done: false },
      { label: 'Generate coverage matrix', done: false },
    ] },
  { id: 'checkpoint_3', label: 'Final Review', kind: 'checkpoint' },
  { id: 'complete', label: 'Complete', kind: 'complete' },
] as const;

const PHASE_TO_DONE: Record<string, NodeId[]> = {
  init: [],
  analysis: ['preparation'],
  'review-conditions': ['preparation', 'agent_test_analyst'],
  design: ['preparation', 'agent_test_analyst', 'checkpoint_1'],
  'review-draft': ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer'],
  quality: ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer', 'checkpoint_2'],
  'final-review': ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer', 'checkpoint_2', 'agent_quality_manager'],
  complete: ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer', 'checkpoint_2', 'agent_quality_manager', 'checkpoint_3'],
  // Server-side phase values (backward compatibility)
  checkpoint_1: ['preparation', 'agent_test_analyst'],
  checkpoint_2: ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer'],
  checkpoint_3: ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer', 'checkpoint_2', 'agent_quality_manager'],
};

const PHASE_TO_CURRENT: Record<string, NodeId> = {
  analysis: 'agent_test_analyst',
  'review-conditions': 'checkpoint_1',
  design: 'agent_test_designer',
  'review-draft': 'checkpoint_2',
  quality: 'agent_quality_manager',
  'final-review': 'checkpoint_3',
  // Server-side phase values (backward compatibility)
  checkpoint_1: 'checkpoint_1',
  checkpoint_2: 'checkpoint_2',
  checkpoint_3: 'checkpoint_3',
};

export function createFreshNodes(): TestGenNode[] {
  return TEST_GEN_NODE_DEFS.map(def => ({
    ...def,
    status: 'idle' as NodeStatus,
    subSteps: def.subSteps?.map(s => ({ ...s })),
  }));
}

export function buildRestoredNodes(
  phase: string,
  status: string,
  totalBatches?: number,
): TestGenNode[] {
  const isWaiting = status === 'WAITING_REVIEW';
  const isCompleted = status === 'COMPLETED';
  const doneNodes = PHASE_TO_DONE[phase] || (isCompleted ? ['preparation', 'agent_test_analyst', 'checkpoint_1', 'agent_test_designer', 'checkpoint_2', 'agent_quality_manager', 'checkpoint_3'] : []);
  const currentNodeId = PHASE_TO_CURRENT[phase];
  
  return createFreshNodes().map(n => ({
    ...n,
    status: doneNodes.includes(n.id) ? 'completed' as const
      : n.id === currentNodeId
        ? (isWaiting ? 'waiting' as const : 'running' as const)
        : isCompleted && n.id === 'complete'
          ? 'completed' as const
          : n.status,
    subSteps: n.subSteps?.map(s => ({ ...s, done: doneNodes.includes(n.id) || (isCompleted && n.id === 'complete') })),
    meta: n.id === 'complete' && totalBatches != null
      ? { ...n.meta, totalBatches }
      : n.meta,
  }));
}
