import type { TestGenState } from '../state';
import type { AgentObserver } from './types';
import { pipelineRepo } from '../../repository.ts';
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
 * Fetch the persistent coverage snapshot for the project so the
 * downstream Analyst knows which conditions are already covered.
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
// Preparation node — pure deterministic TS layer
// ============================================================
export interface PreparationNodeOptions {
  observer?: AgentObserver;
}

export function makePreparationNode(opts: PreparationNodeOptions) {
  const { observer } = opts;
  const agentName = 'test_architect';
  const log = Log.for(agentName);

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? 1}/${state.batchContext?.totalBatches ?? 1}`;
    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    const analystMode = state.analystMode || 'STAGE_1_REQUIREMENT';

    const stageLabels: Record<string, string> = {
      STAGE_1_REQUIREMENT: 'req-analysis',
      STAGE_2_FLOW: 'flow-analysis',
      STAGE_3_ERROR_GUESSING: 'error-guessing',
    };
    const stageDetails: Record<string, string> = {
      STAGE_1_REQUIREMENT: `${reqCount} requirements`,
      STAGE_2_FLOW: `${flowCount} flows`,
      STAGE_3_ERROR_GUESSING: `${reqCount} requirements across ${flowCount} flows`,
    };
    log.info(`ENTER ── batch ${batchInfo} [${stageLabels[analystMode] ?? analystMode}], ${stageDetails[analystMode] ?? ''}`);

    // ---- Frequency scan ----
    const batchReqIds = (state.currentBatch ?? []).map(r => r.id);
    const frequencies = computeRequirementFrequencies(
      state.businessFlowBlueprints ?? [],
      batchReqIds,
    );
    const duplicateCount = frequencies.filter(f => f.isDuplicateReference).length;
    log.kv('frequencies.duplicates', duplicateCount);
    if (duplicateCount > 0) {
      observer?.onStep?.(agentName, 0, `Frequency scan: ${duplicateCount} high-frequency nodes flagged`);
    }

    // ---- Coverage snapshot ----
    const coverageSnapshot = fetchCoverageSnapshot(state.projectId);
    log.kv('coverage.existingRows', coverageSnapshot.length);
    observer?.onStep?.(agentName, 1, `Coverage snapshot: ${coverageSnapshot.length} existing rows`);

    log.success(`EXIT ── environment ready`);

    return {
      environmentReady: true,
      initializationLogs: [],
      requirementFrequencies: frequencies,
      coverageSnapshot,
      phase: 'review-blueprint',
    };
  };
}
