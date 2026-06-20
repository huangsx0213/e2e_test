import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import type { CoverageMatrix } from '../../../../../shared/contracts/index.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildQualitySystemPrompt, buildQualityUserMessage } from '../prompts';
import { QUALITY_SKILLS } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { z } from 'zod';

// ============================================================
// Output Schema — only finalTestCases; coverageMatrix is computed in TS
// ============================================================
const QualityOutputSchema = z.object({
  finalTestCases: z.preprocess(
    (v) => Array.isArray(v) ? v : typeof v === 'object' && v !== null ? Object.values(v) : [],
    z.array(z.object({
    id: z.string(),
    title: z.string(),
    conditionId: z.string(),
    requirementId: z.string(),
    priority: z.string().describe('One of: critical, high, medium, low'),
    category: z.string(),
    techniqueApplied: z.string().describe('Testing technique used (e.g. Equivalence Partitioning, Boundary Value Analysis)'),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(z.object({
      stepNumber: z.preprocess(
        (v) => (typeof v === 'number' ? v : Number(v) || 1),
        z.number(),
      ),
      action: z.preprocess((v) => String(v ?? ''), z.string()),
      expected: z.preprocess((v) => String(v ?? ''), z.string()),
    })),
    tags: z.array(z.string()),
    status: z.string().describe('One of: approved, approved_with_changes, rejected').default('approved'),
    reviewSummary: z.string().describe('Brief review note'),
    changeLog: z.array(z.object({
      field: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
      reason: z.string(),
    })).default([]),
  })).min(1)),
});

/**
 * 从 finalTestCases + state 数据计算 coverageMatrix，不依赖模型输出。
 */
function computeCoverageMatrix(
  finalTestCases: Array<{ requirementId: string; techniqueApplied: string; category: string }>,
  requirements: Array<{ id: string; title: string; level: string }>,
  conditions: Array<{ requirementId: string }>,
): CoverageMatrix {
  const casesByReq: Record<string, typeof finalTestCases> = {};
  for (const tc of finalTestCases) {
    if (!casesByReq[tc.requirementId]) casesByReq[tc.requirementId] = [];
    casesByReq[tc.requirementId].push(tc);
  }

  const condCountByReq: Record<string, number> = {};
  for (const c of conditions) {
    condCountByReq[c.requirementId] = (condCountByReq[c.requirementId] ?? 0) + 1;
  }

  const rows: CoverageMatrix['rows'] = [];
  for (const req of requirements) {
    const relatedCases = casesByReq[req.id] ?? [];
    const totalConditions = condCountByReq[req.id] ?? 0;
    const testCaseCount = relatedCases.length;

    const techniqueBreakdown: Record<string, number> = {};
    for (const tc of relatedCases) {
      techniqueBreakdown[tc.techniqueApplied || 'unknown'] = (techniqueBreakdown[tc.techniqueApplied || 'unknown'] ?? 0) + 1;
    }

    const categoryBreakdown: Record<string, number> = {};
    for (const tc of relatedCases) {
      categoryBreakdown[tc.category || 'uncategorized'] = (categoryBreakdown[tc.category || 'uncategorized'] ?? 0) + 1;
    }

    rows.push({
      requirementId: req.id,
      requirementTitle: req.title,
      level: req.level,
      totalConditions,
      testCaseCount,
      techniqueBreakdown,
      categoryBreakdown,
      coveragePercentage: totalConditions > 0 ? Math.min(100, Math.round((testCaseCount / totalConditions) * 100)) : 0,
      uncoveredRisks: [],
    });
  }

  return { rows };
}

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
  const { provider, skills = QUALITY_SKILLS, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'quality_manager';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const draftCount = (state.approvedDraftCases ?? state.draftTestCases ?? []).length;
    const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${draftCount} draft cases to review${fb}, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Review 6 dimensions');

    try {
      // Load custom prompt override if available
      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildQualitySystemPrompt(state, override?.custom_prompt ?? undefined);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
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

      // coverageMatrix 由 TypeScript 编译时计算，不依赖模型输出
      const computedCoverageMatrix = computeCoverageMatrix(
        validated.finalTestCases as Array<{ requirementId: string; techniqueApplied: string; category: string }>,
        (state.currentBatch ?? []).map(r => ({ id: r.id, title: r.title, level: (r as any).level ?? '' })),
        (state.approvedConditions ?? state.testConditions ?? []) as Array<{ requirementId: string }>,
      );
      observer?.onStep?.(agentName, 2, 'Generate coverage matrix');

      const latencyMs = Date.now() - startTime;
      const finalCount = validated.finalTestCases?.length ?? 0;
      const matrixRows = computedCoverageMatrix.rows.length;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const approvedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved').length ?? 0;
      const changedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved_with_changes').length ?? 0;
      const rejectedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'rejected').length ?? 0;
      const coverageSummary = {
        totalRequirements: state.currentBatch?.length ?? 0,
        totalConditions: (state.approvedConditions ?? state.testConditions ?? []).length,
        totalCases: finalCount,
        overallCoverage: computedCoverageMatrix.rows.length > 0
          ? Math.round(computedCoverageMatrix.rows.reduce((sum, r) => sum + r.coveragePercentage, 0) / computedCoverageMatrix.rows.length)
          : 0,
      };
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${finalCount} final cases (approved=${approvedCount}, changed=${changedCount}, rejected=${rejectedCount}), ${matrixRows} coverage rows, ${skillCallCount} skill calls, tokens=${usage.input + usage.output}, latency=${latencyMs}ms`);
      console.log(`[test-gen:graph] [${agentName}] Coverage: ${coverageSummary.totalRequirements} reqs, ${coverageSummary.totalConditions} conditions, ${coverageSummary.totalCases} cases, ${coverageSummary.overallCoverage}% overall`);
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      return {
        finalTestCases: validated.finalTestCases as any,
        coverageMatrix: computedCoverageMatrix as any,
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