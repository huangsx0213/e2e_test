import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildQualitySystemPrompt, buildQualityUserMessage } from '../prompts';
import { QUALITY_SKILLS } from '../skills/skills.ts';
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
// Node
// ============================================================
export interface QualityNodeOptions {
  provider: AIProvider;
  skills?: SkillDefinition[];
  observer?: AgentObserver;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeQualityNode(opts: QualityNodeOptions) {
  const { provider, skills = QUALITY_SKILLS, observer, timeoutMs = 300_000, signal } = opts;
  const agentName = 'quality_manager';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const draftCount = (state.approvedDraftCases ?? state.draftTestCases ?? []).length;
    const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Review 6 dimensions');

    try {
      const messages = [
        { role: 'system' as const, content: buildQualitySystemPrompt(state) },
        { role: 'user' as const, content: buildQualityUserMessage(state) },
      ];
      console.log(`[test-gen:graph] [${agentName}] Calling LLM with ${skills.length} skills available`);

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        QualityOutputSchema,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Merge human feedback');
      observer?.onStep?.(agentName, 2, 'Generate coverage matrix');

      const latencyMs = Date.now() - startTime;
      const finalCount = validated.finalTestCases?.length ?? 0;
      const matrixRows = validated.coverageMatrix?.rows?.length ?? 0;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const approvedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved').length ?? 0;
      const changedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved_with_changes').length ?? 0;
      const rejectedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'rejected').length ?? 0;
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${finalCount} final cases (approved=${approvedCount}, changed=${changedCount}, rejected=${rejectedCount}), ${matrixRows} coverage rows, ${skillCallCount} skill calls, tokens=${usage.input + usage.output}, latency=${latencyMs}ms`);
      if (validated.coverageMatrix?.summary) {
        const s = validated.coverageMatrix.summary;
        console.log(`[test-gen:graph] [${agentName}] Coverage: ${s.totalRequirements} reqs, ${s.totalConditions} conditions, ${s.totalCases} cases, ${s.overallCoverage}% overall`);
      }
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      return {
        finalTestCases: validated.finalTestCases as any,
        coverageMatrix: validated.coverageMatrix as any,
        skillCalls: (toolCallRecords ?? []).map(tc => ({
          agent: agentName,
          skillName: tc.name,
          input: tc.input,
          output: tc.output,
          latencyMs: 0,
          timestamp: Date.now(),
        })),
        phase: 'final-review' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}