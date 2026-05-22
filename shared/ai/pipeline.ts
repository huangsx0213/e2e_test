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
}) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager);

  const graph = new StateGraph(PipelineStateAnnotation)
    .addNode('agent_test_analyst', async (state) => {
      const result = await runAgent(testAnalystCtx, {
        requirements: state.currentBatch,
        batchContext: state.batchContext,
        projectContext: state.projectContext,
      }) as { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] };
      return {
        requirementAnalysis: result.requirementAnalysis,
        testConditions: result.testConditions,
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
      const result = await runAgent(testDesignerCtx, {
        conditions: state.approvedConditions,
        projectContext: state.projectContext,
      }) as { draftTestCases: NlTestCase[] };
      return { draftTestCases: result.draftTestCases, phase: 'review-draft' };
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
      const result = await runAgent(qualityManagerCtx, {
        draftCases: state.approvedDraftCases,
        humanFeedback: state.humanReviewFeedback,
      }) as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
      return {
        finalTestCases: result.finalTestCases,
        coverageMatrix: result.coverageMatrix,
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