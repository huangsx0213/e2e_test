import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import type { CoverageMatrix } from '../../../../../shared/contracts/index.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildQualitySystemPrompt, buildQualityUserMessage } from '../prompts';
import { buildQualitySkills } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { createQualityOutputProfile, reconcileCoverageMatrix } from '../structured-output/quality.ts';
import { Log } from '../../../../shared/services/logger.ts';

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
  const { provider, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'quality_manager';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const log = Log.for(agentName);
    const draftCount = (state.approvedDraftCases ?? state.draftTestCases ?? []).length;
    const fb = state.humanReviewFeedback ? `, feedback="${state.humanReviewFeedback.slice(0, 80)}"` : '';
    log.info(`ENTER ── ${draftCount} draft cases to review${fb}`);

    // Build skills dynamically: pass runId for previous_batch_cases_query (D2 cross-batch check)
    // and currentBatch for requirement_detail_query fallback
    const skills = opts.skills ?? buildQualitySkills(state.runId, state.currentBatch);
    log.kv('skills.available', skills.length);

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
          expectedTestLevel: draftCase.testLevel,
          // F10 / F11: forward the traceability arrays so Quality can run the
          // anti-redundancy check against the same set the Designer declared.
          coveredConditions: (draftCase as any).coveredConditions,
          referencedComponentConditions: (draftCase as any).referencedComponentConditions,
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

      const computedCoverageMatrix = reconcileCoverageMatrix(
        (validated as any).coverageMatrix,
        validated.finalTestCases,
        (state.approvedConditions ?? state.testConditions ?? []) as any,
      );

      const latencyMs = Date.now() - startTime;
      const finalCount = validated.finalTestCases?.length ?? 0;
      const matrixRows = computedCoverageMatrix?.rows?.length ?? 0;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const approvedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved').length ?? 0;
      const changedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'approved_with_changes').length ?? 0;
      const rejectedCount = validated.finalTestCases?.filter((tc: any) => tc.status === 'rejected').length ?? 0;
      observer?.onStep?.(agentName, 4, `Reviewed ${finalCount} cases (${approvedCount} approved, ${changedCount} changed, ${rejectedCount} rejected)`);
      const coverageSummary = {
        totalRequirements: state.currentBatch?.length ?? 0,
        totalConditions: (state.approvedConditions ?? state.testConditions ?? []).length,
        totalCases: finalCount,
        overallCoverage: computedCoverageMatrix?.summary
          ? Math.round(
              (computedCoverageMatrix.summary.coveredConditions /
                Math.max(1, computedCoverageMatrix.summary.totalConditions)) *
                100,
            )
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
