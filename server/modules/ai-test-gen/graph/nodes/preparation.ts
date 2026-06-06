import type { TestGenState } from '../state';
import type { AgentObserver } from './types';

export interface PreparationNodeOptions {
  observer?: AgentObserver;
}

export function makePreparationNode(opts: PreparationNodeOptions) {
  const { observer } = opts;
  const agentName = 'preparation';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Initialize environment');

    const logs: string[] = [];
    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? 1}/${state.batchContext?.totalBatches ?? 1}`;

    logs.push(`[preparation] Batch ${batchInfo}: ${reqCount} requirements loaded`);
    logs.push(`[preparation] Project context: ${state.projectContext?.name ?? 'N/A'}`);
    logs.push(`[preparation] Mode: ${state.mode}`);

    const avgTokensPerReq = 1000;
    const estimated = reqCount * avgTokensPerReq;
    logs.push(`[preparation] Token budget estimated: ${estimated} tokens`);

    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    if (flowCount > 0) {
      logs.push(`[preparation] Business flows: ${flowCount} loaded`);
    }

    const latencyMs = Date.now() - startTime;
    observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs);

    return {
      environmentReady: true,
      initializationLogs: logs,
      tokenBudget: { estimated, limit: null },
      phase: 'analysis',
    };
  };
}