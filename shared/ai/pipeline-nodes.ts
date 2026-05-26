import { interrupt } from '@langchain/langgraph';
import { runAgent, type AgentContext } from './agent.ts';
import type { ChatMessage } from './provider.ts';

export interface AgentObserver {
  onStep?: (agentName: string, stepIndex: number, stepName: string) => void;
  onThinking?: (agentName: string, text: string) => void;
  onStart?: (agentName: string, inputPrompt?: ChatMessage[]) => void;
  onComplete?: (agentName: string, tokenUsage: { input: number; output: number; reasoning: number }, latencyMs: number, inputPrompt?: ChatMessage[], outputData?: unknown) => void;
}

export function createAgentNode(
  ctx: AgentContext,
  agentName: string,
  buildInput: (state: any) => unknown,
  buildResult: (raw: any) => Record<string, unknown>,
  preStep: { index: number; name: string },
  postSteps: Array<{ index: number; name: string }>,
  observer?: AgentObserver,
  timeoutMs?: number,
  useCache?: boolean,
  signal?: AbortSignal,
  logEnter?: (state: any) => void,
  logExit?: (raw: any) => void,
) {
  return async (state: any) => {
    logEnter?.(state);
    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, preStep.index, preStep.name);
    const raw = await runAgent(ctx, buildInput(state), {
      timeoutMs,
      useCache,
      signal,
      onStep: (idx, name) => observer?.onStep?.(agentName, idx, name),
      onThinking: (text) => observer?.onThinking?.(agentName, text),
    });
    logExit?.(raw);
    observer?.onComplete?.(agentName, raw.tokenUsage, raw.latencyMs, raw.inputPrompt, raw.result);
    for (const s of postSteps) {
      observer?.onStep?.(agentName, s.index, s.name);
    }
    return buildResult(raw);
  };
}

export function createCheckpointNode<T extends { retry?: boolean }>(
  buildPayload: (state: any) => T,
  onResolve: (state: any, response: T) => Record<string, unknown>,
  onRetry: (state: any) => Record<string, unknown>,
  logEnter?: (state: any) => void,
  logRetry?: () => void,
  logExit?: (state: any, response: T) => void,
) {
  return async (state: any) => {
    logEnter?.(state);
    const response = interrupt<T>(buildPayload(state));
    if (response?.retry) {
      logRetry?.();
      return onRetry(state);
    }
    logExit?.(state, response);
    return onResolve(state, response);
  };
}
