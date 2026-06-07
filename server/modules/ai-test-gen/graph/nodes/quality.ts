import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../../../../shared/ai/provider.ts';
import { mergeSignals } from '../../../../../shared/ai/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { z } from 'zod';

// ============================================================
// Output Schema
// ============================================================
const CoverageRowSchema = z.object({
  requirementId: z.string(),
  requirementTitle: z.string(),
  level: z.string(),
  totalConditions: z.number(),
  testCaseCount: z.number(),
  coveragePercentage: z.number(),
  techniqueBreakdown: z.record(z.string(), z.number()),
  categoryBreakdown: z.record(z.string(), z.number()),
  uncoveredRisks: z.array(z.string()),
});

const QualityOutputSchema = z.object({
  finalTestCases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    conditionId: z.string(),
    requirementId: z.string(),
    priority: z.string().describe('One of: critical, high, medium, low'),
    category: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(z.object({
      stepNumber: z.number(),
      action: z.string(),
      expected: z.string(),
    })),
    tags: z.array(z.string()),
    status: z.string().describe('One of: approved, approved_with_changes, rejected').default('approved'),
    reviewSummary: z.string().describe('Brief review note'),
    changeLog: z.array(z.object({
      field: z.string(),
      from: z.any().optional(),
      to: z.any().optional(),
      reason: z.string(),
    })).default([]),
  })),
  coverageMatrix: z.object({
    rows: z.array(CoverageRowSchema),
    summary: z.object({
      totalRequirements: z.number(),
      totalConditions: z.number(),
      totalCases: z.number(),
      overallCoverage: z.number(),
    }),
  }),
});

// ============================================================
// Prompt
// ============================================================
function buildSystemPrompt(state: TestGenState): string {
  const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];

  return `You are a senior QA Quality Manager. Perform a comprehensive 6-dimension review of draft test cases.

## Review Dimensions
1. **Clarity** — Are steps clear and unambiguous?
2. **Completeness** — Are all scenarios covered (happy path, alternate, error)?
3. **Correctness** — Do expected results match requirements?
4. **Traceability** — Is each case linked to a requirement and condition?
5. **Data Validity** — Is test data realistic and boundary-appropriate?
6. **Maintainability** — Are cases well-structured and reusable?

## Coverage Matrix
For each requirement, calculate:
- Number of associated test conditions
- Number of test cases
- Coverage percentage
- Technique distribution
- Uncovered risks: ONLY list risks that are within the scope of the current requirement and have real impact. Do NOT list speculative or out-of-scope edge cases. Leave empty if coverage is adequate.

${state.humanReviewFeedback ? `## Reviewer Feedback\n${state.humanReviewFeedback}` : ''}

You may use available tools to verify coverage or check additional data.

Provide your review analysis step by step as plain text: walk through each dimension, explain changes, and justify coverage ratings. This analysis will be streamed to the user in real-time. Do NOT output JSON in this step — only provide your analysis text.`;
}

function buildUserMessage(state: TestGenState): string {
  const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];
  return JSON.stringify({
    draftCases: draftCases.map(c => ({
      id: c.id,
      title: c.title,
      conditionId: c.conditionId,
      requirementId: c.requirementId,
      priority: c.priority,
      category: c.category,
      preconditions: c.preconditions,
      testData: c.testData,
      steps: c.steps,
      selfReview: (c as any).selfReview,
      tags: c.tags,
    })),
    requirements: state.currentBatch?.map(r => ({
      id: r.id,
      title: r.title,
      level: (r as any).level ?? '',
    })),
  }, null, 2);
}

// ============================================================
// Node
// ============================================================
export interface QualityNodeOptions {
  provider: AIProvider;
  observer?: AgentObserver;
  skills?: SkillDefinition[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeQualityNode(opts: QualityNodeOptions) {
  const { provider, observer, skills = [], timeoutMs = 300_000, signal } = opts;
  const agentName = 'quality_manager';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const draftCount = (state.approvedDraftCases ?? state.draftTestCases ?? []).length;
    const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Review 6 dimensions');

    try {
      const systemPrompt = buildSystemPrompt(state);
      const userMessage = buildUserMessage(state);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage },
      ];

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage } = await callLLMWithStructuredOutput(
        provider, messages, skills, QualityOutputSchema,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Merge human feedback');
      observer?.onStep?.(agentName, 2, 'Generate coverage matrix');

      const latencyMs = Date.now() - startTime;
      const finalCount = validated.finalTestCases?.length ?? 0;
      const matrixRows = validated.coverageMatrix?.rows?.length ?? 0;
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${finalCount} final test cases, ${matrixRows} coverage rows, latency=${latencyMs}ms`);
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      return {
        finalTestCases: validated.finalTestCases as any,
        coverageMatrix: validated.coverageMatrix as any,
        phase: 'final-review' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}
