import type { TestGenSession, BatchResult } from './test-gen-session.ts';

export interface BatchInput {
  batchIndex: number;
  inputState: Record<string, unknown>;
}

export interface BatchOrchestratorOptions {
  onBatchStart?: (batchIndex: number) => void;
  onBatchComplete?: (batchIndex: number, result: BatchResult | null) => void;
  onBatchError?: (batchIndex: number, error: Error) => void;
  isAborted: () => boolean;
}

export interface BatchRunSummary {
  results: BatchResult[];
  actualBatches: number;
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
        const result = await this.session.runBatch(batch.batchIndex, batch.inputState);
        if (result) {
          results.push(result);
          actualBatches++;
        }
        this.options.onBatchComplete?.(batch.batchIndex, result ?? null);
      } catch (err: any) {
        if (this.options.isAborted()) break;
        this.options.onBatchError?.(batch.batchIndex, err);
      }
    }

    return { results, actualBatches };
  }
}
