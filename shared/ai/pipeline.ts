import { StateGraph, START, END, Annotation, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { TestCondition, NlTestCase, CoverageMatrix, Requirement } from '../contracts/index.ts';
import type { AIProvider } from './provider.ts';
import { createAgentContext, runAgent, type AgentRole } from './agent.ts';
import { db } from '../../server/shared/db/client.ts';

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
}, callbacks?: {
  onStep?: (agentName: string, stepIndex: number, stepName: string) => void;
  onThinking?: (agentName: string, text: string) => void;
}) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager);

  const graph = new StateGraph(PipelineStateAnnotation)
    .addNode('agent_test_analyst', async (state) => {
      callbacks?.onStep?.('test_analyst', 0, 'Assess risk & priority');
      const result = await runAgent(testAnalystCtx, {
        requirements: state.currentBatch,
        batchContext: state.batchContext,
        projectContext: state.projectContext,
      }, {
        onStep: (idx, name) => callbacks?.onStep?.('test_analyst', idx, name),
        onThinking: (text) => callbacks?.onThinking?.('test_analyst', text),
      }) as { result: { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] } };
      callbacks?.onStep?.('test_analyst', 1, 'Extract test conditions');
      callbacks?.onStep?.('test_analyst', 2, 'Select ISTQB techniques');
      return {
        requirementAnalysis: result.result.requirementAnalysis,
        testConditions: result.result.testConditions,
        phase: 'review-conditions',
      };
    })
    .addNode('checkpoint_1', async (state) => {
      const response = interrupt<Checkpoint1Response>({
        conditions: state.testConditions,
        analysis: state.requirementAnalysis,
      });
      if (response?.retry) {
        return { phase: 'analysis' };
      }
      return {
        approvedConditions: response?.conditions ?? state.testConditions,
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'design',
      };
    })
    .addNode('agent_test_designer', async (state) => {
      callbacks?.onStep?.('test_designer', 0, 'Design test cases');
      const result = await runAgent(testDesignerCtx, {
        conditions: state.approvedConditions,
        projectContext: state.projectContext,
      }, {
        onStep: (idx, name) => callbacks?.onStep?.('test_designer', idx, name),
        onThinking: (text) => callbacks?.onThinking?.('test_designer', text),
      }) as { result: { draftTestCases: NlTestCase[] } };
      callbacks?.onStep?.('test_designer', 1, 'Apply test techniques');
      callbacks?.onStep?.('test_designer', 2, 'Self-review quality');
      return { draftTestCases: result.result.draftTestCases, phase: 'review-draft' };
    })
    .addNode('checkpoint_2', async (state) => {
      const response = interrupt<Checkpoint2Response>({
        cases: state.draftTestCases,
      });
      if (response?.retry) {
        return { phase: 'design' };
      }
      return {
        approvedDraftCases: response?.cases ?? state.draftTestCases,
        humanReviewFeedback: response?.feedback ?? '',
        phase: 'quality',
      };
    })
    .addNode('agent_quality_manager', async (state) => {
      callbacks?.onStep?.('quality_manager', 0, 'Review 6 dimensions');
      const result = await runAgent(qualityManagerCtx, {
        draftCases: state.approvedDraftCases,
        humanFeedback: state.humanReviewFeedback,
      }, {
        onStep: (idx, name) => callbacks?.onStep?.('quality_manager', idx, name),
        onThinking: (text) => callbacks?.onThinking?.('quality_manager', text),
      }) as { result: { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix } };
      callbacks?.onStep?.('quality_manager', 1, 'Merge human feedback');
      callbacks?.onStep?.('quality_manager', 2, 'Generate coverage matrix');
      return {
        finalTestCases: result.result.finalTestCases,
        coverageMatrix: result.result.coverageMatrix,
        phase: 'final-review',
      };
    })
    .addNode('checkpoint_3', async (state) => {
      const response = interrupt<Checkpoint3Response>({
        cases: state.finalTestCases,
        matrix: state.coverageMatrix,
      });
      if (response?.retry) {
        return { phase: 'quality' };
      }
      return { phase: 'complete' };
    });

  graph.addEdge(START, 'agent_test_analyst');
  graph.addConditionalEdges('checkpoint_1', (state: PipelineState) => {
    if (state.phase === 'analysis') return 'agent_test_analyst';
    return 'agent_test_designer';
  });
  graph.addConditionalEdges('checkpoint_2', (state: PipelineState) => {
    if (state.phase === 'design') return 'agent_test_designer';
    return 'agent_quality_manager';
  });
  graph.addConditionalEdges('checkpoint_3', (state: PipelineState) => {
    if (state.phase === 'quality') return 'agent_quality_manager';
    return END;
  });

  const checkpointer = new SqliteSaver(db);
  return graph.compile({ checkpointer });
}