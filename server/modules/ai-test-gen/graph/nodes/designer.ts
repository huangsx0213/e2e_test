import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../../../../shared/ai/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { z } from 'zod';

// ============================================================
// Output Schema
// ============================================================
const TestStepSchema = z.object({
  stepNumber: z.number(),
  action: z.string().describe('What the tester does'),
  expected: z.string().describe('Expected system behavior'),
});

const DesignerOutputSchema = z.object({
  draftTestCases: z.array(z.object({
    id: z.string(),
    title: z.string().describe('Concise test case title'),
    conditionId: z.string().describe('Reference to the test condition this covers'),
    requirementId: z.string(),
    priority: z.string().describe('One of: critical, high, medium, low'),
    category: z.string().describe('One of: functional, ui, api, boundary, edge, error, validation'),
    techniqueApplied: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(TestStepSchema).min(1),
    postconditions: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    selfReview: z.object({
      score: z.number().min(1).max(10).describe('Self-assessed quality score 1-10'),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      suggestions: z.array(z.string()),
    }),
  })).min(1),
});

// ============================================================
// Prompt
// ============================================================
function buildSystemPrompt(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  const criticalCount = conditions.filter(c => c.priority === 'critical').length;
  const highCount = conditions.filter(c => c.priority === 'high').length;

  return `You are a senior ISTQB Test Designer. Design detailed, executable test cases from the provided test conditions.

## Context
- Test Conditions: ${conditions.length} total (${criticalCount} critical, ${highCount} high)
- Project: ${state.projectContext.name}
${state.businessFlowBlueprints?.length ? `- Business Flows: ${state.businessFlowBlueprints.length} available` : ''}

## Instructions
1. For EACH test condition, design at least one test case
2. Each test case must include:
   - Clear, actionable steps (action + expected result)
   - Explicit preconditions
   - Required test data
   - Self-review with quality score (1-10)
3. Apply the ISTQB technique specified in the condition
4. Ensure coverage across:
   - Happy path (primary scenario)
   - Alternative paths
   - Error/exception scenarios
5. Tag each test case with relevant categories

${state.humanReviewFeedback ? `## Previous Feedback\n${state.humanReviewFeedback}` : ''}

You may use available tools to query additional context (e.g., database schemas, API specs) before producing your final output.
When you are done, call the extract_structured_output function with your complete test case designs.`;
}

function buildUserMessage(state: TestGenState): string {
  const conditions = state.approvedConditions ?? state.testConditions ?? [];
  return JSON.stringify({
    conditions: conditions.map(c => ({
      id: c.id,
      condition: c.condition,
      priority: c.priority,
      category: c.category,
      primaryTechnique: c.primaryTechnique,
      secondaryTechniques: c.secondaryTechniques,
      riskLevel: c.riskLevel,
      dataRequirements: (c as any).dataRequirements,
      dependencies: (c as any).dependencies ?? [],
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
export interface DesignerNodeOptions {
  provider: AIProvider;
  observer?: AgentObserver;
  skills?: SkillDefinition[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeDesignerNode(opts: DesignerNodeOptions) {
  const { provider, observer, skills = [], timeoutMs = 300_000, signal } = opts;
  const agentName = 'test_designer';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const condCount = (state.approvedConditions ?? state.testConditions ?? []).length;
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${condCount} conditions to design, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Design test cases');

    try {
      const systemPrompt = buildSystemPrompt(state);
      const userMessage = buildUserMessage(state);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage },
      ];

      const validated = await callLLMWithStructuredOutput(
        provider, messages, skills, DesignerOutputSchema,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Apply test techniques');
      const avgScore = validated.draftTestCases.reduce((sum, tc) => sum + tc.selfReview.score, 0) / validated.draftTestCases.length;
      observer?.onStep?.(agentName, 2, `Self-review (avg: ${avgScore.toFixed(1)}/10)`);

      const latencyMs = Date.now() - startTime;
      const draftCount = validated.draftTestCases?.length ?? 0;
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${draftCount} draft test cases, latency=${latencyMs}ms`);
      observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs, messages, validated);

      return {
        draftTestCases: validated.draftTestCases as any,
        phase: 'review-draft' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}
