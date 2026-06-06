import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../../../../shared/ai/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { z } from 'zod';

// ============================================================
// Output Schema
// ============================================================
const AnalystOutputSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string().describe('Overall test strategy for this batch'),
    riskAssessmentSummary: z.string().describe('Summary of key risks identified'),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    condition: z.string().describe('ISTQB-style test condition description'),
    category: z.string().describe('One of: functional, ui, api, boundary, edge, error, validation, performance'),
    priority: z.string().describe('One of: critical, high, medium, low'),
    riskLevel: z.string().describe('One of: high, medium, low'),
    primaryTechnique: z.string().describe('Primary ISTQB test technique'),
    secondaryTechniques: z.array(z.string()),
    techniqueRationale: z.string(),
    coverageDimensions: z.array(z.string()),
    dataRequirements: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).default([]),
    requirementLevel: z.string().optional(),
  })),
});

// ============================================================
// Prompt
// ============================================================
function buildSystemPrompt(state: TestGenState): string {
  const batch = state.batchContext;
  return `You are a senior ISTQB Test Analyst. Your task is to analyze requirements and derive test conditions.

## Context
- Batch: ${batch.currentBatch}/${batch.totalBatches}
- Requirements: ${state.currentBatch.length} items
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}

## Instructions
1. Review each requirement and assess its risk level
2. For each requirement, derive test conditions using ISTQB techniques:
   - Equivalence Partitioning
   - Boundary Value Analysis
   - Decision Table Testing
   - State Transition Testing
   - Use Case Testing
3. Assign priority based on business impact and risk
4. Document the rationale for each technique choice
5. Consider all coverage dimensions: functional, boundary, error, validation, integration

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

You may use available tools to query additional context before producing your final output.
When you are done, call the extract_structured_output function with your complete analysis.`;
}

function buildUserMessage(state: TestGenState): string {
  return JSON.stringify({
    requirements: state.currentBatch.map(r => ({
      id: r.id,
      title: r.title,
      description: (r as any).description ?? '',
      level: (r as any).level ?? '',
      parentId: (r as any).parentId ?? '',
    })),
    businessFlows: state.businessFlowBlueprints?.map(f => ({
      name: f.name,
      steps: f.steps,
    })),
  }, null, 2);
}

// ============================================================
// Node
// ============================================================
export interface AnalystNodeOptions {
  provider: AIProvider;
  observer?: AgentObserver;
  skills?: SkillDefinition[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeAnalystNode(opts: AnalystNodeOptions) {
  const { provider, observer, skills = [], timeoutMs = 300_000, signal } = opts;
  const agentName = 'test_analyst';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${batchInfo}, ${reqCount} requirements, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Assess risk & priority');

    try {
      const systemPrompt = buildSystemPrompt(state);
      const userMessage = buildUserMessage(state);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage },
      ];

      const validated = await callLLMWithStructuredOutput(
        provider, messages, skills, AnalystOutputSchema,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Extract test conditions');
      observer?.onStep?.(agentName, 2, 'Select ISTQB techniques');

      const latencyMs = Date.now() - startTime;
      const tcCount = validated.testConditions?.length ?? 0;
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${tcCount} test conditions, latency=${latencyMs}ms`);
      observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs, messages, validated);

      return {
        requirementAnalysis: validated.requirementAnalysis,
        testConditions: validated.testConditions as any,
        phase: 'review-conditions' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}
