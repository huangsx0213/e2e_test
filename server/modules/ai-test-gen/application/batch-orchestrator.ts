import type { TestGenSession, BatchResult, InterruptInfo } from './test-gen-session.ts';

export interface BatchInput {
  batchIndex: number;
  inputState: Record<string, unknown>;
}

export interface BatchOrchestratorOptions {
  onBatchStart?: (batchIndex: number) => void;
  onBatchComplete?: (batchIndex: number, result: BatchResult | null) => void;
  onBatchError?: (batchIndex: number, error: Error) => void;
  onBatchInterrupt?: (batchIndex: number, interrupt: InterruptInfo) => void;
  isAborted: () => boolean;
}

export interface BatchRunSummary {
  results: BatchResult[];
  actualBatches: number;
  interruptedBatch?: InterruptInfo;
}

export class BatchOrchestrator {
  constructor(
    private readonly session: TestGenSession,
    private readonly options: BatchOrchestratorOptions,
  ) {}

  async runAll(batches: BatchInput[]): Promise<BatchRunSummary> {
    const results: BatchResult[] = [];
    let actualBatches = 0;

    for (const batch of batches) {
      if (this.options.isAborted()) break;

      this.options.onBatchStart?.(batch.batchIndex);

      try {
        const outcome = await this.session.startBatch(batch.batchIndex, batch.inputState);

        if (outcome.type === 'interrupt') {
          this.options.onBatchInterrupt?.(batch.batchIndex, outcome.interrupt);
          return { results, actualBatches, interruptedBatch: outcome.interrupt };
        }

        results.push(outcome.result);
        actualBatches++;
        this.options.onBatchComplete?.(batch.batchIndex, outcome.result);
      } catch (err: any) {
        if (this.options.isAborted()) break;
        this.options.onBatchError?.(batch.batchIndex, err);
      }
    }

    return { results, actualBatches };
  }

  /**
   * Resume from a specific batch after interrupt.
   * Continues from the interrupted batch through remaining batches.
   */
  async resumeAll(
    interruptedBatchIndex: number,
    threadId: string,
    resolution: { action: string; feedback?: string; edits?: Record<string, unknown> },
    originalPayload: Record<string, unknown>,
    remainingBatches: BatchInput[],
  ): Promise<BatchRunSummary> {
    const results: BatchResult[] = [];
    let actualBatches = 0;

    this.options.onBatchStart?.(interruptedBatchIndex);
    const outcome = await this.session.resumeBatch(
      interruptedBatchIndex, threadId, resolution,
    );

    if (outcome.type === 'interrupt') {
      this.options.onBatchInterrupt?.(interruptedBatchIndex, outcome.interrupt);
      return { results, actualBatches, interruptedBatch: outcome.interrupt };
    }

    results.push(outcome.result);
    actualBatches++;
    this.options.onBatchComplete?.(interruptedBatchIndex, outcome.result);

    for (const batch of remainingBatches) {
      if (this.options.isAborted()) break;
      this.options.onBatchStart?.(batch.batchIndex);

      const nextOutcome = await this.session.startBatch(batch.batchIndex, batch.inputState);
      if (nextOutcome.type === 'interrupt') {
        this.options.onBatchInterrupt?.(batch.batchIndex, nextOutcome.interrupt);
        return { results, actualBatches, interruptedBatch: nextOutcome.interrupt };
      }
      results.push(nextOutcome.result);
      actualBatches++;
      this.options.onBatchComplete?.(batch.batchIndex, nextOutcome.result);
    }

    return { results, actualBatches };
  }
}
