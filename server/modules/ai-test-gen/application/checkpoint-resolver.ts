import type { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';

export interface CheckpointResolution {
  action: 'approve' | 'retry';
  feedback?: string;
  edits?: Record<string, unknown>;
}

export interface CheckpointResolver {
  /** Called when graph hits interrupt. Persists checkpoint and emits SSE notification. */
  onInterrupt(
    runId: string,
    checkpointNumber: number,
    phase: string,
    payload: Record<string, unknown>,
  ): void;
}

export class AutoResolver implements CheckpointResolver {
  onInterrupt(
    _runId: string,
    _checkpointNumber: number,
    _phase: string,
    _payload: Record<string, unknown>,
  ): void {
    // Auto-approve: no-op, caller handles auto-resume
  }
}

export class InteractiveResolver implements CheckpointResolver {
  constructor(
    private readonly saveCheckpoint: (runId: string, data: unknown, phase: string) => void,
    private readonly sseGateway: SSEGateway,
  ) {}

  onInterrupt(
    runId: string,
    checkpointNumber: number,
    phase: string,
    payload: Record<string, unknown>,
  ): void {
    this.saveCheckpoint(runId, payload, phase);

    this.sseGateway.emit(runId, 'checkpoint:waiting', {
      checkpointId: `${runId}-cp-${checkpointNumber}`,
      checkpointNumber,
      type: phase,
      summary: checkpointNumber === 1
        ? `${(payload as any)?.conditions?.length || 0} Test Conditions`
        : checkpointNumber === 2
          ? `${(payload as any)?.cases?.length || 0} Draft Cases`
          : 'Final Review',
      payload,
    });
  }
}
