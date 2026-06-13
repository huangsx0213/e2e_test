import type { ZodType } from 'zod';
import type { ChatMessage } from '../../infra/provider.ts';

export interface SkillDefinition {
  name: string;
  description: string;
  schema: ZodType;
  func: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentObserver {
  onStep?: (agentName: string, stepIndex: number, stepName: string) => void;
  onThinking?: (agentName: string, text: string, type: 'reasoning' | 'content', phase: 'react' | 'extraction') => void;
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