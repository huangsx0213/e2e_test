import { StateGraph, START, END, Annotation, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { TestCondition, NlTestCase, CoverageMatrix, Requirement, PipelineBusinessFlowBlueprint } from '../contracts/index.ts';
import type { AIProvider, ChatMessage } from './provider.ts';
import { createAgentContext, type AgentRole } from './agent.ts';
import { createAgentNode, createCheckpointNode, type AgentObserver } from './pipeline-nodes.ts';

export interface BatchContext {
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
}

const PipelineStateAnnotation = Annotation.Root({
  projectId: Annotation<string>,
  requirementIds: Annotation<string[]>,

  currentBatch: Annotation<Requirement[]>,
  batchContext: Annotation<BatchContext>,
  projectContext: Annotation<{ name: string; pages: { name: string }[]; endpoints: { name: string; method: string }[] }>,
  businessFlowBlueprints: Annotation<PipelineBusinessFlowBlueprint[] | undefined>,

  requirementAnalysis: Annotation<{ overallApproach: string; riskAssessmentSummary: string } | undefined>,
  testConditions: Annotation<TestCondition[] | undefined>,
  approvedConditions: Annotation<TestCondition[] | undefined>,

  draftTestCases: Annotation<NlTestCase[] | undefined>,
  approvedDraftCases: Annotation<NlTestCase[] | undefined>,
  humanReviewFeedback: Annotation<string>,

  finalTestCases: Annotation<NlTestCase[] | undefined>,
  coverageMatrix: Annotation<CoverageMatrix | undefined>,

  phase: Annotation<string>,
  errors: Annotation<{ phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[]>,
});

type PipelineState = typeof PipelineStateAnnotation.State;

interface Checkpoint1Response {
  conditions?: TestCondition[];
  analysis?: { overallApproach: string; riskAssessmentSummary: string };
  feedback?: string;
  retry?: boolean;
}

interface Checkpoint2Response {
  cases?: NlTestCase[];
  feedback?: string;
  retry?: boolean;
}

interface Checkpoint3Response {
  cases?: NlTestCase[];
  matrix?: CoverageMatrix;
  retry?: boolean;
}

export async function createNlPipeline(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}, callbacks?: AgentObserver, agentOpts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
}, checkpointer?: BaseCheckpointSaver) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst, agentOpts);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner, agentOpts);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager, agentOpts);

  console.log(`[pipeline:graph] building LangGraph state graph with 6 nodes, 5 edges...`);

  const observer: AgentObserver = callbacks ?? {};

  const node_analyst = createAgentNode(
    testAnalystCtx,
    'test_analyst',
    (state) => ({ requirements: state.currentBatch, batchContext: state.batchContext, projectContext: state.projectContext, businessFlowBlueprints: state.businessFlowBlueprints }),
    (raw) => {
      const result = raw.result as { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] };
      return { requirementAnalysis: result.requirementAnalysis, testConditions: result.testConditions, phase: 'review-conditions' };
    },
    { index: 0, name: 'Assess risk & priority' },
    [{ index: 1, name: 'Extract test conditions' }, { index: 2, name: 'Select ISTQB techniques' }],
    observer,
    agentOpts?.timeoutMs,
    agentOpts?.useCache,
    (state) => {
      const reqCount = state.currentBatch?.length ?? 0;
      const batchInfo = `batch ${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
      console.log(`[pipeline:graph] [agent_test_analyst] ENTER, ${batchInfo}, ${reqCount} requirements, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { testConditions: TestCondition[] };
      const tcCount = result.testConditions?.length ?? 0;
      console.log(`[pipeline:graph] [agent_test_analyst] EXIT, ${tcCount} test conditions generated, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint1 = createCheckpointNode<Checkpoint1Response>(
    (state) => ({ conditions: state.testConditions, analysis: state.requirementAnalysis }),
    (state, response) => ({
      approvedConditions: response?.conditions ?? state.testConditions,
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'design',
    }),
    () => ({ phase: 'analysis' }),
    (state) => {
      const tcCount = state.testConditions?.length ?? 0;
      console.log(`[pipeline:graph] [checkpoint_1] ENTER, ${tcCount} conditions awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[pipeline:graph] [checkpoint_1] retry requested, returning to analysis`); },
    (state, response) => {
      const approved = response?.conditions?.length ?? state.testConditions?.length ?? 0;
      console.log(`[pipeline:graph] [checkpoint_1] EXIT, ${approved} conditions approved, proceeding to design`);
    },
  );

  const node_designer = createAgentNode(
    testDesignerCtx,
    'test_designer',
    (state) => ({ conditions: state.approvedConditions, projectContext: state.projectContext, businessFlowBlueprints: state.businessFlowBlueprints }),
    (raw) => {
      const result = raw.result as { draftTestCases: NlTestCase[] };
      return { draftTestCases: result.draftTestCases, phase: 'review-draft' };
    },
    { index: 0, name: 'Design test cases' },
    [{ index: 1, name: 'Apply test techniques' }, { index: 2, name: 'Self-review quality' }],
    observer,
    agentOpts?.timeoutMs,
    agentOpts?.useCache,
    (state) => {
      const condCount = state.approvedConditions?.length ?? 0;
      console.log(`[pipeline:graph] [agent_test_designer] ENTER, ${condCount} conditions to design, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { draftTestCases: NlTestCase[] };
      const draftCount = result.draftTestCases?.length ?? 0;
      console.log(`[pipeline:graph] [agent_test_designer] EXIT, ${draftCount} draft test cases, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint2 = createCheckpointNode<Checkpoint2Response>(
    (state) => ({ cases: state.draftTestCases }),
    (state, response) => ({
      approvedDraftCases: response?.cases ?? state.draftTestCases,
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'quality',
    }),
    () => ({ phase: 'design' }),
    (state) => {
      const draftCount = state.draftTestCases?.length ?? 0;
      console.log(`[pipeline:graph] [checkpoint_2] ENTER, ${draftCount} draft cases awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[pipeline:graph] [checkpoint_2] retry requested, returning to design`); },
    (state, response) => {
      const approved = response?.cases?.length ?? state.draftTestCases?.length ?? 0;
      console.log(`[pipeline:graph] [checkpoint_2] EXIT, ${approved} draft cases approved, proceeding to quality`);
    },
  );

  const node_reviewer = createAgentNode(
    qualityManagerCtx,
    'quality_manager',
    (state) => ({ draftCases: state.approvedDraftCases, humanFeedback: state.humanReviewFeedback, businessFlowBlueprints: state.businessFlowBlueprints }),
    (raw) => {
      const result = raw.result as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
      return { finalTestCases: result.finalTestCases, coverageMatrix: result.coverageMatrix, phase: 'final-review' };
    },
    { index: 0, name: 'Review 6 dimensions' },
    [{ index: 1, name: 'Merge human feedback' }, { index: 2, name: 'Generate coverage matrix' }],
    observer,
    agentOpts?.timeoutMs,
    agentOpts?.useCache,
    (state) => {
      const draftCount = state.approvedDraftCases?.length ?? 0;
      const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
      console.log(`[pipeline:graph] [agent_quality_manager] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
      const finalCount = result.finalTestCases?.length ?? 0;
      const matrixRows = result.coverageMatrix?.rows?.length ?? 0;
      console.log(`[pipeline:graph] [agent_quality_manager] EXIT, ${finalCount} final test cases, ${matrixRows} coverage rows, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint3 = createCheckpointNode<Checkpoint3Response>(
    (state) => ({ cases: state.finalTestCases, matrix: state.coverageMatrix }),
    () => ({ phase: 'complete' }),
    () => ({ phase: 'quality' }),
    (state) => {
      const finalCount = state.finalTestCases?.length ?? 0;
      console.log(`[pipeline:graph] [checkpoint_3] ENTER, ${finalCount} final cases awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[pipeline:graph] [checkpoint_3] retry requested, returning to quality`); },
    () => { console.log(`[pipeline:graph] [checkpoint_3] EXIT, pipeline complete`); },
  );

  const graph = new StateGraph(PipelineStateAnnotation)
    .addNode('agent_test_analyst', node_analyst)
    .addNode('checkpoint_1', node_checkpoint1)
    .addNode('agent_test_designer', node_designer)
    .addNode('checkpoint_2', node_checkpoint2)
    .addNode('agent_quality_manager', node_reviewer)
    .addNode('checkpoint_3', node_checkpoint3);

  console.log(`[pipeline:graph] adding edges...`);
  graph.addEdge(START, 'agent_test_analyst');
  graph.addEdge('agent_test_analyst', 'checkpoint_1');
  graph.addEdge('agent_test_designer', 'checkpoint_2');
  graph.addEdge('agent_quality_manager', 'checkpoint_3');
  graph.addConditionalEdges('checkpoint_1', (state: PipelineState) => {
    const decision1 = state.phase === 'analysis' ? 'agent_test_analyst' : 'agent_test_designer';
    console.log(`[pipeline:graph] [checkpoint_1] routing: phase=${state.phase} -> ${decision1}`);
    if (state.phase === 'analysis') return 'agent_test_analyst';
    return 'agent_test_designer';
  });
  graph.addConditionalEdges('checkpoint_2', (state: PipelineState) => {
    const decision2 = state.phase === 'design' ? 'agent_test_designer' : 'agent_quality_manager';
    console.log(`[pipeline:graph] [checkpoint_2] routing: phase=${state.phase} -> ${decision2}`);
    if (state.phase === 'design') return 'agent_test_designer';
    return 'agent_quality_manager';
  });
  graph.addConditionalEdges('checkpoint_3', (state: PipelineState) => {
    const decision3 = state.phase === 'quality' ? 'agent_quality_manager' : END;
    console.log(`[pipeline:graph] [checkpoint_3] routing: phase=${state.phase} -> ${decision3 === END ? 'END' : decision3}`);
    if (state.phase === 'quality') return 'agent_quality_manager';
    return END;
  });

  console.log(`[pipeline:graph] compiling pipeline${checkpointer ? ' with checkpointer' : ''}...`);
  const compiled = graph.compile({ checkpointer });
  console.log(`[pipeline:graph] pipeline compiled`);
  return compiled;
}
