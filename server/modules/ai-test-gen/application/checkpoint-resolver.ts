import type { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';

export interface CheckpointResolution {
  action: 'approve' | 'retry';
  feedback?: string;
  edits?: Record<string, unknown>;
}

export interface CheckpointResolver {
  resolve(
    runId: string,
    checkpointNumber: number,
    phase: string,
    payload: Record<string, unknown>,
  ): Promise<CheckpointResolution>;
}

export class AutoResolver implements CheckpointResolver {
  async resolve(
    _runId: string,
    _checkpointNumber: number,
    _phase: string,
    _payload: Record<string, unknown>,
  ): Promise<CheckpointResolution> {
    return { action: 'approve' };
  }
}

interface ResumeEntry {
  resolve: (value: CheckpointResolution) => void;
  reject: (err: Error) => void;
}

type SaveCheckpointFn = (runId: string, data: unknown, phase: string) => void;

export class InteractiveResolver implements CheckpointResolver {
  private readonly resumeWaiters = new Map<string, ResumeEntry>();

  constructor(
    private readonly saveCheckpoint: SaveCheckpointFn,
    private readonly sseGateway: SSEGateway,
  ) {}

  async resolve(
    runId: string,
    checkpointNumber: number,
    phase: string,
    payload: Record<string, unknown>,
  ): Promise<CheckpointResolution> {
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

    return new Promise<CheckpointResolution>((resolve, reject) => {
      this.resumeWaiters.set(runId, { resolve, reject });
      setTimeout(() => {
        if (this.resumeWaiters.has(runId)) {
          this.resumeWaiters.delete(runId);
          reject(new Error('Review timeout after 30 minutes'));
        }
      }, 30 * 60 * 1000);
    });
  }

  resumeRun(runId: string, action: string, feedback?: string, editedData?: unknown): void {
    const waiter = this.resumeWaiters.get(runId);
    if (waiter) {
      this.resumeWaiters.delete(runId);
      waiter.resolve({
        action: action as 'approve' | 'retry',
        feedback,
        edits: editedData as Record<string, unknown> | undefined,
      });
    }
  }

  abortRun(runId: string): void {
    const waiter = this.resumeWaiters.get(runId);
    if (waiter) {
      this.resumeWaiters.delete(runId);
      waiter.reject(new Error('Test gen aborted'));
    }
  }
}
