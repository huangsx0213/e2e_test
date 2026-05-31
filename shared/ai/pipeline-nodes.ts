import { interrupt } from '@langchain/langgraph';
import { runAgent, type AgentContext } from './agent.ts';
import type { ChatMessage } from './provider.ts';
import type { ToolDef, ToolContext, ToolResult } from './tool.ts';
import type { ToolCallRecord } from './tool-orchestrator.ts';

export interface AgentObserver {
  onStep?: (agentName: string, stepIndex: number, stepName: string) => void;
  onThinking?: (agentName: string, text: string) => void;
  onStart?: (agentName: string, inputPrompt?: ChatMessage[]) => void;
  onComplete?: (agentName: string, tokenUsage: { input: number; output: number; reasoning: number }, latencyMs: number, inputPrompt?: ChatMessage[], outputData?: unknown, toolHistory?: ToolCallRecord[]) => void;
  onError?: (agentName: string, error: Error, rawResponse?: string) => void;
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
  useReActLoop?: boolean,
) {
  return async (state: any) => {
    logEnter?.(state);
    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, preStep.index, preStep.name);
    let raw;
    try {
      raw = await runAgent(ctx, buildInput(state), {
        timeoutMs,
        useCache,
        signal,
        useReActLoop,
        onStep: (idx, name) => observer?.onStep?.(agentName, idx, name),
        onThinking: (text) => observer?.onThinking?.(agentName, text),
      });
    } catch (err: any) {
      observer?.onError?.(agentName, err, err.rawResponse);
      throw err;
    }
    logExit?.(raw);
    observer?.onComplete?.(agentName, raw.tokenUsage, raw.latencyMs, raw.inputPrompt, raw.result, (raw as any).toolHistory);
    for (const s of postSteps) {
      observer?.onStep?.(agentName, s.index, s.name);
    }
    return buildResult(raw);
  };
}

export function createToolNode(
  tool: ToolDef,
  buildInput: (state: any) => unknown,
  buildResult: (raw: any) => Record<string, unknown>,
  preStep: { index: number; name: string },
  postSteps: Array<{ index: number; name: string }>,
  observer?: AgentObserver,
  toolContext?: ToolContext,
  timeoutMs?: number,
  signal?: AbortSignal,
  logEnter?: (state: any) => void,
  logExit?: (raw: any) => void,
) {
  return async (state: any) => {
    logEnter?.(state);
    observer?.onStart?.(tool.name);
    observer?.onStep?.(tool.name, preStep.index, preStep.name);

    const input = buildInput(state);

    const ctx: ToolContext = {
      ...toolContext,
      timeoutMs: timeoutMs ?? toolContext?.timeoutMs,
      signal: signal ?? toolContext?.signal,
      onStep: toolContext?.onStep ?? ((stepIndex: number, stepName: string) => {
        observer?.onStep?.(tool.name, stepIndex, stepName);
      }),
      onThinking: toolContext?.onThinking ?? ((text: string) => {
        observer?.onThinking?.(tool.name, text);
      }),
    };

    let result: ToolResult;
    try {
      result = await tool.execute(input, ctx);
    } catch (err: any) {
      observer?.onError?.(tool.name, err);
      throw err;
    }

    logExit?.(result);
    const r = result as any;
    if (!r.success) {
      const err = new Error(`Tool "${tool.name}" failed: ${r.error?.message ?? 'unknown error'}`);
      (err as any).rawResponse = r.error?.details;
      observer?.onError?.(tool.name, err);
      throw err;
    }
    observer?.onComplete?.(tool.name, r.metadata.tokenUsage, r.metadata.latencyMs, r.metadata.inputPrompt, r.data, (r as any).data?.toolHistory);
    for (const s of postSteps) {
      observer?.onStep?.(tool.name, s.index, s.name);
    }
    return buildResult(result);
  };
}

export function createCheckpointNode<T extends { retry?: boolean }>(
  buildPayload: (state: any) => T,
  onResolve: (state: any, response: T) => Record<string, unknown>,
  onRetry: (state: any, response?: T) => Record<string, unknown>,
  logEnter?: (state: any) => void,
  logRetry?: () => void,
  logExit?: (state: any, response: T) => void,
) {
  return async (state: any) => {
    logEnter?.(state);
    const response = interrupt<T>(buildPayload(state));
    if (response?.retry) {
      logRetry?.();
      return onRetry(state, response);
    }
    logExit?.(state, response);
    return onResolve(state, response);
  };
}
