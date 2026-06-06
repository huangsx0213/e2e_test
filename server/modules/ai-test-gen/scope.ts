import { randomId } from '../../shared/utils/index.ts';
import { pipelineRepo } from './repository.ts';
import type { ChatMessage } from '../../../shared/ai/provider.ts';

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

function outputSummary(agentName: string, outputData: unknown): { count: number; label: string } {
  if (agentName === 'test_analyst') {
    const c = (outputData as any)?.testConditions?.length ?? 0;
    return { count: c, label: 'conditions' };
  }
  if (agentName === 'test_designer') {
    const c = (outputData as any)?.draftTestCases?.length ?? 0;
    return { count: c, label: 'draft cases' };
  }
  const c = (outputData as any)?.finalTestCases?.length ?? 0;
  return { count: c, label: 'final cases' };
}

export class RunScope {
  private readonly agentStates = new Map<string, AgentRunSnapshot>();
  private readonly runId: string;
  public currentBatch = 0;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalReasoningTokens = 0;
  public totalLatencyMs = 0;

  constructor(
    runId: string,
    public readonly projectId: string,
    public readonly mode: 'auto' | 'interactive',
    private readonly emitEvent: (event: string, data: unknown) => void,
  ) {
    this.runId = runId;
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
  }

  recordAgentError(agentName: string, error: Error): void {
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
  }

  recordAgentStep(agentName: string, stepIndex: number, stepName: string): void {
    const batch = this.currentBatch;
    const key = this.stateKey(agentName, batch);
    const snap = this.agentStates.get(key);
    if (snap) snap.rawTrace.push({ timestamp: Date.now(), step: stepIndex, name: stepName });
    this.emit('agent:step', { agentName, stepIndex, stepName, timestamp: Date.now() });
  }

  recordAgentThinking(agentName: string, text: string): void {
    this.emit('agent:thinking', { agentName, text, timestamp: Date.now() });
  }

  recordCheckpointResolved(checkpointNumber: number, action: string): void {
    pipelineRepo.insertAuditLog(this.runId, `checkpoint_${checkpointNumber}`, action, null);
    this.emit('checkpoint:resolved', { checkpointNumber, action, timestamp: Date.now() });
  }

  markComplete(stats: { totalCases: number; totalBatches: number }): void {
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
    pipelineRepo.markRunFailed(this.runId);
    this.emit('pipeline:error', { phase: 'orchestrator', message: error, recoverable: false });
  }

  private emit(event: string, data: unknown): void {
    this.emitEvent(event, data);
  }
}
