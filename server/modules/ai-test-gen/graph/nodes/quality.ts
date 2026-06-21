import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import type { CoverageMatrix } from '../../../../../shared/contracts/index.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildQualitySystemPrompt, buildQualityUserMessage } from '../prompts';
import { QUALITY_SKILLS } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { createQualityOutputProfile } from '../structured-output/quality.ts';
import { Log } from '../../../../shared/services/logger.ts';

// ============================================================
// Output Schema — only finalTestCases; coverageMatrix is computed in TS
// ============================================================
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
    const log = Log.for(agentName);
    const draftCount = (state.approvedDraftCases ?? state.draftTestCases ?? []).length;
    const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
    log.info(`ENTER ── ${draftCount} draft cases to review${fb}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Review 6 dimensions');

    try {
      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildQualitySystemPrompt(state, override?.custom_prompt ?? undefined);
      const draftCases = state.approvedDraftCases ?? state.draftTestCases ?? [];
      const outputProfile = createQualityOutputProfile(
        draftCases.map((draftCase) => ({
          id: draftCase.id,
          conditionId: draftCase.conditionId,
          requirementId: draftCase.requirementId,
        })),
      );

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildQualityUserMessage(state) },
      ];

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        outputProfile,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Merge human feedback');

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
      log.success(`EXIT ── ${finalCount} final cases (approved=${approvedCount}, changed=${changedCount}, rejected=${rejectedCount})`);
      log.kv('coverage.rows', matrixRows);
      log.kv('coverage.summary', `${coverageSummary.totalRequirements} reqs / ${coverageSummary.totalConditions} conditions / ${coverageSummary.overallCoverage}% overall`);
      log.kv('skill.calls', skillCallCount);
      log.kv('tokens', usage.input + usage.output);
      log.kv('latency', `${latencyMs}ms`);
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
