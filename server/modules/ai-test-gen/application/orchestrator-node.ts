import { interrupt } from '@langchain/langgraph';
import { AgentTool } from '../../../../shared/ai/tool.ts';
import { OrchestratorRole } from '../../../../shared/ai/roles/test-orchestrator.ts';
import type { SerializedReactLoopState } from '../../../../shared/ai/react-loop-state.ts';
import type { AIProvider } from '../../../../shared/ai/provider.ts';

export interface TestGenOrchestratorState {
  input: unknown;
  messages: any[];
  reactLoopState: SerializedReactLoopState | null;
  result?: unknown;
  toolHistory?: any[];
  providerFactory: () => AIProvider;
  promptVersion: string;
  modelName: string;
}

export async function orchestratorNode(state: TestGenOrchestratorState): Promise<Partial<TestGenOrchestratorState>> {
  const provider = state.providerFactory();
  const getPromptVersion = () => state.promptVersion ?? 'unknown';
  const getModelName = () => state.modelName ?? 'unknown';

  const agent = new AgentTool(
    OrchestratorRole,
    () => provider,
    getPromptVersion,
    getModelName
  );

  const result = await agent.execute(state.input, {
    useReActLoop: true,
    resumeState: state.reactLoopState ?? null,
  } as any);

  const r = result as any;
  if (!r.success) {
    throw new Error(`Orchestrator failed: ${r.error?.message ?? 'unknown error'}`);
  }

  const data = r.data;

  if (data.requestedReview && data.currentReactLoopState) {
    const feedback = interrupt({
      type: 'request_review',
      phase: data.requestedReview.phase,
      data: data.requestedReview.data,
      reactLoopState: data.currentReactLoopState,
    });
    return {
      messages: [...(state.messages ?? []), { role: 'user', content: feedback as string }],
      reactLoopState: data.currentReactLoopState,
    };
  }

  return {
    result: data.result ?? data,
    toolHistory: data.toolHistory ?? [],
  };
}