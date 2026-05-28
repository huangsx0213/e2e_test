import { Command } from '@langchain/langgraph';
import type { Phase } from './phase-machine.ts';
import type { CheckpointResolver } from './checkpoint-resolver.ts';

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

export interface InterruptInfo {
  threadId: string;
  checkpointNumber: number;
  phase: string;
  payload: Record<string, unknown>;
}

function buildResumeState(
  checkpointNumber: number,
  resolution: { action: string; feedback?: string; edits?: Record<string, unknown> },
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

function detectCheckpointNumber(payload: Record<string, unknown>): number {
  if ('conditions' in payload) return 1;
  if ('matrix' in payload) return 3;
  return 2;
}

function detectPhase(cpNum: number): Phase {
  switch (cpNum) {
    case 1: return 'review-conditions';
    case 2: return 'review-draft';
    case 3: return 'final-review';
    default: throw new Error(`Unknown checkpoint: ${cpNum}`);
  }
}

export class TestGenSession {
  private aborted = false;

  constructor(
    private readonly runId: string,
    private readonly pipelineFactory: () => Promise<any>,
    private readonly checkpointResolver: CheckpointResolver,
    private readonly options: SessionOptions,
  ) {}

  /**
   * Start a batch: run the pipeline until first interrupt or completion.
   * Returns BatchResult on completion, or InterruptInfo on interrupt.
   */
  async startBatch(
    batchIndex: number,
    inputState: Record<string, unknown>,
    onThreadId?: (threadId: string) => void,
  ): Promise<{ type: 'complete'; result: BatchResult } | { type: 'interrupt'; interrupt: InterruptInfo }> {
    const threadId = `${this.runId}-batch-${batchIndex}`;
    onThreadId?.(threadId);
    const config = { configurable: { thread_id: threadId } };

    const pipeline = await this.pipelineFactory();
    const stream = await pipeline.stream(inputState, { ...config, streamMode: 'values' as const });

    let lastState: any = null;
    try {
      for await (const chunk of stream) {
        if (this.aborted || this.options.signal?.aborted) {
          return { type: 'interrupt', interrupt: { threadId, checkpointNumber: 0, phase: 'aborted', payload: {} } };
        }
        lastState = chunk;
      }
    } catch (err: any) {
      if (this.aborted || this.options.signal?.aborted) {
        return { type: 'interrupt', interrupt: { threadId, checkpointNumber: 0, phase: 'aborted', payload: {} } };
      }
      throw err;
    }

    const interruptValue = (lastState as any)?.__interrupt__;
    if (interruptValue?.length > 0) {
      const payload = interruptValue[0].value as Record<string, unknown>;
      const cpNum = detectCheckpointNumber(payload);
      const phase = detectPhase(cpNum);

      this.checkpointResolver.onInterrupt(this.runId, cpNum, phase, payload);

      return {
        type: 'interrupt',
        interrupt: { threadId, checkpointNumber: cpNum, phase, payload },
      };
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
      return { type: 'complete', result };
    }

    return { type: 'complete', result: { batchIndex, cases: [], tokenUsage: { input: 0, output: 0, total: 0 }, lastState: {} } };
  }

  /**
   * Resume a batch from an interrupt. Uses the stored thread_id.
   * Returns BatchResult on completion, or InterruptInfo on next interrupt.
   */
  async resumeBatch(
    batchIndex: number,
    threadId: string,
    resolution: { action: string; feedback?: string; edits?: Record<string, unknown> },
    originalPayload: Record<string, unknown>,
  ): Promise<{ type: 'complete'; result: BatchResult } | { type: 'interrupt'; interrupt: InterruptInfo }> {
    const config = { configurable: { thread_id: threadId } };

    const resumeState = buildResumeState(
      detectCheckpointNumber(originalPayload),
      resolution,
      originalPayload,
    );

    const pipeline = await this.pipelineFactory();
    const stream = await pipeline.stream(
      new Command({ resume: resumeState }),
      { ...config, streamMode: 'values' as const },
    );

    let lastState: any = null;
    try {
      for await (const chunk of stream) {
        if (this.aborted || this.options.signal?.aborted) {
          return { type: 'interrupt', interrupt: { threadId, checkpointNumber: 0, phase: 'aborted', payload: {} } };
        }
        lastState = chunk;
      }
    } catch (err: any) {
      if (this.aborted || this.options.signal?.aborted) {
        return { type: 'interrupt', interrupt: { threadId, checkpointNumber: 0, phase: 'aborted', payload: {} } };
      }
      throw err;
    }

    const interruptValue = (lastState as any)?.__interrupt__;
    if (interruptValue?.length > 0) {
      const payload = interruptValue[0].value as Record<string, unknown>;
      const cpNum = detectCheckpointNumber(payload);
      const phase = detectPhase(cpNum);

      this.checkpointResolver.onInterrupt(this.runId, cpNum, phase, payload);

      return {
        type: 'interrupt',
        interrupt: { threadId, checkpointNumber: cpNum, phase, payload },
      };
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
      return { type: 'complete', result };
    }

    return { type: 'complete', result: { batchIndex, cases: [], tokenUsage: { input: 0, output: 0, total: 0 }, lastState: {} } };
  }

  abort(): void {
    this.aborted = true;
  }
}
