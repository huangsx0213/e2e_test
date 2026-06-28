import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import type { CoverageMatrix } from '../../../../../shared/contracts/index.ts';
import type { DirectiveTestStrategy, TestCondition, DeviationRecord, CoverageGapRecord } from '../../../../../shared/contracts/index.ts';
import { createHash } from 'node:crypto';
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

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

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

  const condCountByReq = countBy(conditions, c => c.requirementId);

  const rows: CoverageMatrix['rows'] = [];
  for (const req of requirements) {
    const relatedCases = casesByReq[req.id] ?? [];
    const totalConditions = Number(condCountByReq[req.id] ?? 0);

    rows.push({
      requirementId: req.id,
      requirementTitle: req.title,
      level: req.level,
      totalConditions,
      testCaseCount: relatedCases.length,
      techniqueBreakdown: countBy(relatedCases, tc => tc.techniqueApplied || 'unknown'),
      categoryBreakdown: countBy(relatedCases, tc => tc.category || 'uncategorized'),
      coveragePercentage: totalConditions > 0 ? Math.min(100, Math.round((relatedCases.length / totalConditions) * 100)) : 0,
      uncoveredRisks: [],
    });
  }

  return { rows };
}

/**
 * Compute a stable SHA-256 hash for a test condition so the same condition
 * across runs maps to the same row in test_gen_persistent_coverage.
 */
function hashCondition(conditionText: string): string {
  return createHash('sha256').update(conditionText).digest('hex').slice(0, 16);
}

/**
 * Upsert the batch's approved conditions into the persistent coverage matrix.
 * Called once per batch when the Quality Manager finalizes cases.
 */
function persistCoverageForBatch(
  state: TestGenState,
  finalTestCases: Array<{ id: string; conditionId: string; requirementId: string; techniqueApplied: string }>,
): number {
  const conditions = (state.approvedConditions ?? state.testConditions ?? []) as Array<{
    id: string;
    requirementId: string;
    condition: string;
    primaryTechnique: string;
  }>;
  if (conditions.length === 0) return 0;

  const rowType: 'requirement' | 'flow' = state.analystMode === 'STAGE_2_FLOW' ? 'flow' : 'requirement';

  // Map conditionId → list of final test case ids that cover it
  const casesByCondition: Record<string, string[]> = {};
  for (const tc of finalTestCases) {
    if (!casesByCondition[tc.conditionId]) casesByCondition[tc.conditionId] = [];
    casesByCondition[tc.conditionId].push(tc.id);
  }

  const entries = conditions.map((c) => ({
    requirementId: c.requirementId,
    conditionHash: hashCondition(c.condition ?? c.id),
    conditionText: c.condition ?? c.id,
    technique: c.primaryTechnique ?? 'unknown',
    testCaseIds: casesByCondition[c.id] ?? [],
    rowType,
  }));

  pipelineRepo.upsertCoverageEntries(state.runId, state.projectId, entries);
  return entries.length;
}

// ============================================================
// Deviation & Coverage Gap computation (TS programmatic, no LLM)
// ============================================================

function computeDeviations(
  conditions: TestCondition[],
  directiveStrategy: DirectiveTestStrategy | undefined,
  finalTestCases: Array<{ preconditions: string[] }>,
  analystMode?: string,
): DeviationRecord[] {
  const deviations: DeviationRecord[] = [];
  if (!directiveStrategy) return deviations;

  // 1. technique_mismatch
  const epicTechMap = new Map(directiveStrategy.epicDirectives.map(ed => [ed.epicId, ed.recommendedTechniques]));
  for (const cond of conditions) {
    const epics = directiveStrategy.epicDirectives.filter(ed => cond.requirementId.startsWith(ed.epicId) || ed.epicId === cond.requirementId);
    for (const epic of epics) {
      const shortTech = cond.primaryTechnique === 'equivalence-partitioning' ? 'EP'
        : cond.primaryTechnique === 'boundary-value-analysis' ? 'BVA'
        : cond.primaryTechnique === 'decision-table' ? 'Decision Table'
        : cond.primaryTechnique === 'state-transition' ? 'State Transition'
        : cond.primaryTechnique === 'use-case' ? 'Use Case'
        : cond.primaryTechnique;
      if (!epic.recommendedTechniques.includes(shortTech as any)) {
        const mentionsArchitect = cond.techniqueRationale?.toLowerCase().includes('architect') ?? false;
        deviations.push({
          type: 'technique_mismatch',
          architectDirective: `Architect recommended: ${epic.recommendedTechniques.join(', ')}`,
          actualBehavior: `Analyst chose: ${shortTech}`,
          rationale: cond.techniqueRationale ?? '',
          severity: mentionsArchitect ? 'info' : 'warning',
          conditionId: cond.id,
        });
      }
    }
  }

  // 2. missing_preset
  for (const preset of directiveStrategy.sharedStatePresets ?? []) {
    const found = finalTestCases.some(tc =>
      (tc.preconditions ?? []).some(p => p.toLowerCase().includes(preset.toLowerCase()))
    );
    if (!found) {
      deviations.push({
        type: 'missing_preset',
        architectDirective: `Architect required shared state: ${preset}`,
        actualBehavior: 'Not found in any test case preconditions',
        rationale: '',
        severity: 'warning',
      });
    }
  }

  // 3. category_mismatch (soft — no longer blocks parse)
  const expectedCategory = analystMode === 'STAGE_2_FLOW' ? 'integration'
    : analystMode === 'STAGE_3_ERROR_GUESSING' ? 'error'
    : undefined;
  if (expectedCategory) {
    for (const cond of conditions) {
      if (cond.category !== expectedCategory) {
        deviations.push({
          type: 'category_mismatch',
          architectDirective: `Stage requires category "${expectedCategory}"`,
          actualBehavior: `Analyst chose category "${cond.category}"`,
          rationale: cond.techniqueRationale ?? '',
          severity: 'info',
          conditionId: cond.id,
        });
      }
    }
  }

  return deviations;
}

function computeCoverageGaps(
  directiveStrategy: DirectiveTestStrategy | undefined,
  conditions: TestCondition[],
): CoverageGapRecord[] {
  const gaps: CoverageGapRecord[] = [];
  if (!directiveStrategy) return gaps;

  for (const fd of directiveStrategy.flowDirectives ?? []) {
    for (const focus of fd.integrationFocus ?? []) {
      const matchingConditions = conditions.filter(c =>
        c.condition.toLowerCase().includes(focus.toLowerCase())
      );
      if (matchingConditions.length === 0) {
        gaps.push({
          flowId: fd.flowId,
          flowName: fd.flowName,
          missedFocus: focus,
          relatedConditionIds: [],
        });
      }
    }
  }

  return gaps;
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

      const computedCoverageMatrix = computeCoverageMatrix(
        validated.finalTestCases as Array<{ requirementId: string; techniqueApplied: string; category: string }>,
        (state.currentBatch ?? []).map(r => ({ id: r.id, title: r.title, level: (r as any).level ?? '' })),
        (state.approvedConditions ?? state.testConditions ?? []) as Array<{ requirementId: string }>,
      );

      // Persist this batch's coverage into the durable coverage matrix
      const persistedCount = persistCoverageForBatch(
        state,
        validated.finalTestCases as Array<{ id: string; conditionId: string; requirementId: string; techniqueApplied: string }>,
      );
      if (persistedCount > 0) {
        log.kv('coverage.persisted', persistedCount);
      }

      // Refresh the in-memory coverage snapshot so downstream nodes see the latest state
      const refreshedCoverageSnapshot = pipelineRepo.getProjectCoverage(state.projectId).map((row: any) => ({
        requirementId: row.requirement_id,
        conditionHash: row.condition_hash,
        technique: row.technique,
        testCaseIds: row.test_case_ids ?? [],
      }));

      const latencyMs = Date.now() - startTime;
      const finalCount = validated.finalTestCases?.length ?? 0;
      const matrixRows = computedCoverageMatrix.rows.length;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const approvedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved').length ?? 0;
      const changedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved_with_changes').length ?? 0;
      const rejectedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'rejected').length ?? 0;
      const warningCount = (validated.validationWarnings ?? []).reduce((sum: number, w: any) => sum + (w.warnings?.length ?? 0), 0);
      observer?.onStep?.(agentName, 4, `Reviewed ${finalCount} cases (${approvedCount} approved, ${changedCount} changed, ${rejectedCount} rejected, ${warningCount} warnings)`);
      const matrixTable = computedCoverageMatrix.rows.length > 0
        ? (() => {
            const W = [4, 48, 6, 8, 8, 6];
            const fmt = (cells: string[]) => ' ' + cells.map((c, i) => c.padStart(W[i])).join(' ') + ' ';
            const hdr = fmt(['#', 'Requirement', 'Level', 'Cond', 'Cases', 'Cov%']);
            const div = '─' + W.map(w => '─'.repeat(w)).join('─') + '─';
            const rows = computedCoverageMatrix.rows.map((r, i) => {
              const t = r.requirementTitle.length > 46 ? r.requirementTitle.slice(0, 44) + '…' : r.requirementTitle;
              return fmt([String(i + 1), t, (r.level || '').toUpperCase(), String(r.totalConditions), String(r.testCaseCount), r.coveragePercentage + '%']);
            });
            return '\n\n' + hdr + '\n' + div + '\n' + rows.join('\n');
          })()
        : '';
      observer?.onStep?.(agentName, 5, `Generated coverage matrix (${matrixRows} rows)${matrixTable}`);
      const coverageSummary = {
        totalRequirements: state.currentBatch?.length ?? 0,
        totalConditions: (state.approvedConditions ?? state.testConditions ?? []).length,
        totalCases: finalCount,
        overallCoverage: computedCoverageMatrix.rows.length > 0
          ? Math.round(computedCoverageMatrix.rows.reduce((sum, r) => sum + r.coveragePercentage, 0) / computedCoverageMatrix.rows.length)
          : 0,
      };
      log.success(`EXIT ── ${finalCount} final cases (approved=${approvedCount}, changed=${changedCount}, rejected=${rejectedCount}, warnings=${warningCount})`);
      log.kv('coverage.rows', matrixRows);
      log.kv('coverage.summary', `${coverageSummary.totalRequirements} reqs / ${coverageSummary.totalConditions} conditions / ${coverageSummary.overallCoverage}% overall`);
      log.kv('skill.calls', skillCallCount);
      log.kv('tokens', usage.input + usage.output);
      log.kv('latency', `${latencyMs}ms`);
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      // TS programmatic deviation & coverage gap computation
      const deviations = computeDeviations(
        (state.approvedConditions ?? state.testConditions ?? []) as TestCondition[],
        state.directiveTestStrategy,
        validated.finalTestCases as Array<{ preconditions: string[] }>,
        state.analystMode,
      );
      const coverageGaps = computeCoverageGaps(
        state.directiveTestStrategy,
        (state.approvedConditions ?? state.testConditions ?? []) as TestCondition[],
      );
      if (deviations.length > 0) log.kv('deviations', deviations.length);
      if (coverageGaps.length > 0) log.kv('coverageGaps', coverageGaps.length);

      return {
        finalTestCases: validated.finalTestCases as any,
        coverageMatrix: computedCoverageMatrix as any,
        coverageSnapshot: refreshedCoverageSnapshot,
        validationWarnings: (validated.validationWarnings ?? []) as any,
        deviations,
        coverageGaps,
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
