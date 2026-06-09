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
    const flowCount = state.businessFlowBlueprints?.length ?? 0;
    const isFlowMode = state.includeFlowCases;

    logs.push(`[preparation] Batch ${batchInfo}: ${reqCount} requirements loaded`);
    logs.push(`[preparation] Project context: ${state.projectContext?.name ?? 'N/A'}`);
    logs.push(`[preparation] Mode: ${state.mode}`);
    logs.push(`[preparation] Flow mode: ${isFlowMode ? 'YES (flow-level test cases)' : 'NO (requirement-level test cases)'}`);

    const avgTokensPerReq = 1000;
    const estimated = reqCount * avgTokensPerReq;
    logs.push(`[preparation] Token budget estimated: ${estimated} tokens`);

    if (flowCount > 0) {
      logs.push(`[preparation] Business flows: ${flowCount} loaded`);
    }

    console.log(`[test-gen:graph] [${agentName}] ENTER, batch ${batchInfo}, ${reqCount} requirements, ${flowCount} flows, flowMode=${isFlowMode}`);

    const latencyMs = Date.now() - startTime;
    observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs);
    console.log(`[test-gen:graph] [${agentName}] EXIT, environment ready, latency=${latencyMs}ms`);

    return {
      environmentReady: true,
      initializationLogs: logs,
      tokenBudget: { estimated, limit: null },
      phase: 'analysis',
    };
  };
}