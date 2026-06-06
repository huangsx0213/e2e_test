import type { ChatMessage } from '../../../../../shared/ai/provider.ts';

export interface AgentObserver {
  onStep?: (agentName: string, stepIndex: number, stepName: string) => void;
  onThinking?: (agentName: string, text: string) => void;
  onStart?: (agentName: string) => void;
  onComplete?: (
    agentName: string,
    tokenUsage: { input: number; output: number; reasoning: number },
    latencyMs: number,
    inputPrompt?: ChatMessage[],
    outputData?: unknown,
  ) => void;
  onError?: (agentName: string, error: Error, rawResponse?: string) => void;
}

export interface SkillDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}