import type { ToolCallRecord } from './tool-orchestrator.ts';

export interface ReactLoopState {
  messages: any[];
  loadedSkills: Set<string>;
  iteration: number;
  toolHistory: ToolCallRecord[];
  totalTokenUsage: { input: number; output: number; reasoning: number };
}

export interface SerializedReactLoopState {
  loadedSkills: string[];
  toolHistory: ToolCallRecord[];
  totalTokenUsage: { input: number; output: number; reasoning: number };
  iteration: number;
}