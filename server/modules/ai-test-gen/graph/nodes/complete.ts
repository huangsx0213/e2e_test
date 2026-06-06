import type { TestGenState } from '../state';
import type { AgentObserver } from './types';

export interface CompleteNodeOptions {
  observer?: AgentObserver;
}

export function makeCompleteNode(opts: CompleteNodeOptions) {
  const { observer } = opts;
  const agentName = 'complete';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    observer?.onStart?.(agentName);

    const finalCount = state.finalTestCases?.length ?? 0;
    const matrixRows = state.coverageMatrix?.rows?.length ?? 0;
    console.log(`[test-gen:graph] [complete] Finalizing: ${finalCount} test cases, ${matrixRows} coverage rows`);

    const latencyMs = Date.now() - startTime;
    observer?.onComplete?.(agentName, { input: 0, output: 0, reasoning: 0 }, latencyMs);

    return {
      phase: 'complete' as const,
    };
  };
}