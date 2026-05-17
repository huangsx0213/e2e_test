import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { PipelineState, TestCondition, NlTestCase, CoverageMatrix } from '../contracts/index.ts';
import type { AIProvider } from './provider.ts';
import { createAgentContext, runAgent, type AgentRole } from './agent.ts';
import { db } from '../../server/shared/db/client.ts';

export async function createNlPipeline(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager);

  const PipelineStateAnnotation = Annotation.Root({
    projectId: Annotation<string>,
    requirementIds: Annotation<string[]>,
    requirementAnalysis: Annotation<{ overallApproach: string; riskAssessmentSummary: string } | undefined>,
    testConditions: Annotation<TestCondition[] | undefined>,
    approvedConditions: Annotation<TestCondition[] | undefined>,
    draftTestCases: Annotation<NlTestCase[] | undefined>,
    approvedDraftCases: Annotation<NlTestCase[] | undefined>,
    humanReviewFeedback: Annotation<string | undefined>,
    finalTestCases: Annotation<NlTestCase[] | undefined>,
    coverageMatrix: Annotation<CoverageMatrix | undefined>,
    phase: Annotation<PipelineState['phase']>,
    errors: Annotation<{ phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[]>,
  });

  const graph = new StateGraph(PipelineStateAnnotation);

  graph.addNode('agent_test_analyst', async (state: PipelineState) => {
    const result = await runAgentInBatches(state, testAnalystCtx);
    return { testConditions: result.conditions, requirementAnalysis: { overallApproach: result.approach, riskAssessmentSummary: result.riskSummary }, phase: 'review-conditions' as const };
  });
  graph.addNode('review_conditions', (state) => state);
  graph.addNode('agent_test_designer', async (state: PipelineState) => {
    const result = await runAgent(testDesignerCtx, { conditions: state.approvedConditions || state.testConditions, projectContext: { name: '', pages: [], endpoints: [] } });
    const arr = Array.isArray(result) ? result as NlTestCase[] : [];
    return { draftTestCases: arr, phase: 'review-draft' as const };
  });
  graph.addNode('review_drafts', (state) => state);
  graph.addNode('agent_quality_manager', async (state: PipelineState) => {
    const result = await runAgent(qualityManagerCtx, { draftCases: state.approvedDraftCases || state.draftTestCases, humanFeedback: state.humanReviewFeedback || '' });
    const output = result as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
    return { finalTestCases: output.finalTestCases, coverageMatrix: output.coverageMatrix, phase: 'final-review' as const };
  });
  graph.addNode('final_review', (state) => state);

  graph.addEdge(START, 'agent_test_analyst' as any);
  graph.addEdge('agent_test_analyst' as any, 'review_conditions' as any);
  graph.addEdge('review_conditions' as any, 'agent_test_designer' as any);
  graph.addEdge('agent_test_designer' as any, 'review_drafts' as any);
  graph.addEdge('review_drafts' as any, 'agent_quality_manager' as any);
  graph.addEdge('agent_quality_manager' as any, 'final_review' as any);
  graph.addEdge('final_review' as any, END);

  const checkpointer = new SqliteSaver(db);
  return graph.compile({ checkpointer });
}

async function runAgentInBatches(state: PipelineState, ctx: ReturnType<typeof createAgentContext>): Promise<{ conditions: TestCondition[]; approach: string; riskSummary: string }> {
  const result = await runAgent(ctx, { requirements: state.requirementIds.map(id => ({ id, title: '', description: '' })), projectContext: { name: '', type: 'web' as const, existingPages: [], existingEndpoints: [] } });
  const output = result as { requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string }; testConditions: TestCondition[] };
  return { conditions: output.testConditions, approach: output.requirementAnalysis.overallApproach, riskSummary: output.requirementAnalysis.riskAssessmentSummary };
}