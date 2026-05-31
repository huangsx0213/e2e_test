import { StateGraph, START, END, Annotation, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { TestCondition, NlTestCase, CoverageMatrix, Requirement, PipelineBusinessFlowBlueprint } from '../contracts/index.ts';
import type { AIProvider, ChatMessage } from '../ai/provider.ts';
import { createAgentContext, type AgentRole } from '../ai/agent.ts';
import { createAgentNode, createCheckpointNode, type AgentObserver } from '../ai/pipeline-nodes.ts';
import { ToolRegistry } from '../ai/tool-registry.ts';
import { ToolOrchestrator } from '../ai/tool-orchestrator.ts';
import { AgentTool } from '../ai/tool.ts';
import type { SerializedReactLoopState } from '../ai/react-loop-state.ts';

export interface BatchContext {
  currentBatch: number;
  totalBatches: number;
  processedCount: number;
}

const TestGenStateAnnotation = Annotation.Root({
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

type TestGenState = typeof TestGenStateAnnotation.State;

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
  feedback?: string;
  retry?: boolean;
}

export async function createTestGenerationPipeline(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}, callbacks?: AgentObserver, agentOpts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  signal?: AbortSignal;
}, checkpointer?: BaseCheckpointSaver) {
  return createPipelineDirect(provider, roles, callbacks, agentOpts, checkpointer);
}

function createPipelineDirect(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}, callbacks?: AgentObserver, agentOpts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  signal?: AbortSignal;
}, checkpointer?: BaseCheckpointSaver) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst, agentOpts);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner, agentOpts);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager, agentOpts);

  console.log(`[test-gen:graph] building LangGraph state graph with 6 nodes, 5 edges...`);

  const observer: AgentObserver = callbacks ?? {};

  const node_analyst = createAgentNode(
    testAnalystCtx,
    'test_analyst',
    (state) => ({
      requirements: state.currentBatch,
      batchContext: state.batchContext,
      projectContext: state.projectContext,
      businessFlowBlueprints: state.businessFlowBlueprints,
      previousConditions: state.testConditions,
      humanFeedback: state.humanReviewFeedback,
    }),
    (raw) => {
      const result = raw.result as { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] };
      return { requirementAnalysis: result.requirementAnalysis, testConditions: result.testConditions, phase: 'review-conditions' };
    },
    { index: 0, name: 'Assess risk & priority' },
    [{ index: 1, name: 'Extract test conditions' }, { index: 2, name: 'Select ISTQB techniques' }],
    observer,
    agentOpts?.timeoutMs,
    agentOpts?.useCache,
    agentOpts?.signal,
    (state) => {
      const reqCount = state.currentBatch?.length ?? 0;
      const batchInfo = `batch ${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
      console.log(`[test-gen:graph] [agent_test_analyst] ENTER, ${batchInfo}, ${reqCount} requirements, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { testConditions: TestCondition[] };
      const tcCount = result.testConditions?.length ?? 0;
      console.log(`[test-gen:graph] [agent_test_analyst] EXIT, ${tcCount} test conditions generated, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint1 = createCheckpointNode<Checkpoint1Response>(
    (state) => ({ conditions: state.testConditions, analysis: state.requirementAnalysis }),
    (state, response) => ({
      approvedConditions: response?.conditions ?? state.testConditions ?? [],
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'design',
    }),
    (state, response) => ({
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'analysis',
    }),
    (state) => {
      const tcCount = state.testConditions?.length ?? 0;
      console.log(`[test-gen:graph] [checkpoint_1] ENTER, ${tcCount} conditions awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[test-gen:graph] [checkpoint_1] retry requested, returning to analysis`); },
    (state, response) => {
      const approved = response?.conditions?.length ?? state.testConditions?.length ?? 0;
      console.log(`[test-gen:graph] [checkpoint_1] EXIT, ${approved} conditions approved, proceeding to design`);
    },
  );

  const node_designer = createAgentNode(
    testDesignerCtx,
    'test_designer',
    (state) => ({
      conditions: state.approvedConditions,
      projectContext: state.projectContext,
      businessFlowBlueprints: state.businessFlowBlueprints,
      previousDraftCases: state.draftTestCases,
      humanFeedback: state.humanReviewFeedback,
    }),
    (raw) => {
      const result = raw.result as { draftTestCases: NlTestCase[] };
      return { draftTestCases: result.draftTestCases, phase: 'review-draft' };
    },
    { index: 0, name: 'Design test cases' },
    [{ index: 1, name: 'Apply test techniques' }, { index: 2, name: 'Self-review quality' }],
    observer,
    agentOpts?.timeoutMs,
    agentOpts?.useCache,
    agentOpts?.signal,
    (state) => {
      const condCount = state.approvedConditions?.length ?? 0;
      console.log(`[test-gen:graph] [agent_test_designer] ENTER, ${condCount} conditions to design, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { draftTestCases: NlTestCase[] };
      const draftCount = result.draftTestCases?.length ?? 0;
      console.log(`[test-gen:graph] [agent_test_designer] EXIT, ${draftCount} draft test cases, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint2 = createCheckpointNode<Checkpoint2Response>(
    (state) => ({ cases: state.draftTestCases }),
    (state, response) => ({
      approvedDraftCases: response?.cases ?? state.draftTestCases ?? [],
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'quality',
    }),
    (state, response) => ({
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'design',
    }),
    (state) => {
      const draftCount = state.draftTestCases?.length ?? 0;
      console.log(`[test-gen:graph] [checkpoint_2] ENTER, ${draftCount} draft cases awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[test-gen:graph] [checkpoint_2] retry requested, returning to design`); },
    (state, response) => {
      const approved = response?.cases?.length ?? state.draftTestCases?.length ?? 0;
      console.log(`[test-gen:graph] [checkpoint_2] EXIT, ${approved} draft cases approved, proceeding to quality`);
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
    agentOpts?.signal,
    (state) => {
      const draftCount = state.approvedDraftCases?.length ?? 0;
      const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
      console.log(`[test-gen:graph] [agent_quality_manager] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);
    },
    (raw) => {
      const result = raw.result as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
      const finalCount = result.finalTestCases?.length ?? 0;
      const matrixRows = result.coverageMatrix?.rows?.length ?? 0;
      console.log(`[test-gen:graph] [agent_quality_manager] EXIT, ${finalCount} final test cases, ${matrixRows} coverage rows, latency=${raw.latencyMs}ms`);
    },
  );

  const node_checkpoint3 = createCheckpointNode<Checkpoint3Response>(
    (state) => ({ cases: state.finalTestCases, matrix: state.coverageMatrix }),
    () => ({ phase: 'complete' }),
    (state, response) => ({
      humanReviewFeedback: response?.feedback ?? '',
      phase: 'quality',
    }),
    (state) => {
      const finalCount = state.finalTestCases?.length ?? 0;
      console.log(`[test-gen:graph] [checkpoint_3] ENTER, ${finalCount} final cases awaiting review, phase=${state.phase}`);
    },
    () => { console.log(`[test-gen:graph] [checkpoint_3] retry requested, returning to quality`); },
    () => { console.log(`[test-gen:graph] [checkpoint_3] EXIT, test generation complete`); },
  );

  const graph = new StateGraph(TestGenStateAnnotation)
    .addNode('agent_test_analyst', node_analyst)
    .addNode('checkpoint_1', node_checkpoint1)
    .addNode('agent_test_designer', node_designer)
    .addNode('checkpoint_2', node_checkpoint2)
    .addNode('agent_quality_manager', node_reviewer)
    .addNode('checkpoint_3', node_checkpoint3);

  console.log(`[test-gen:graph] adding edges...`);
  graph.addEdge(START, 'agent_test_analyst');
  graph.addEdge('agent_test_analyst', 'checkpoint_1');
  graph.addEdge('agent_test_designer', 'checkpoint_2');
  graph.addEdge('agent_quality_manager', 'checkpoint_3');
  graph.addConditionalEdges('checkpoint_1', (state: TestGenState) => {
    const decision1 = state.phase === 'analysis' ? 'agent_test_analyst' : 'agent_test_designer';
    console.log(`[test-gen:graph] [checkpoint_1] routing: phase=${state.phase} -> ${decision1}`);
    if (state.phase === 'analysis') return 'agent_test_analyst';
    return 'agent_test_designer';
  });
  graph.addConditionalEdges('checkpoint_2', (state: TestGenState) => {
    const decision2 = state.phase === 'design' ? 'agent_test_designer' : 'agent_quality_manager';
    console.log(`[test-gen:graph] [checkpoint_2] routing: phase=${state.phase} -> ${decision2}`);
    if (state.phase === 'design') return 'agent_test_designer';
    return 'agent_quality_manager';
  });
  graph.addConditionalEdges('checkpoint_3', (state: TestGenState) => {
    const decision3 = state.phase === 'quality' ? 'agent_quality_manager' : END;
    console.log(`[test-gen:graph] [checkpoint_3] routing: phase=${state.phase} -> ${decision3 === END ? 'END' : decision3}`);
    if (state.phase === 'quality') return 'agent_quality_manager';
    return END;
  });

  console.log(`[test-gen:graph] compiling test generation graph${checkpointer ? ' with checkpointer' : ''}...`);
  const compiled = graph.compile({ checkpointer });
  console.log(`[test-gen:graph] test generation graph compiled`);
  return compiled;
}

export function createToolRegistry(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}, opts?: {
  promptVersion?: string;
  modelName?: string;
}): ToolRegistry {
  const registry = new ToolRegistry();

  const providerFactory = () => provider;
  const getPromptVersion = () => opts?.promptVersion ?? 'unknown';
  const getModelName = () => opts?.modelName ?? 'unknown';

  registry.register(new AgentTool(roles.testAnalyst, providerFactory, getPromptVersion, getModelName));
  registry.register(new AgentTool(roles.testDesigner, providerFactory, getPromptVersion, getModelName));
  registry.register(new AgentTool(roles.qualityManager, providerFactory, getPromptVersion, getModelName));

  return registry;
}

export function createOrchestratedPipeline(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}, callbacks?: AgentObserver, agentOpts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  signal?: AbortSignal;
}, checkpointer?: BaseCheckpointSaver) {
  const registry = createToolRegistry(provider, roles, {
    promptVersion: agentOpts?.promptVersion,
    modelName: agentOpts?.modelName,
  });

  const orchestrator = new ToolOrchestrator(registry, provider);

  return orchestrator.pipeline({
    tools: ['test_analyst', 'test_designer', 'quality_manager'],
    checkpointer,
    enableCheckpoints: true,
    callbacks,
    agentOpts: {
      timeoutMs: agentOpts?.timeoutMs,
      useCache: agentOpts?.useCache,
      signal: agentOpts?.signal,
    },
    stateAnnotation: TestGenStateAnnotation,
    agentStepConfig: {
      'test_analyst': {
        preStep: { index: 0, name: 'Assess risk & priority' },
        postSteps: [{ index: 1, name: 'Extract test conditions' }, { index: 2, name: 'Select ISTQB techniques' }],
      },
      'test_designer': {
        preStep: { index: 0, name: 'Design test cases' },
        postSteps: [{ index: 1, name: 'Apply test techniques' }, { index: 2, name: 'Self-review quality' }],
      },
      'quality_manager': {
        preStep: { index: 0, name: 'Review 6 dimensions' },
        postSteps: [{ index: 1, name: 'Merge human feedback' }, { index: 2, name: 'Generate coverage matrix' }],
      },
    },
    buildCheckpointPayload: {
      1: (state) => ({ conditions: state.testConditions, analysis: state.requirementAnalysis }),
      2: (state) => ({ cases: state.draftTestCases }),
      3: (state) => ({ cases: state.finalTestCases, matrix: state.coverageMatrix }),
    },
    buildCheckpointResolve: {
      1: (state, response) => ({
        approvedConditions: response?.conditions ?? state.testConditions ?? [],
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'design',
      }),
      2: (state, response) => ({
        approvedDraftCases: response?.cases ?? state.draftTestCases ?? [],
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'quality',
      }),
      3: (_state, _response) => ({ phase: 'complete' }),
    },
    buildCheckpointRetry: {
      1: (state, response) => ({
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'analysis',
      }),
      2: (state, response) => ({
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'design',
      }),
      3: (state, response) => ({
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'quality',
      }),
    },
    buildCheckpointRouting: {
      1: (state) => state.phase === 'analysis' ? 'agent_test_analyst' : 'agent_test_designer',
      2: (state) => state.phase === 'design' ? 'agent_test_designer' : 'agent_quality_manager',
      3: (state) => state.phase === 'quality' ? 'agent_quality_manager' : '__end__',
    },
    checkpointLogEnter: {
      1: (state) => {
        const tcCount = state.testConditions?.length ?? 0;
        console.log(`[test-gen:graph] [checkpoint_1] ENTER, ${tcCount} conditions awaiting review, phase=${state.phase}`);
      },
      2: (state) => {
        const draftCount = state.draftTestCases?.length ?? 0;
        console.log(`[test-gen:graph] [checkpoint_2] ENTER, ${draftCount} draft cases awaiting review, phase=${state.phase}`);
      },
      3: (state) => {
        const finalCount = state.finalTestCases?.length ?? 0;
        console.log(`[test-gen:graph] [checkpoint_3] ENTER, ${finalCount} final cases awaiting review, phase=${state.phase}`);
      },
    },
    checkpointLogRetry: {
      1: () => { console.log(`[test-gen:graph] [checkpoint_1] retry requested, returning to analysis`); },
      2: () => { console.log(`[test-gen:graph] [checkpoint_2] retry requested, returning to design`); },
      3: () => { console.log(`[test-gen:graph] [checkpoint_3] retry requested, returning to quality`); },
    },
    checkpointLogExit: {
      1: (state, response) => {
        const approved = response?.conditions?.length ?? state.testConditions?.length ?? 0;
        console.log(`[test-gen:graph] [checkpoint_1] EXIT, ${approved} conditions approved, proceeding to design`);
      },
      2: (state, response) => {
        const approved = response?.cases?.length ?? state.draftTestCases?.length ?? 0;
        console.log(`[test-gen:graph] [checkpoint_2] EXIT, ${approved} draft cases approved, proceeding to quality`);
      },
      3: () => { console.log(`[test-gen:graph] [checkpoint_3] EXIT, test generation complete`); },
    },
    buildToolInput: {
      'test_analyst': (state) => ({
        requirements: state.currentBatch,
        batchContext: state.batchContext,
        projectContext: state.projectContext,
        businessFlowBlueprints: state.businessFlowBlueprints,
        previousConditions: state.testConditions,
        humanFeedback: state.humanReviewFeedback,
      }),
      'test_designer': (state) => ({
        conditions: state.approvedConditions,
        projectContext: state.projectContext,
        businessFlowBlueprints: state.businessFlowBlueprints,
        previousDraftCases: state.draftTestCases,
        humanFeedback: state.humanReviewFeedback,
      }),
      'quality_manager': (state) => ({
        draftCases: state.approvedDraftCases,
        humanFeedback: state.humanReviewFeedback,
        businessFlowBlueprints: state.businessFlowBlueprints,
      }),
    },
    buildToolResult: {
      'test_analyst': (raw) => {
        const result = raw.data as { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] };
        return { requirementAnalysis: result.requirementAnalysis, testConditions: result.testConditions, phase: 'review-conditions' };
      },
      'test_designer': (raw) => {
        const result = raw.data as { draftTestCases: NlTestCase[] };
        return { draftTestCases: result.draftTestCases, phase: 'review-draft' };
      },
      'quality_manager': (raw) => {
        const result = raw.data as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
        return { finalTestCases: result.finalTestCases, coverageMatrix: result.coverageMatrix, phase: 'final-review' };
      },
    },
    agentLogEnter: {
      'test_analyst': (state) => {
        const reqCount = state.currentBatch?.length ?? 0;
        const batchInfo = `batch ${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
        console.log(`[test-gen:graph] [agent_test_analyst] ENTER, ${batchInfo}, ${reqCount} requirements, phase=${state.phase}`);
      },
      'test_designer': (state) => {
        const condCount = state.approvedConditions?.length ?? 0;
        console.log(`[test-gen:graph] [agent_test_designer] ENTER, ${condCount} conditions to design, phase=${state.phase}`);
      },
      'quality_manager': (state) => {
        const draftCount = state.approvedDraftCases?.length ?? 0;
        const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
        console.log(`[test-gen:graph] [agent_quality_manager] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);
      },
    },
    agentLogExit: {
      'test_analyst': (raw) => {
        const result = raw.data as { testConditions: TestCondition[] };
        const tcCount = result.testConditions?.length ?? 0;
        console.log(`[test-gen:graph] [agent_test_analyst] EXIT, ${tcCount} test conditions generated, latency=${raw.metadata?.latencyMs}ms`);
      },
      'test_designer': (raw) => {
        const result = raw.data as { draftTestCases: NlTestCase[] };
        const draftCount = result.draftTestCases?.length ?? 0;
        console.log(`[test-gen:graph] [agent_test_designer] EXIT, ${draftCount} draft test cases, latency=${raw.metadata?.latencyMs}ms`);
      },
      'quality_manager': (raw) => {
        const result = raw.data as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
        const finalCount = result.finalTestCases?.length ?? 0;
        const matrixRows = result.coverageMatrix?.rows?.length ?? 0;
        console.log(`[test-gen:graph] [agent_quality_manager] EXIT, ${finalCount} final test cases, ${matrixRows} coverage rows, latency=${raw.metadata?.latencyMs}ms`);
      },
    },
  });
}

export function createOrchestratorGraph(orchestratorNode: (state: any) => Promise<Partial<any>>) {
  const OStateAnnotation = Annotation.Root({
    input: Annotation<unknown>,
    messages: Annotation<any[]>,
    reactLoopState: Annotation<SerializedReactLoopState | null>,
    result: Annotation<unknown>,
    toolHistory: Annotation<any[]>,
    providerFactory: Annotation<any>,
    promptVersion: Annotation<string>,
    modelName: Annotation<string>,
  });

  const workflow = new StateGraph(OStateAnnotation)
    .addNode('orchestrator', orchestratorNode as any)
    .addNode('checkpoint', async (state: any) => state);

  workflow.addConditionalEdges('orchestrator', (state: any) => {
    if (state.result !== undefined) return END;
    return 'orchestrator';
  });
  workflow.addEdge(START, 'orchestrator');
  workflow.addEdge('checkpoint', END);

  return workflow;
}
