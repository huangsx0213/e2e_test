import { Command } from '@langchain/langgraph';
import type { Phase } from './phase-machine.ts';
import type { CheckpointResolver, CheckpointResolution } from './checkpoint-resolver.ts';

export interface SessionOptions {
  mode: 'auto' | 'interactive';
  onEvent?: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

export interface BatchResult {
  batchIndex: number;
  cases: unknown[];
  tokenUsage: { input: number; output: number; total: number };
  lastState: Record<string, unknown>;
}

function buildResumeState(
  checkpointNumber: number,
  resolution: CheckpointResolution,
  originalPayload: Record<string, unknown>,
): Record<string, unknown> {
  if (resolution.action === 'retry') {
    return { retry: true, feedback: resolution.feedback ?? '' };
  }
  const edits = resolution.edits ?? {};
  switch (checkpointNumber) {
    case 1:
      return {
        conditions: (edits as any).conditions ?? originalPayload.conditions,
        analysis: (edits as any).analysis ?? originalPayload.analysis,
        feedback: resolution.feedback ?? '',
      };
    case 2:
      return {
        cases: (edits as any).cases ?? originalPayload.cases,
        feedback: resolution.feedback ?? '',
      };
    case 3:
      return {
        cases: (edits as any).cases ?? originalPayload.cases,
        matrix: (edits as any).matrix ?? originalPayload.matrix,
      };
    default:
      throw new Error(`Unknown checkpoint number: ${checkpointNumber}`);
  }
}

export class TestGenSession {
  private readonly lastStates = new Map<number, Record<string, unknown>>();
  private aborted = false;

  constructor(
    private readonly runId: string,
    private readonly pipeline: any,
    private readonly checkpointResolver: CheckpointResolver,
    private readonly options: SessionOptions,
  ) {}

  async runBatch(
    batchIndex: number,
    inputState: Record<string, unknown>,
  ): Promise<BatchResult | null> {
    const threadId = `${this.runId}-batch-${batchIndex}`;
    const config = { configurable: { thread_id: threadId } };
    const abortSignal = this.options.signal;

    let isResume = false;
    let lastState: any = null;

    while (true) {
      if (this.aborted || abortSignal?.aborted) return null;

      const stream = await this.pipeline.stream(
        isResume ? new Command({ resume: inputState }) : inputState,
        { ...config, streamMode: 'values' as const },
      );
      isResume = true;

      try {
        for await (const chunk of stream) {
          if (this.aborted || abortSignal?.aborted) return null;
          lastState = chunk;
        }
      } catch (err: any) {
        if (this.aborted || abortSignal?.aborted) return null;
        throw err;
      }

      const interruptValue = (lastState as any)?.__interrupt__;
      if (interruptValue?.length > 0) {
        const payload = interruptValue[0].value as Record<string, unknown>;

        console.log('[cpnum] interrupt payload keys:', Object.keys(payload).join(','), '| has conditions:', 'conditions' in payload, '| has matrix:', 'matrix' in payload);

        const cpNum = 'conditions' in payload ? 1
          : 'matrix' in payload ? 3 : 2;

        const phase = cpNum === 1 ? 'review-conditions' as Phase
          : cpNum === 2 ? 'review-draft' as Phase
          : 'final-review' as Phase;

        const resolution = await this.checkpointResolver.resolve(
          this.runId, cpNum, phase, payload,
        );

        inputState = buildResumeState(cpNum, resolution, payload);

        this.options.onEvent?.('checkpoint:resolved', {
          checkpointId: `${this.runId}-cp-${batchIndex}-${cpNum}`,
          checkpointNumber: cpNum,
          action: resolution.action,
          timestamp: Date.now(),
        });

        continue;
      }

      if (lastState) {
        const result: BatchResult = {
          batchIndex,
          cases: (lastState.finalTestCases ?? []) as unknown[],
          tokenUsage: {
            input: lastState.tokenUsage?.prompt_tokens ?? 0,
            output: lastState.tokenUsage?.completion_tokens ?? 0,
            total: (lastState.tokenUsage?.prompt_tokens ?? 0) + (lastState.tokenUsage?.completion_tokens ?? 0),
          },
          lastState,
        };
        this.lastStates.set(batchIndex, lastState);
        return result;
      }

      return null;
    }
  }

  getLastState(batchIndex: number): Record<string, unknown> | null {
    return this.lastStates.get(batchIndex) ?? null;
  }

  abort(): void {
    this.aborted = true;
  }
}
