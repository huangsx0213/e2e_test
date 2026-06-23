import type { TestGenState } from '../state';
import type { AgentObserver } from './types';
import { Log } from '../../../../shared/services/logger.ts';

export interface PreparationNodeOptions {
  observer?: AgentObserver;
}

export function makePreparationNode(opts: PreparationNodeOptions) {
  const { observer } = opts;
  const agentName = 'preparation';
  const log = Log.for(agentName);

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    observer?.onStart?.(agentName);

    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? 1}/${state.batchContext?.totalBatches ?? 1}`;
    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    const isFlowMode = state.includeFlowCases;

    observer?.onStep?.(agentName, 0, `Preparing: ${reqCount} requirements, ${flowCount} flows (${batchInfo})`);

    log.info(`ENTER ── batch ${batchInfo}, ${reqCount} requirements, ${flowCount} flows`);
    log.kv('mode', state.mode);
    log.kv('flowMode', isFlowMode ? 'yes' : 'no');

    const avgTokensPerReq = 1000;
    const estimated = reqCount * avgTokensPerReq;
    log.kv('tokenBudget.estimated', estimated);

    observer?.onStep?.(agentName, 1, `Token estimation: ~${estimated} tokens`);

    if (flowCount > 0) {
      log.kv('flows', flowCount);
    }

    const latencyMs = Date.now() - startTime;
    observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs);
    log.success(`EXIT ── environment ready (${latencyMs}ms)`);

    return {
      environmentReady: true,
      initializationLogs: [],
      tokenBudget: { estimated, limit: null },
      phase: 'analysis',
    };
  };
}