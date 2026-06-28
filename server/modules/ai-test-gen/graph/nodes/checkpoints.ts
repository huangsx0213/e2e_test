import { Command, interrupt } from '@langchain/langgraph';
import { PHASE_BY_CHECKPOINT } from '../state';
import type { TestGenState, Phase } from '../state';
import type { DirectiveTestStrategy, GlobalTestBlueprint } from '../../../../../shared/contracts/index.ts';
import { Log } from '../../../../shared/services/logger.ts';

interface CheckpointInterruptPayload {
  checkpointNumber: number;
  phase: Phase;
  blueprint?: unknown;
  conditions?: unknown[];
  analysis?: unknown;
  cases?: unknown[];
  matrix?: unknown;
  validationWarnings?: unknown;
  deviations?: unknown;
  coverageGaps?: unknown;
}

const NEXT_AGENT: Record<number, string> = {
  0: 'analyst',
  1: 'designer',
  2: 'quality',
  3: 'complete',
};

const RETURN_AGENT: Record<number, string> = {
  0: 'preparation',
  1: 'analyst',
  2: 'designer',
  3: 'quality',
};

type CheckpointResponse = {
  blueprint?: unknown;
  conditions?: unknown[];
  cases?: unknown[];
  analysis?: unknown;
  matrix?: unknown;
  feedback?: string;
  retry?: boolean;
  forceRedesign?: boolean;
};

export function makeCheckpoint(checkpointNum: number) {
  return (state: TestGenState): Command => {
    const log = Log.for(`checkpoint_${checkpointNum}`);
    const phase = PHASE_BY_CHECKPOINT[checkpointNum] ?? `checkpoint_${checkpointNum}` as Phase;

    if (state.mode === 'auto') {
      log.info('AUTO mode ── auto-pass ✓');
      // Auto 模式：直接通过，数据保持不变
      if (checkpointNum === 0) {
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: { phase: 'analysis' as Phase },
        });
      }
      if (checkpointNum === 1) {
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            approvedConditions: state.testConditions ?? [],
            phase: 'design' as Phase,
          },
        });
      }
      if (checkpointNum === 2) {
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            approvedDraftCases: state.draftTestCases ?? [],
            phase: 'quality' as Phase,
          },
        });
      }
      return new Command({
        goto: NEXT_AGENT[checkpointNum],
        update: { phase: 'complete' as Phase },
      });
    }

    // Interactive 模式：中断等待审核
    const payload: CheckpointInterruptPayload = { checkpointNumber: checkpointNum, phase };

    switch (checkpointNum) {
      case 0: {
        const strategy: DirectiveTestStrategy | GlobalTestBlueprint | undefined = state.directiveTestStrategy ?? state.globalBlueprint ?? undefined;
        const hasBlueprint = !!strategy;
        const epicCount = (strategy as any)?.epicDirectives?.length ?? (strategy as any)?.riskEpicTree?.length ?? 0;
        const flowCount = (strategy as any)?.flowDirectives?.length ?? 0;
        const xrefCount = (strategy as any)?.crossReferenceMap?.length ?? 0;
        const anomalyCount = strategy?.anomalousFlowProposals?.length ?? 0;
        log.info(`ENTER ── blueprint ${hasBlueprint ? 'present' : 'absent'} (${epicCount} epic directives, ${flowCount} flow directives, ${xrefCount} cross-refs, ${anomalyCount} anomalies) awaiting review`);
        payload.blueprint = strategy;
        break;
      }
      case 1: {
        const tcCount = state.testConditions?.length ?? 0;
        log.info(`ENTER ── ${tcCount} conditions awaiting review`);
        payload.conditions = state.testConditions;
        payload.analysis = state.requirementAnalysis;
        break;
      }
      case 2: {
        const draftCount = state.draftTestCases?.length ?? 0;
        log.info(`ENTER ── ${draftCount} draft cases awaiting review`);
        payload.cases = state.draftTestCases;
        break;
      }
      case 3: {
        const finalCount = state.finalTestCases?.length ?? 0;
        const warningCount = state.validationWarnings?.reduce((sum, w) => sum + w.warnings.length, 0) ?? 0;
        const deviationCount = state.deviations?.length ?? 0;
        const gapCount = state.coverageGaps?.length ?? 0;
        log.info(`ENTER ── ${finalCount} final cases awaiting review (${warningCount} warnings, ${deviationCount} deviations, ${gapCount} coverage gaps)`);
        payload.cases = state.finalTestCases;
        payload.matrix = state.coverageMatrix;
        payload.validationWarnings = state.validationWarnings;
        payload.deviations = state.deviations;
        payload.coverageGaps = state.coverageGaps;
        break;
      }
    }

    const response = interrupt<CheckpointResponse>(payload);

    if (response?.retry) {
      log.info(`Retry requested ── returning to ${RETURN_AGENT[checkpointNum]}`);
      const update: Partial<TestGenState> = { humanReviewFeedback: response.feedback ?? '' };
      // CP0 retry with forceRedesign=true triggers LLM re-generation in Architect
      if (checkpointNum === 0 && response.forceRedesign) {
        update.forceRedesign = true;
        log.info('forceRedesign=true ── Architect will re-generate blueprint via LLM');
      }
      return new Command({
        goto: RETURN_AGENT[checkpointNum],
        update: update as any,
      });
    }

    // Approve
    switch (checkpointNum) {
      case 0: {
        const approvedBlueprint = response?.blueprint ?? state.globalBlueprint;
        log.success(`EXIT ── blueprint approved`);
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            globalBlueprint: approvedBlueprint as any,
            humanReviewFeedback: response?.feedback ?? '',
            phase: 'analysis' as Phase,
          },
        });
      }
      case 1: {
        const approved = response?.conditions?.length ?? state.testConditions?.length ?? 0;
        log.success(`EXIT ── ${approved} conditions approved`);
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            approvedConditions: (response?.conditions ?? state.testConditions ?? []) as any,
            humanReviewFeedback: response?.feedback ?? '',
            phase: 'design' as Phase,
          },
        });
      }
      case 2: {
        const approved = response?.cases?.length ?? state.draftTestCases?.length ?? 0;
        log.success(`EXIT ── ${approved} draft cases approved`);
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            approvedDraftCases: (response?.cases ?? state.draftTestCases ?? []) as any,
            humanReviewFeedback: response?.feedback ?? '',
            phase: 'quality' as Phase,
          },
        });
      }
      case 3: {
        log.success('EXIT ── test generation complete');
        return new Command({
          goto: NEXT_AGENT[checkpointNum],
          update: {
            finalTestCases: (response?.cases ?? state.finalTestCases ?? []) as any,
            coverageMatrix: (response?.matrix ?? state.coverageMatrix) as any,
            humanReviewFeedback: response?.feedback ?? '',
          },
        });
      }
      default:
        return new Command({ goto: NEXT_AGENT[checkpointNum] });
    }
  };
}