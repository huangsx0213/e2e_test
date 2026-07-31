import { Command } from '@langchain/langgraph';
import { buildTestGenGraph } from './graph/graph.ts';
import { checkpointer } from './graph/checkpointer.ts';
import type { AIProvider } from './infra/provider.ts';
import type { AgentObserver } from './graph/nodes/types.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import type { TestGenState, GlobalEpicEntry, CrossEpicDependency, PreviousBatchCoverageSummary } from './graph/state.ts';
import { clearQueryCache } from './graph/skills/data-skills.ts';
import { Log } from '../../shared/services/logger.ts';

export interface BatchInput {
  batchIndex: number;
  inputState: {
    projectId: string;
    runId: string;
    mode: 'auto' | 'interactive';
    requirementIds: string[];
    epic?: { id: string; title: string; description: string };
    analystInput?: Record<string, unknown>;
    currentBatch: any[];
    batchContext: { currentBatch: number; totalBatches: number; processedCount: number };
    projectContext: { name: string; pages: { name: string }[]; endpoints: { name: string; method: string }[] };
    businessFlowBlueprints: any[] | undefined;
    selectedFlowIds: string[];
    generationMode: 'component' | 'flow' | 'mixed';
    globalStats?: { totalRequirements: number; totalEpics: number; totalFlows: number };
    // L1/L2 字段
    globalEpicIndex?: GlobalEpicEntry[];
    crossEpicDependencies?: CrossEpicDependency[];
    previousBatchCoverageSummary?: PreviousBatchCoverageSummary[];
    relevantFlowBlueprints?: any[];
    flowReferencedComponentContext?: Record<string, any[]>;
    phase: TestGenState['phase'];
    errors: any[];
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
  async startBatch(batch: BatchInput, threadIdOverride?: string): Promise<RunOutcome> {
    const graph = this.compileGraph();
    const tid = threadIdOverride ?? this.threadId(batch.batchIndex);

    const input = {
      projectId: batch.inputState.projectId,
      runId: batch.inputState.runId,
      mode: batch.inputState.mode,
      requirementIds: batch.inputState.requirementIds,
      epic: batch.inputState.epic,
      analystInput: batch.inputState.analystInput,
      currentBatch: batch.inputState.currentBatch,
      batchContext: batch.inputState.batchContext,
      projectContext: batch.inputState.projectContext,
      businessFlowBlueprints: batch.inputState.businessFlowBlueprints,
      selectedFlowIds: batch.inputState.selectedFlowIds,
      generationMode: batch.inputState.generationMode ?? 'component',
      globalStats: batch.inputState.globalStats,
      // L1/L2 透传：crossEpicDependencies 与 relevantFlowBlueprints 由 preparation 节点写入
      globalEpicIndex: batch.inputState.globalEpicIndex,
      previousBatchCoverageSummary: batch.inputState.previousBatchCoverageSummary,
      phase: batch.inputState.phase,
      errors: batch.inputState.errors,
      environmentReady: false,
      initializationLogs: [],
      tokenBudget: { estimated: 0, limit: null },
      skillCalls: [],
      humanReviewFeedback: '',
      designerRetryCount: 0,
      preservedCases: undefined,
      allApprovedConditions: undefined,
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
        conditions: resumeInput.edits?.conditions,
        cases: resumeInput.edits?.cases,
        analysis: resumeInput.edits?.analysis,
        matrix: resumeInput.edits?.matrix,
        retry: resumeInput.action === 'retry',
      },
    });

    Log.for('session').info(`Resuming threadId=${threadId}, action=${resumeInput.action}`);

    return this.streamToOutcome(graph, resumeCommand, threadId, 0);
  }

  /**
   * 从失败的节点重试：利用 LangGraph checkpointer 保存的状态，
   * 传入 null 作为 input，LangGraph 会自动从最后一个 checkpoint 恢复并重新执行失败节点。
   *
   * 关键机制：当 analyst/designer/quality 节点 throw 时，LangGraph 不会为该节点
   * 保存 checkpoint。最后一个 checkpoint 来自前一个成功完成的节点。因此
   * stream(null, ...) 会从失败的那个节点重新开始执行 —— 这正是我们想要的。
   */
  async retryFromLastCheckpoint(threadId: string, batchIndex: number): Promise<RunOutcome> {
    const graph = this.compileGraph();
    const log = Log.for('session');

    // Log checkpoint state for diagnostics
    try {
      const snapshot = await (graph as any).getState({ configurable: { thread_id: threadId } });
      const next = snapshot?.next ?? [];
      const valueKeys = snapshot?.values ? Object.keys(snapshot.values) : [];
      log.info(`Checkpoint state: next=[${next.join(',')}], values_keys=[${valueKeys.slice(0, 10).join(',')}${valueKeys.length > 10 ? '...' : ''}]`);
      if (next.length === 0) {
        log.warn('Checkpoint has no pending nodes (next=[]) — graph may have completed or crashed before any node ran');
      } else if (next.length === 1 && next[0] === '__start__') {
        log.warn('Checkpoint is at __start__ — no real node has executed yet, stream(null) will fail');
      } else {
        log.info(`Will resume from node: ${next.join(', ')}`);
      }
    } catch (snapshotErr: any) {
      log.warn(`Failed to read checkpoint state: ${snapshotErr.message}`);
    }

    log.info(`Retrying from last checkpoint (threadId=${threadId}, batch=${batchIndex})`);
    return this.streamToOutcome(graph, null, threadId, batchIndex);
  }

  /**
   * 从 agent logs 恢复已成功 agent 的状态，然后从失败的 agent 继续执行。
   *
   * 当 checkpoint 恢复失败时（thread_id 丢失、__start__ 状态、checkpointer 数据
   * 损坏等），用此方法避免从头开始。从数据库 agent logs 中查出当前 batch 已
   * 成功完成的 agent 输出，用 `graph.updateState(values, asNode)` 写入一个新
   * 的 checkpoint，然后 `stream(null)` 从该 checkpoint 恢复 —— 即从失败的
   * agent 重新开始，而不是从 preparation 重新开始。
   *
   * `asNode` 让 LangGraph 认为最后成功的 agent "刚执行完"，根据 graph 路由
   * 计算出正确的 `next` 节点（例如 asNode='analyst' → next='checkpoint_1'
   * → auto-approve → designer）。
   *
   * @param threadId       新的 thread_id（避免 stale checkpoint）
   * @param batchIndex     当前 batch 索引
   * @param baseInput      preparation 节点的输入 state（来自 rebuildBatchInputForRetry）
   * @param completedAgentOutputs 已成功 agent 的输出，按执行顺序排列
   */
  async retryFromAgentLogs(
    threadId: string,
    batchIndex: number,
    baseInput: Record<string, unknown>,
    completedAgentOutputs: { agentName: string; outputData: Record<string, unknown> }[],
  ): Promise<RunOutcome> {
    const graph = this.compileGraph();
    const log = Log.for('session');
    const config = { configurable: { thread_id: threadId } };

    // agent_name → graph node name
    const agentToNode: Record<string, string> = {
      test_analyst: 'analyst',
      test_designer: 'designer',
      quality_manager: 'quality',
    };

    // 合并 baseInput（模拟 preparation 的输出）+ 所有已成功 agent 的输出。
    // baseInput 包含 preparation 需要的所有输入字段；environmentReady/tokenBudget
    // 等是 preparation 节点的输出字段，设为默认值即可（retry 场景下不再需要
    // token 估算）。
    const mergedState: Record<string, unknown> = {
      ...baseInput,
      environmentReady: true,
      initializationLogs: [],
      tokenBudget: { estimated: 0, limit: null },
      phase: 'analysis',
    };

    let lastNode = 'preparation';
    for (const { agentName, outputData } of completedAgentOutputs) {
      const nodeName = agentToNode[agentName];
      if (!nodeName) continue;
      Object.assign(mergedState, outputData);
      lastNode = nodeName;
    }

    // 用 asNode=lastNode 写入合并后的 state。LangGraph 会认为 lastNode 刚
    // 执行完，根据 graph 边路由计算 next（例如 analyst→checkpoint_1,
    // designer→checkpoint_2）。然后 stream(null) 从 next 开始执行。
    await (graph as any).updateState(config, mergedState, lastNode);
    log.info(`Restored state from ${completedAgentOutputs.length} agent(s) [${completedAgentOutputs.map(a => a.agentName).join(', ')}], asNode=${lastNode}, resuming from next node`);

    // 诊断：打印恢复后的 checkpoint state
    try {
      const snapshot = await (graph as any).getState(config);
      const next = snapshot?.next ?? [];
      log.info(`Checkpoint after restore: next=[${next.join(',')}], will resume from there`);
    } catch (e: any) {
      log.warn(`Failed to read post-restore checkpoint state: ${e.message}`);
    }

    return this.streamToOutcome(graph, null, threadId, batchIndex);
  }

  /**
   * 检查指定 thread_id 是否存在可恢复的 checkpoint。
   *
   * LangGraph 在调用 stream(input, ...) 时会立即在 __start__ 创建一个初始 checkpoint
   *（包含 input values）。如果第一个真实节点（如 preparation）还没执行完就崩溃，
   * 这个 __start__ checkpoint 的 next 仍然是 ['__start__']，此时用 stream(null, ...)
   * 恢复会抛出 "Received no input writes for '__start__'"。
   *
   * 只有当 next 指向一个真实节点（如 'analyst'、'designer'）时，才代表有有意义的
   * checkpoint 可以恢复。
   */
  async hasCheckpoint(threadId: string): Promise<boolean> {
    const graph = this.compileGraph();
    try {
      const snapshot = await (graph as any).getState({ configurable: { thread_id: threadId } });
      if (!snapshot || !snapshot.values || Object.keys(snapshot.values).length === 0) return false;
      const next: string[] = snapshot.next ?? [];
      // __start__ means no real node has executed yet — can't resume with null input
      if (next.length === 0) return false;
      if (next.length === 1 && next[0] === '__start__') return false;
      return true;
    } catch {
      return false;
    }
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