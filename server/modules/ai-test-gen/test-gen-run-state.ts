import { randomId } from '../../shared/utils/index.ts';
import type { ChatMessage } from '../../../shared/ai/provider.ts';

export interface TraceEntry {
  timestamp: number;
  step: number;
  name: string;
}

export interface AgentRunSnapshot {
  logId: string;
  agentName: string;
  batch: number;
  inputPrompt: ChatMessage[] | null;
  outputData: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  latencyMs: number;
  rawTrace: TraceEntry[];
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export class TestGenRunState {
  private readonly agentStates = new Map<string, AgentRunSnapshot>();
  totalPromptTokens = 0;
  totalCompletionTokens = 0;
  totalReasoningTokens = 0;
  totalLatencyMs = 0;
  currentBatch = 0;

  private stateKey(agentName: string, batch: number): string {
    return `${agentName}:${batch}`;
  }

  setBatch(batch: number): void {
    this.currentBatch = batch;
  }

  recordAgentStart(agentName: string, batch: number, inputPrompt?: ChatMessage[]): AgentRunSnapshot {
    const key = this.stateKey(agentName, batch);
    const snap: AgentRunSnapshot = {
      logId: randomId('aglog'), agentName, batch,
      inputPrompt: inputPrompt ?? null,
      outputData: null,
      tokenUsage: { input: 0, output: 0, reasoning: 0 },
      latencyMs: 0, rawTrace: [], status: 'RUNNING',
    };
    this.agentStates.set(key, snap);
    return snap;
  }

  recordAgentComplete(agentName: string, batch: number, params: {
    tokenUsage: { input: number; output: number; reasoning: number };
    latencyMs: number;
    inputPrompt?: ChatMessage[];
    outputData?: unknown;
  }): AgentRunSnapshot | null {
    const key = this.stateKey(agentName, batch);
    let snap = this.agentStates.get(key);
    if (!snap) {
      snap = {
        logId: randomId('aglog'), agentName, batch,
        inputPrompt: null, outputData: null,
        tokenUsage: { input: 0, output: 0, reasoning: 0 },
        latencyMs: 0, rawTrace: [], status: 'RUNNING',
      };
      this.agentStates.set(key, snap);
    }
    snap.status = 'COMPLETED';
    snap.tokenUsage = params.tokenUsage;
    snap.latencyMs = params.latencyMs;
    if (params.inputPrompt) snap.inputPrompt = params.inputPrompt;
    if (params.outputData) snap.outputData = params.outputData;

    this.totalPromptTokens += params.tokenUsage.input;
    this.totalCompletionTokens += params.tokenUsage.output;
    this.totalReasoningTokens += params.tokenUsage.reasoning;
    this.totalLatencyMs += params.latencyMs;
    return snap;
  }

  recordAgentStep(agentName: string, batch: number, stepIndex: number, stepName: string): void {
    const key = this.stateKey(agentName, batch);
    const snap = this.agentStates.get(key);
    if (snap) {
      snap.rawTrace.push({ timestamp: Date.now(), step: stepIndex, name: stepName });
    }
  }

  getUsage(): { prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; total_tokens: number } {
    return {
      prompt_tokens: this.totalPromptTokens,
      completion_tokens: this.totalCompletionTokens,
      reasoning_tokens: this.totalReasoningTokens,
      total_tokens: this.totalPromptTokens + this.totalCompletionTokens + this.totalReasoningTokens,
    };
  }
}
