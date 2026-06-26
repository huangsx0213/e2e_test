import { Command } from '@langchain/langgraph';
import { buildTestGenGraph } from './graph/graph.ts';
import { checkpointer } from './graph/checkpointer.ts';
import type { AIProvider } from './infra/provider.ts';
import type { AgentObserver } from './graph/nodes/types.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import type { TestGenState } from './graph/state.ts';
import { clearQueryCache } from './graph/skills/data-skills.ts';
import { Log } from '../../shared/services/logger.ts';

export interface BatchInput {
  batchIndex: number;
  inputState: {
    projectId: string;
    runId: string;
    mode: 'auto' | 'interactive';
    requirementIds: string[];
    currentBatch: any[];
    batchContext: { currentBatch: number; totalBatches: number; processedCount: number };
    projectContext: { name: string; pages: { name: string }[]; endpoints: { name: string; method: string }[] };
    businessFlowBlueprints: any[] | undefined;
    selectedFlowIds: string[];
    phase: TestGenState['phase'];
    analystMode?: 'STAGE_1_REQUIREMENT' | 'STAGE_2_FLOW' | 'STAGE_3_ERROR_GUESSING';
    errors: any[];
    globalBlueprint?: any;
  };
}

export interface BatchResult {
  batchIndex: number;
  cases: unknown[];
  tokenUsage: { input: number; output: number; total: number };
  lastState: Partial<TestGenState>;
}

export interface InterruptInfo {
  threadId: string;
  phase: string;
  checkpointNumber: number;
  payload: Record<string, unknown>;
}

export type RunOutcome =
  | { type: 'complete'; result: BatchResult }
  | { type: 'interrupt'; interrupt: InterruptInfo };

export interface SessionOptions {
  runId: string;
  provider: AIProvider;
  observer: AgentObserver;
  modelName: string;
  tokenLimit: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  signal?: AbortSignal;
}

export class TestGenSession {
  private aborted = false;

  constructor(private readonly opts: SessionOptions) {}

  abort(): void {
    this.aborted = true;
  }

  private isAborted(): boolean {
    return this.aborted || this.opts.signal?.aborted === true;
  }

  private compileGraph() {
    return buildTestGenGraph({
      provider: this.opts.provider,
      observer: this.opts.observer,
      modelName: this.opts.modelName,
      tokenLimit: this.opts.tokenLimit,
      timeoutMs: this.opts.timeoutMs,
      useCache: this.opts.useCache,
      signal: this.opts.signal,
      checkpointer,
    });
  }

  private threadId(batchIndex: number): string {
    return `${this.opts.runId}-batch-${batchIndex}`;
  }

  /**
   * 启动一个新批次的流水线执行
   */
  async startBatch(batch: BatchInput): Promise<RunOutcome> {
    const graph = this.compileGraph();
    const tid = this.threadId(batch.batchIndex);

    const input = {
      projectId: batch.inputState.projectId,
      runId: batch.inputState.runId,
      mode: batch.inputState.mode,
      requirementIds: batch.inputState.requirementIds,
      currentBatch: batch.inputState.currentBatch,
      batchContext: batch.inputState.batchContext,
      projectContext: batch.inputState.projectContext,
      businessFlowBlueprints: batch.inputState.businessFlowBlueprints,
      selectedFlowIds: batch.inputState.selectedFlowIds,
      analystMode: batch.inputState.analystMode || 'STAGE_1_REQUIREMENT',
      phase: batch.inputState.phase,
      errors: batch.inputState.errors,
      environmentReady: false,
      initializationLogs: [],
      tokenBudget: { estimated: 0, limit: null },
      globalBlueprint: batch.inputState.globalBlueprint,
      skillCalls: [],
      humanReviewFeedback: '',
    };

    const log = Log.for('session');
    log.info(`Starting batch ${batch.batchIndex} (threadId=${tid})`);
    clearQueryCache();

    return this.streamToOutcome(graph, input, tid, batch.batchIndex);
  }

  /**
   * 从 checkpoint 恢复执行
   */
  async resumeAt(
    threadId: string,
    resumeInput: { action: 'approve' | 'retry'; feedback?: string; edits?: any },
  ): Promise<RunOutcome> {
    const graph = this.compileGraph();

    const resumeCommand = new Command({
      resume: {
        action: resumeInput.action,
        feedback: resumeInput.feedback,
        blueprint: resumeInput.edits?.blueprint,
        conditions: resumeInput.edits?.conditions,
        cases: resumeInput.edits?.cases,
        analysis: resumeInput.edits?.analysis,
        matrix: resumeInput.edits?.matrix,
        forceRedesign: resumeInput.edits?.forceRedesign ?? false,
        retry: resumeInput.action === 'retry',
      },
    });

    Log.for('session').info(`Resuming threadId=${threadId}, action=${resumeInput.action}`);

    return this.streamToOutcome(graph, resumeCommand, threadId, 0);
  }

  /**
   * 从失败的节点重试：利用 LangGraph checkpointer 保存的状态，
   * 传入 null 作为 input，LangGraph 会自动从最后一个 checkpoint 恢复并重新执行失败节点。
   */
  async retryFromLastCheckpoint(threadId: string, batchIndex: number): Promise<RunOutcome> {
    const graph = this.compileGraph();
    Log.for('session').info(`Retrying from last checkpoint (threadId=${threadId}, batch=${batchIndex})`);
    return this.streamToOutcome(graph, null, threadId, batchIndex);
  }

  private async streamToOutcome(
    graph: ReturnType<typeof this.compileGraph>,
    input: Record<string, unknown> | Command | null,
    tid: string,
    batchIndex: number,
  ): Promise<RunOutcome> {
    const streamOpts = {
      configurable: { thread_id: tid },
      streamMode: 'values' as const,
    };

    const log = Log.for('session');
    log.info(`Streaming graph (threadId=${tid}, batch=${batchIndex})`);

    // retryFromLastCheckpoint 传入 null，LangGraph 从最后一个 checkpoint 恢复
    const stream = input === null
      ? await (graph as any).stream(null, streamOpts)
      : await (graph as any).stream(input, streamOpts);

    let lastState: any = null;
    let prevPhase: string | undefined;
    let interruptPayload: Record<string, unknown> | null = null;
    let nodeCount = 0;

    for await (const chunk of stream) {
      if (this.isAborted()) {
        log.info(`Aborted during streaming (threadId=${tid})`);
        break;
      }
      lastState = chunk;
      nodeCount++;

      const currentPhase = (chunk as any)?.phase as string | undefined;
      if (currentPhase && currentPhase !== prevPhase) {
        log.info(`Phase transition → ${currentPhase}`);
        prevPhase = currentPhase;
      }

      const interruptValue = (chunk as any)?.__interrupt__;
      if (interruptValue && Array.isArray(interruptValue) && interruptValue.length > 0) {
        const raw = interruptValue[0] as Record<string, unknown>;
        interruptPayload = (raw?.value as Record<string, unknown>) ?? raw;
        log.info(`INTERRUPTED at phase=${lastState?.phase}, checkpoint=${(interruptPayload as any).checkpointNumber ?? '?'}`);
        break;
      }
    }

    log.info(`Stream complete: ${nodeCount} steps, threadId=${tid}`);

    if (interruptPayload) {
      const cpNum = (interruptPayload as any).checkpointNumber ?? 0;
      return {
        type: 'interrupt',
        interrupt: {
          threadId: tid,
          phase: (interruptPayload as any).phase ?? lastState?.phase ?? 'unknown',
          checkpointNumber: cpNum,
          payload: interruptPayload,
        },
      };
    }

    // In 'values' mode, lastState is the full state snapshot
    const cases = lastState?.finalTestCases ?? [];
    log.success(`Batch ${batchIndex} complete ── ${cases.length} final test cases`);
    return {
      type: 'complete',
      result: {
        batchIndex,
        cases,
        tokenUsage: { input: 0, output: 0, total: 0 },
        lastState: lastState ?? {},
      },
    };
  }
}