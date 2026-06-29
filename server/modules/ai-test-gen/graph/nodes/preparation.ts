import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildArchitectSystemPrompt, buildArchitectUserMessage } from '../prompts';
import { ANALYST_SKILLS } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { createArchitectOutputProfile } from '../structured-output/architect.ts';
import type { GlobalTestBlueprint } from '../../../../../shared/contracts/index.ts';
import { Log } from '../../../../shared/services/logger.ts';

// ============================================================
// Deterministic TS layer — frequency scanning & coverage snapshot
// ============================================================

interface FrequencyStats {
  requirementId: string;
  occurrenceCount: number;
  isDuplicateReference: boolean;
}

/**
 * Scan business flow blueprints to count how many times each requirement
 * is referenced across flows. High-frequency nodes (>1 occurrence) are
 * tagged isDuplicateReference so the Analyst can skip redundant logic.
 */
function computeRequirementFrequencies(
  flows: Array<{ steps: Array<{ requirementId: string }> }>,
  batchRequirementIds: string[],
): FrequencyStats[] {
  const counts: Record<string, number> = {};
  for (const flow of flows) {
    for (const step of flow.steps ?? []) {
      const rid = step.requirementId;
      if (!rid) continue;
      counts[rid] = (counts[rid] ?? 0) + 1;
    }
  }
  return batchRequirementIds.map(id => ({
    requirementId: id,
    occurrenceCount: counts[id] ?? 0,
    isDuplicateReference: (counts[id] ?? 0) > 1,
  }));
}

/**
 * Fetch the persistent coverage snapshot for the project so the Architect
 * (and downstream Analyst) knows which conditions are already covered.
 */
function fetchCoverageSnapshot(projectId: string): Array<{
  requirementId: string;
  conditionHash: string;
  technique: string;
  testCaseIds: string[];
}> {
  return pipelineRepo.getProjectCoverage(projectId).map((row: any) => ({
    requirementId: row.requirement_id,
    conditionHash: row.condition_hash,
    technique: row.technique,
    testCaseIds: row.test_case_ids ?? [],
  }));
}

// ============================================================
// Test Architect Agent node
// ============================================================
export interface PreparationNodeOptions {
  provider?: AIProvider;
  skills?: SkillDefinition[];
  observer?: AgentObserver;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makePreparationNode(opts: PreparationNodeOptions) {
  const { provider, skills = ANALYST_SKILLS, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'test_architect';
  const log = Log.for(agentName);

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();

    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? 1}/${state.batchContext?.totalBatches ?? 1}`;
    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    const isFlowMode = state.analystMode === 'STAGE_2_FLOW';
    const batchIndex = (state.batchContext?.currentBatch ?? 1) - 1;
    const analystMode = state.analystMode || 'STAGE_1_REQUIREMENT';

    const stageLabel = analystMode === 'STAGE_1_REQUIREMENT' ? 'req-analysis'
      : analystMode === 'STAGE_2_FLOW' ? 'flow-analysis'
      : 'error-guessing';
    const detail = analystMode === 'STAGE_1_REQUIREMENT'
      ? `${reqCount} requirements`
      : analystMode === 'STAGE_2_FLOW'
        ? `${flowCount} flows`
        : `${reqCount} requirements across ${flowCount} flows`;
    log.info(`ENTER ── batch ${batchInfo} [${stageLabel}], ${detail}`);
    log.kv('mode', state.mode);
    log.kv('flowMode', isFlowMode ? 'yes' : 'no');
    log.kv('batchIndex', batchIndex);

    // ---- 1. Deterministic TS layer: token estimation, frequency, coverage snapshot ----
    const avgTokensPerReq = 1000;
    const estimated = reqCount * avgTokensPerReq;
    log.kv('tokenBudget.estimated', estimated);
    observer?.onStep?.(agentName, 0, `Token estimation: ~${estimated} tokens`);

    const batchReqIds = (state.currentBatch ?? []).map(r => r.id);
    const frequencies = computeRequirementFrequencies(
      state.businessFlowBlueprints ?? [],
      batchReqIds,
    );
    const duplicateCount = frequencies.filter(f => f.isDuplicateReference).length;
    log.kv('frequencies.duplicates', duplicateCount);
    if (duplicateCount > 0) {
      observer?.onStep?.(agentName, 1, `Frequency scan: ${duplicateCount} high-frequency nodes flagged`);
    }

    const coverageSnapshot = fetchCoverageSnapshot(state.projectId);
    log.kv('coverage.existingRows', coverageSnapshot.length);
    observer?.onStep?.(agentName, 2, `Coverage snapshot: ${coverageSnapshot.length} existing rows`);

    // ---- 2. Blueprint decision ----
    // Blueprint is pre-populated by the orchestrator (runs once before batch loop).
    // If missing (e.g., forceRedesign from checkpoint_0 retry), fallback to inline LLM.
    let globalBlueprint: GlobalTestBlueprint | undefined = state.globalBlueprint;

    if (globalBlueprint && !state.forceRedesign) {
      log.info(`Blueprint pre-populated ── reusing (forceRedesign=${state.forceRedesign})`);
    } else if (provider) {
      log.info(`Blueprint fallback ── generating via LLM (batchIndex=${batchIndex})`);

      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildArchitectSystemPrompt(state, override?.custom_prompt ?? undefined);
      const outputProfile = createArchitectOutputProfile();

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildArchitectUserMessage(state) },
      ];

      const nodeSignal = signal
        ? mergeSignals(signal, AbortSignal.timeout(timeoutMs))
        : AbortSignal.timeout(timeoutMs);

      const { output: architectResult, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        outputProfile,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      globalBlueprint = architectResult as GlobalTestBlueprint;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const riskCount = globalBlueprint.riskEpicTree?.length ?? 0;
      const anomalyCount = globalBlueprint.anomalousFlowProposals?.length ?? 0;
      log.success(`Blueprint generated ── ${riskCount} risk epics, ${anomalyCount} anomalous flows`);
      log.kv('skill.calls', skillCallCount);
      const latencyMs = Date.now() - startTime;
      log.kv('latency', `${latencyMs}ms`);
    } else if (!globalBlueprint) {
      log.warn('No provider and no pre-populated blueprint ── emitting stub');
      globalBlueprint = {
        contextBoundary: {
          selectedEpicIds: [],
          selectedFlowIds: [],
          allEpicIds: [],
          allFlowIds: [],
          dependencyWarning: [],
        },
        strategicGuidance: 'Stub blueprint: no LLM provider configured. Configure a provider to enable Architect blueprinting.',
        riskEpicTree: [],
        anomalousFlowProposals: [],
        sharedStateInferences: [],
      };
    }

    log.success(`EXIT ── environment ready, blueprint ${globalBlueprint ? 'present' : 'absent'}`);

    return {
      environmentReady: true,
      initializationLogs: [],
      tokenBudget: { estimated, limit: null },
      globalBlueprint,
      coverageSnapshot,
      analystMode: state.analystMode || 'STAGE_1_REQUIREMENT',
      forceRedesign: false,
      phase: 'review-blueprint',
    };
  };
}
