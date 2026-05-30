import type { ChatMessage } from '../../../shared/ai/provider.ts';
import { TestGenRunState } from './test-gen-run-state.ts';
import { TestGenPersister, type RunPersister } from './test-gen-persister.ts';

function logOutputInfo(agentName: string, outputData: unknown): { count: number; label: string } {
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

export class TestGenExecutionScope {
  private readonly state = new TestGenRunState();

  constructor(
    public readonly runId: string,
    public readonly projectId: string,
    public readonly mode: 'auto' | 'interactive',
    private readonly emitEvent: (event: string, data: unknown) => void,
    private readonly persister: RunPersister = new TestGenPersister(),
  ) {}

  get currentBatch(): number {
    return this.state.currentBatch;
  }

  setBatch(batch: number, total: number): void {
    this.state.setBatch(batch);
    this.emit('batch:start', { batch, total, timestamp: Date.now() });
  }

  recordAgentStart(agentName: string, batch: number, inputPrompt?: ChatMessage[]): void {
    const snap = this.state.recordAgentStart(agentName, batch, inputPrompt);
    this.persister.saveAgentLog(snap, this.runId);
    this.emit('agent:start', { agentName, batch, timestamp: Date.now() });
  }

  recordAgentComplete(agentName: string, batch: number, params: {
    tokenUsage: { input: number; output: number; reasoning: number };
    latencyMs: number;
    inputPrompt?: ChatMessage[];
    outputData?: unknown;
  }): void {
    const snap = this.state.recordAgentComplete(agentName, batch, params);

    if (snap) this.persister.saveAgentLog(snap, this.runId);

    const { count, label } = logOutputInfo(agentName, params.outputData);
    this.emit('agent:complete', {
      agentName, batch, outputCount: count,
      outputSummary: `${count} ${label}`,
      outputLabel: label,
      tokenUsage: params.tokenUsage.input + params.tokenUsage.output + params.tokenUsage.reasoning,
      latencyMs: params.latencyMs, timestamp: Date.now(),
    });
  }

  recordAgentError(agentName: string, batch: number, error: Error): void {
    const snap = this.state.recordAgentError(agentName, batch, error.message, (error as any).rawResponse);
    if (snap) this.persister.saveAgentLog(snap, this.runId);
    this.emit('agent:error', { agentName, batch, message: error.message, timestamp: Date.now() });
  }

  recordAgentStep(agentName: string, batch: number, stepIndex: number, stepName: string): void {
    this.state.recordAgentStep(agentName, batch, stepIndex, stepName);
    this.emit('agent:step', { agentName, stepIndex, stepName, timestamp: Date.now() });
  }

  recordAgentThinking(agentName: string, text: string): void {
    this.emit('agent:thinking', { agentName, text, timestamp: Date.now() });
  }

  recordCheckpointResolved(checkpointNumber: number, action: string): void {
    this.persister.insertAuditLog(
      this.runId, `checkpoint_${checkpointNumber}`, action, 'system', null,
    );
    this.emit('checkpoint:resolved', { checkpointNumber, action, timestamp: Date.now() });
  }

  markComplete(stats: { totalCases: number; totalBatches: number }): void {
    const usage = this.state.getUsage();
    this.persister.updateRunStatus(this.runId, 'COMPLETED', 'complete', usage);
    this.emit('pipeline:complete', {
      summary: `Generated ${stats.totalCases} test cases across ${stats.totalBatches} batches`,
      stats: { ...stats, totalTokens: usage.total_tokens, totalLatencyMs: this.state.totalLatencyMs },
    });
  }

  markFailed(error: string): void {
    this.persister.updateRunStatus(this.runId, 'FAILED', 'orchestrator');
    this.emit('pipeline:error', { phase: 'orchestrator', message: error, recoverable: false });
  }

  private emit(event: string, data: unknown): void {
    this.emitEvent(event, data);
  }
}
