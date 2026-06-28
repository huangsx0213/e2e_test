import { randomId } from '../../shared/utils/index.ts';
import { pipelineRepo } from './repository.ts';
import type { ChatMessage } from './infra/provider.ts';

interface TraceEntry {
  timestamp: number;
  step: number;
  name: string;
}

interface AgentRunSnapshot {
  logId: string;
  agentName: string;
  batch: number;
  inputPrompt: ChatMessage[] | null;
  outputData: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  latencyMs: number;
  rawTrace: TraceEntry[];
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  errorRawResponse?: string;
  toolHistory?: unknown[];
}

const OUTPUT_SUMMARY_MAP: Record<string, { key: string; label: string }> = {
  test_architect: { key: 'riskEpicTree', label: 'risk epics' },
  test_analyst: { key: 'testConditions', label: 'conditions' },
  test_designer: { key: 'draftTestCases', label: 'draft cases' },
};

function outputSummary(agentName: string, outputData: unknown): { count: number; label: string } {
  const def = OUTPUT_SUMMARY_MAP[agentName] ?? { key: 'finalTestCases', label: 'final cases' };
  const c = ((outputData as any)?.[def.key]?.length ?? 0) as number;
  return { count: c, label: def.label };
}

export class RunScope {
  private readonly agentStates = new Map<string, AgentRunSnapshot>();
  private readonly runId: string;
  public currentBatch = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalReasoningTokens = 0;
  public totalLatencyMs = 0;

  // Thinking throttle: buffer text per agent+phase+type, flush every THINKING_FLUSH_MS
  private readonly thinkingBuffer = new Map<string, { text: string; type: string; phase: string }>();
  private thinkingFlushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly THINKING_FLUSH_MS = 3000;
  // Accumulated thinking entries for persistence
  private readonly thinkingAccumulator = new Map<string, Array<{ type: string; phase: string; text: string; timestamp: number; batch?: number }>>();

  constructor(
    runId: string,
    public readonly projectId: string,
    public readonly mode: 'auto' | 'interactive',
    private readonly emitEvent: (event: string, data: unknown) => void,
  ) {
    this.runId = runId;
    // Restore token counters from previously completed agent logs (for resume/retry scenarios)
    const existing = pipelineRepo.getAccumulatedTokenUsage(runId);
    this.totalPromptTokens = existing.prompt_tokens;
    this.totalCompletionTokens = existing.completion_tokens;
    this.totalReasoningTokens = existing.reasoning_tokens;
    this.totalLatencyMs = existing.latency_ms;
    this.startThinkingFlush();
  }

  private startThinkingFlush(): void {
    if (this.thinkingFlushTimer) return;
    this.thinkingFlushTimer = setInterval(() => this.flushThinking(), RunScope.THINKING_FLUSH_MS);
    this.thinkingFlushTimer.unref?.();
  }

  private flushThinking(): void {
    for (const [key, entry] of this.thinkingBuffer) {
      if (entry.text.length > 0) {
        const agentName = key.split(':').slice(0, -2).join(':') || key;
        this.emit('agent:thinking', { agentName, text: entry.text, type: entry.type, phase: entry.phase, batch: this.currentBatch, timestamp: Date.now() });
        this.accumulateThinkingEntry(agentName, entry);
      }
    }
    this.thinkingBuffer.clear();
  }

  private stopThinkingFlush(): void {
    this.flushThinking();
    if (this.thinkingFlushTimer) {
      clearInterval(this.thinkingFlushTimer);
      this.thinkingFlushTimer = null;
    }
  }

  private accumulateThinkingEntry(agentName: string, entry: { text: string; type: string; phase: string }): void {
    const acc = this.thinkingAccumulator.get(agentName) ?? [];
    const last = acc[acc.length - 1];
    if (last && last.type === entry.type && last.phase === entry.phase) {
      last.text += entry.text;
    } else {
      acc.push({ type: entry.type, phase: entry.phase, text: entry.text, timestamp: Date.now(), batch: this.currentBatch });
    }
    this.thinkingAccumulator.set(agentName, acc);
  }

  private stateKey(agentName: string, batch: number): string {
    return `${agentName}:${batch}`;
  }

  setBatch(batch: number, total: number): void {
    this.currentBatch = batch;
    this.emit('batch:start', { batch, total, timestamp: Date.now() });
  }

  restoreBatchState(batch: number): void {
    this.currentBatch = batch;
  }

  recordAgentStart(agentName: string, inputPrompt?: ChatMessage[]): void {
    const batch = this.currentBatch;
    const key = this.stateKey(agentName, batch);
    const snap: AgentRunSnapshot = {
      logId: randomId('aglog'),
      agentName,
      batch,
      inputPrompt: inputPrompt ?? null,
      outputData: null,
      tokenUsage: { input: 0, output: 0, reasoning: 0 },
      latencyMs: 0,
      rawTrace: [],
      status: 'RUNNING',
    };
    this.agentStates.set(key, snap);
    pipelineRepo.saveAgentLog({
      logId: snap.logId, batch, agentName, status: 'RUNNING',
      inputPrompt, rawTrace: [],
    }, this.runId);
    this.emit('agent:start', { agentName, batch, timestamp: Date.now() });
  }

  recordAgentComplete(agentName: string, params: {
    tokenUsage: { input: number; output: number; reasoning: number };
    latencyMs: number;
    inputPrompt?: ChatMessage[];
    outputData?: unknown;
    toolHistory?: unknown[];
  }): void {
    // Flush any remaining thinking text for this agent before marking complete
    for (const [key, entry] of this.thinkingBuffer) {
      if (key.startsWith(`${agentName}:`) && entry.text.length > 0) {
        this.emit('agent:thinking', { agentName, text: entry.text, type: entry.type, phase: entry.phase, batch: this.currentBatch, timestamp: Date.now() });
        this.accumulateThinkingEntry(agentName, entry);
        this.thinkingBuffer.delete(key);
      }
    }

    const batch = this.currentBatch;
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
    if (params.toolHistory) snap.toolHistory = params.toolHistory;

    pipelineRepo.saveAgentLog({
      logId: snap.logId, batch, agentName, status: 'COMPLETED',
      inputPrompt: snap.inputPrompt, outputData: snap.outputData,
      tokenUsage: params.tokenUsage, latencyMs: params.latencyMs,
      rawTrace: snap.rawTrace, toolHistory: params.toolHistory,
    }, this.runId);

    this.totalPromptTokens += params.tokenUsage.input;
    this.totalCompletionTokens += params.tokenUsage.output;
    this.totalReasoningTokens += params.tokenUsage.reasoning;
    this.totalLatencyMs += params.latencyMs;

    const { count, label } = outputSummary(agentName, params.outputData);
    this.emit('agent:complete', {
      agentName, batch, outputCount: count,
      outputSummary: `${count} ${label}`, outputLabel: label,
      tokenUsage: params.tokenUsage.input + params.tokenUsage.output + params.tokenUsage.reasoning,
      latencyMs: params.latencyMs, timestamp: Date.now(),
    });

    // Incrementally persist thinking data after each agent completes
    this.persistThinkingData();
  }

  recordAgentError(agentName: string, error: Error): void {
    // Flush any remaining thinking text for this agent
    for (const [key, entry] of this.thinkingBuffer) {
      if (key.startsWith(`${agentName}:`) && entry.text.length > 0) {
        this.emit('agent:thinking', { agentName, text: entry.text, type: entry.type, phase: entry.phase, batch: this.currentBatch, timestamp: Date.now() });
        this.accumulateThinkingEntry(agentName, entry);
        this.thinkingBuffer.delete(key);
      }
    }

    const batch = this.currentBatch;
    const key = this.stateKey(agentName, batch);
    const snap = this.agentStates.get(key);
    if (snap) {
      snap.status = 'FAILED';
      snap.errorMessage = error.message;
      snap.errorRawResponse = (error as any).rawResponse;
      pipelineRepo.saveAgentLog({
        logId: snap.logId, batch, agentName, status: 'FAILED',
        errorMessage: snap.errorMessage, errorRawResponse: snap.errorRawResponse,
        rawTrace: snap.rawTrace, toolHistory: snap.toolHistory,
        tokenUsage: snap.tokenUsage, latencyMs: snap.latencyMs,
        inputPrompt: snap.inputPrompt, outputData: snap.outputData,
      }, this.runId);
    }
    this.emit('agent:error', { agentName, batch, message: error.message, timestamp: Date.now() });

    // Incrementally persist thinking data after agent error
    this.persistThinkingData();
  }

  recordAgentStep(agentName: string, stepIndex: number, stepName: string): void {
    const batch = this.currentBatch;
    const key = this.stateKey(agentName, batch);
    const snap = this.agentStates.get(key);
    if (snap) snap.rawTrace.push({ timestamp: Date.now(), step: stepIndex, name: stepName });
    this.emit('agent:step', { agentName, stepIndex, stepName, batch, timestamp: Date.now() });
  }

  recordAgentThinking(agentName: string, text: string, type: 'reasoning' | 'content' = 'content', phase: 'react' | 'extraction' = 'react'): void {
    // Buffer thinking text, flush periodically via timer
    const key = `${agentName}:${phase}:${type}`;
    const existing = this.thinkingBuffer.get(key);
    if (existing) {
      existing.text += text;
    } else {
      this.thinkingBuffer.set(key, { text, type, phase });
    }
  }

  recordCheckpointResolved(checkpointNumber: number, action: string): void {
    pipelineRepo.insertAuditLog(this.runId, `checkpoint_${checkpointNumber}`, action, null);
    this.emit('checkpoint:resolved', { checkpointNumber, action, timestamp: Date.now() });
  }

  /** Flush buffered thinking text and persist all accumulated thinking data.
   *  Called by orchestrator when pipeline is interrupted at a checkpoint. */
  flushAndPersistThinking(): void {
    this.flushThinking();
    this.persistThinkingData();
  }

  markComplete(stats: { totalCases: number; totalBatches: number }): void {
    this.stopThinkingFlush();
    this.persistThinkingData();
    const usage = {
      prompt_tokens: this.totalPromptTokens,
      completion_tokens: this.totalCompletionTokens,
      reasoning_tokens: this.totalReasoningTokens,
      total_tokens: this.totalPromptTokens + this.totalCompletionTokens + this.totalReasoningTokens,
    };
    pipelineRepo.markRunCompleted(this.runId, 'complete', usage);
    this.emit('pipeline:complete', {
      summary: `Generated ${stats.totalCases} test cases across ${stats.totalBatches} batches`,
      stats: { ...stats, totalTokens: usage.total_tokens, totalLatencyMs: this.totalLatencyMs },
    });
  }

  markFailed(error: string): void {
    this.stopThinkingFlush();
    this.persistThinkingData();
    pipelineRepo.markRunFailed(this.runId);
    this.emit('pipeline:error', { phase: 'orchestrator', message: error, recoverable: false });
  }

  private emit(event: string, data: unknown): void {
    this.emitEvent(event, data);
  }

  private persistThinkingData(): void {
    if (this.thinkingAccumulator.size === 0) return;
    // Convert agentName keys to nodeId keys for client compatibility
    const AGENT_NAME_TO_NODE_ID: Record<string, string> = {
      test_architect: 'test_architect',
      test_analyst: 'analyst',
      test_designer: 'designer',
      quality_manager: 'quality',
      final_reviewer: 'reviewer',
    };
    // Merge with existing persisted data (for resume/retry scenarios)
    const existing = pipelineRepo.getThinkingData(this.runId) || {};
    const data: Record<string, Array<{ type: string; phase: string; text: string; timestamp: number }>> = { ...existing };
    for (const [agentName, entries] of this.thinkingAccumulator) {
      const nodeId = AGENT_NAME_TO_NODE_ID[agentName] || agentName;
      data[nodeId] = [...(data[nodeId] || []), ...entries];
    }
    pipelineRepo.saveThinkingData(this.runId, JSON.stringify(data));
    // Clear accumulator after persisting to prevent duplicate entries
    this.thinkingAccumulator.clear();
  }
}
