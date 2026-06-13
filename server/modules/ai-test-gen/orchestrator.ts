import { randomId } from '../../shared/utils/index.ts';
import type { AIProvider } from './infra/provider.ts';
import { pipelineRepo } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { ContextBuilder, type RunContext, type StartParams } from './context.ts';
import { TestGenSession, type BatchInput, type BatchResult, type InterruptInfo } from './session.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';
import { groupRequirementsByEpic } from './helpers.ts';
import { deduplicateTestCases } from './helpers.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';
import { checkpointer } from './graph/checkpointer.ts';
import { buildTestGenGraph } from './graph/graph.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import { db } from '../../shared/db/client.ts';

function createDummyProvider(): AIProvider {
  return {
    chat: async () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 } }),
    streamChat: async function* () { /* noop */ },
  };
}

export class Orchestrator {
  private readonly contextBuilder: ContextBuilder;
  private readonly abortedRuns = new Set<string>();

  constructor(private readonly sseGateway: SSEGateway) {
    this.contextBuilder = new ContextBuilder(sseGateway);
  }

  abort(runId: string): void {
    this.abortedRuns.add(runId);
    this.contextBuilder.abort(runId);
    pipelineRepo.markRunFailed(runId);
  }

  delete(runId: string): void {
    this.abortedRuns.add(runId);
    this.contextBuilder.delete(runId);
    pipelineRepo.deleteRun(runId);
    this.sseGateway.cleanup(runId);
  }

  async start(runId: string, projectId: string, params: StartParams): Promise<void> {
    console.log('══════════════════════════════════════════════');
    console.log(`[orchestrator] PIPELINE START`);
    console.log(`  runId         = ${runId}`);
    console.log(`  projectId     = ${projectId}`);
    console.log(`  mode          = ${params.mode}`);
    console.log(`  provider      = ${params.providerConfigName ?? 'default'}`);
    console.log(`  model         = ${params.model ?? 'default'}`);
    console.log(`  useCache      = ${params.useCache ?? false}`);
    console.log(`  requirements  = ${params.requirementIds?.length ?? 0} selected`);
    console.log(`  flows         = ${params.flowIds?.length ?? 0} selected (includeFlowCases: ${params.includeFlowCases ?? false})`);
    console.log('══════════════════════════════════════════════');
    let ctx: RunContext | null = null;
    let keepSse = false;

    try {
      ctx = await this.contextBuilder.build(runId, projectId, params.mode, {
        providerConfigName: params.providerConfigName,
        model: params.model,
        useCache: params.useCache,
      });
      console.log(`[orchestrator] Context built: model=${ctx.modelName}, tokenLimit=${ctx.tokenLimit}`);

      // 构建需求索引和批次
      const allIndex = buildRequirementIndex(projectId);
      const selectedIds = new Set(params.requirementIds || []);
      const { epics, rootGroups, totalBatches, selectedIndex } = groupRequirementsByEpic(allIndex, selectedIds);
      if (epics.length === 0) throw new Error('No matching requirements found for selected IDs');
      console.log(`[orchestrator] Requirements indexed: ${selectedIndex.length} selected, ${epics.length} epics, ${totalBatches} batch(es)`);
      pipelineRepo.updateBatchCount(runId, totalBatches);
      pipelineRepo.updateModelInfo(runId, ctx.modelName, params.providerConfigName ?? null);

      const requirements = requirementRepo.listByProject(projectId);
      const allProjectFlows = businessFlowRepo.listByProject(projectId);
      const selectedFlowSet = new Set(params.flowIds || []);
      const filteredFlows = selectedFlowSet.size > 0
        ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
        : allProjectFlows;
      const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });
      console.log(`[orchestrator] Business flows: ${allProjectFlows.length} total, ${filteredFlows.length} selected, ${businessFlows.length} blueprints built`);

      // 发送准备阶段事件
      ctx.sendEvent('phase:start', { phase: 'preparation', message: `Processing ${selectedIndex.length} requirements in ${totalBatches} batch(es)` });
      ctx.sendEvent('pipeline:context', { flows: businessFlows.length, indexEntries: selectedIndex.length });

      const avgTokensPerReq = 1000;
      const estimated = selectedIndex.length * avgTokensPerReq;
      ctx.sendEvent('pipeline:budget', {
        estimated, limit: ctx.tokenLimit,
        message: ctx.tokenLimit && estimated > ctx.tokenLimit
          ? `Estimated token usage (${estimated}) exceeds limit (${ctx.tokenLimit}).`
          : `Estimated token usage (${estimated}) within limit.`,
      });

      // 记录 preparation 日志
      const preparationLogId = randomId('log');
      const preparationOutput = {
        requirementCount: selectedIndex.length,
        totalBatches,
        estimatedTokens: estimated,
        flowCases: businessFlows.length,
      };
      db.prepare(`
        INSERT INTO test_gen_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
        VALUES (?, ?, 0, 'preparation', '', NULL, ?, NULL, 0, NULL, 'COMPLETED')
      `).run(preparationLogId, runId, JSON.stringify(preparationOutput));

      // 执行批次
      const allResults: BatchResult[] = [];
      for (let i = 0; i < epics.length; i++) {
        if (ctx.isAborted()) break;
        const epic = epics[i];
        console.log(`[orchestrator] === Batch ${i + 1}/${epics.length} START (epic: ${epic.id ?? 'N/A'}) ===`);
        ctx.scope.setBatch(i + 1, totalBatches);
        pipelineRepo.updateCurrentBatch(runId, i + 1);
        pipelineRepo.updateThreadId(runId, `${runId}-batch-${i}`);

        const batchInput: BatchInput = {
          batchIndex: i,
          inputState: this.buildBatchInputState(
            projectId, params.requirementIds, requirements, rootGroups, epic, i, totalBatches, businessFlows,
            params.mode, params.includeFlowCases, params.flowIds,
          ),
        };

        const outcome = await ctx.session.startBatch(batchInput);
        if (outcome.type === 'interrupt') {
          console.log(`[orchestrator] Batch ${i + 1} INTERRUPTED at phase=${outcome.interrupt.phase}, checkpoint=${outcome.interrupt.checkpointNumber}`);
          ctx.scope.flushAndPersistThinking();
          pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
          this.sseGateway.emit(runId, 'checkpoint:waiting', {
            checkpointNumber: outcome.interrupt.checkpointNumber,
            phase: outcome.interrupt.phase,
            summary: 'Awaiting Review',
            payload: outcome.interrupt.payload,
          });
          keepSse = true;
          return;
        }
        console.log(`[orchestrator] === Batch ${i + 1}/${epics.length} COMPLETE, ${outcome.result.cases.length} test cases ===`);
        allResults.push(outcome.result);
        ctx.sendEvent('batch:complete', {
          batch: i + 1, total: totalBatches,
          testCases: outcome.result.cases.length,
        });
      }

      // 完成
      if (!ctx.isAborted()) {
        const { allCases, removedCount } = deduplicateTestCases(
          allResults.flatMap(r => r.lastState?.finalTestCases || r.cases || []),
        );
        console.log(`[orchestrator] ALL BATCHES DONE: ${allCases.length} final cases${removedCount > 0 ? ` (${removedCount} duplicates removed)` : ''}`);
        if (removedCount > 0) {
          ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length });
        }
        ctx.scope.markComplete({ totalCases: allCases.length, totalBatches: epics.length });
      }
    } catch (err: any) {
      if (ctx) {
        if (!ctx.isAborted()) ctx.scope.markFailed(err.message);
      } else {
        this.sseGateway.emit(runId, 'pipeline:error', {
          phase: 'orchestrator', message: err.message, recoverable: false,
        });
      }
    } finally {
      if (ctx) {
        ctx.releaseSlot();
        if (!keepSse) this.sseGateway.cleanup(runId);
      }
    }
  }

  async resume(runId: string, action: 'approve' | 'retry', feedback?: string, editedData?: any): Promise<void> {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row || row.status !== 'WAITING_REVIEW') {
      throw new Error('Test gen is not waiting for review');
    }

    const cpNum = CHECKPOINT_BY_PHASE[row.phase] ?? 0;

    pipelineRepo.insertAuditLog(runId, `checkpoint_${cpNum}`, action, editedData ?? null);
    pipelineRepo.setRunRunning(runId);

    if (cpNum > 0) {
      this.sseGateway.emit(runId, 'checkpoint:resolved', { checkpointNumber: cpNum, action });
    }

    const config = row.config || {};
    let ctx: RunContext | null = null;
    let keepSse = false;

    try {
      ctx = await this.contextBuilder.build(runId, row.project_id, (row.mode || 'auto') as 'auto' | 'interactive', {
        providerConfigName: config.providerConfigName,
        model: config.model,
        useCache: config.useCache,
        currentBatch: row.current_batch || 0,
      });

      const outcome = await ctx.session.resumeAt(row.thread_id, {
        action,
        feedback,
        edits: editedData,
      });

      if (outcome.type === 'interrupt') {
        ctx.scope.flushAndPersistThinking();
        pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);
        pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
        this.sseGateway.emit(runId, 'checkpoint:waiting', {
          checkpointNumber: outcome.interrupt.checkpointNumber,
          phase: outcome.interrupt.phase,
          summary: 'Awaiting Review',
          payload: outcome.interrupt.payload,
        });
        keepSse = true;
        return;
      }

      // 继续剩余批次
      const allResults: BatchResult[] = [outcome.result];
      const totalBatches = row.total_batches || 0;
      const currentBatch = row.current_batch || 0;
      if (currentBatch < totalBatches) {
        const remaining = await this.continueRemainingBatches(runId, row.project_id, config, ctx);
        if (remaining.interrupted) { keepSse = true; return; }
        allResults.push(...remaining.allResults);
      }

      const { allCases, removedCount } = deduplicateTestCases(
        allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []),
      );
      if (removedCount > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length });
      }
      ctx.scope.markComplete({ totalCases: allCases.length, totalBatches: totalBatches || 1 });
    } catch (err: any) {
      if (ctx) {
        if (!ctx.isAborted()) ctx.scope.markFailed(err.message);
      } else {
        this.sseGateway.emit(runId, 'pipeline:error', {
          phase: 'resume', message: err.message, recoverable: false,
        });
      }
    } finally {
      if (ctx) {
        ctx.releaseSlot();
        if (!keepSse) this.sseGateway.cleanup(runId);
      }
    }
  }

  /**
   * 从失败的 agent 重试：利用 LangGraph checkpointer 保存的状态，
   * 从最后一个成功的 checkpoint 重新执行失败的节点。
   */
  async retry(runId: string): Promise<void> {
    const row = pipelineRepo.getFailedRun(runId);
    if (!row) {
      throw new Error('Test gen run is not in FAILED status');
    }

    const threadId = row.thread_id;
    if (!threadId) {
      throw new Error('No thread_id found for failed run, cannot retry');
    }

    pipelineRepo.setRunRunning(runId);
    this.sseGateway.emit(runId, 'pipeline:retry', {
      phase: row.phase,
      message: `Retrying from last checkpoint (phase: ${row.phase})`,
    });

    const config = row.config ? (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) : {};
    let ctx: RunContext | null = null;
    let keepSse = false;

    try {
      ctx = await this.contextBuilder.build(runId, row.project_id, (row.mode || 'auto') as 'auto' | 'interactive', {
        providerConfigName: config.providerConfigName,
        model: config.model,
        useCache: config.useCache,
        currentBatch: row.current_batch || 0,
      });

      ctx.scope.restoreBatchState(row.current_batch || 0);
      const batchIndex = (row.current_batch || 1) - 1;

      const outcome = await ctx.session.retryFromLastCheckpoint(threadId, batchIndex);

      if (outcome.type === 'interrupt') {
        ctx.scope.flushAndPersistThinking();
        pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);
        pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
        this.sseGateway.emit(runId, 'checkpoint:waiting', {
          checkpointNumber: outcome.interrupt.checkpointNumber,
          phase: outcome.interrupt.phase,
          summary: 'Awaiting Review',
          payload: outcome.interrupt.payload,
        });
        keepSse = true;
        return;
      }

      // 继续剩余批次
      const allResults: BatchResult[] = [outcome.result];
      const totalBatches = row.total_batches || 0;
      const currentBatch = row.current_batch || 0;
      if (currentBatch < totalBatches) {
        const remaining = await this.continueRemainingBatches(runId, row.project_id, config, ctx);
        if (remaining.interrupted) { keepSse = true; return; }
        allResults.push(...remaining.allResults);
      }

      const { allCases, removedCount } = deduplicateTestCases(
        allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []),
      );
      if (removedCount > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length });
      }
      ctx.scope.markComplete({ totalCases: allCases.length, totalBatches: totalBatches || 1 });
    } catch (err: any) {
      if (ctx) {
        if (!ctx.isAborted()) ctx.scope.markFailed(err.message);
      } else {
        this.sseGateway.emit(runId, 'pipeline:error', {
          phase: 'retry', message: err.message, recoverable: true,
        });
      }
    } finally {
      if (ctx) {
        ctx.releaseSlot();
        if (!keepSse) this.sseGateway.cleanup(runId);
      }
    }
  }

  async getCheckpointState(runId: string): Promise<any> {
    const run = pipelineRepo.getRunWithThreadId(runId);
    if (!run?.thread_id) return null;

    pipelineRepo.touchRun(runId);

    const graph = buildTestGenGraph({ provider: createDummyProvider(), checkpointer });
    const snapshot = await graph.getState({ configurable: { thread_id: run.thread_id } });
    const state = snapshot?.values;
    if (!state) return null;

    switch (run.phase) {
      case 'review-conditions':
        return { checkpointData: { conditions: state.testConditions ?? [], analysis: state.requirementAnalysis ?? null } };
      case 'review-draft':
        return { checkpointData: { cases: state.draftTestCases ?? [] } };
      case 'final-review':
        return { checkpointData: { cases: state.finalTestCases ?? [], matrix: state.coverageMatrix ?? null } };
      default:
        return null;
    }
  }

  async saveCheckpointEdits(runId: string, editedData: Record<string, unknown>, checkpointNumber: number): Promise<void> {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row?.thread_id) {
      console.error(`[Orchestrator] Run ${runId} missing or no thread_id`);
      return;
    }

    const AGENT_NAMES: Record<number, string> = { 1: 'test_analyst', 2: 'test_designer', 3: 'quality_manager' };
    const agentName = AGENT_NAMES[checkpointNumber];

    const stateKeys: Record<string, unknown> = {};
    if (checkpointNumber === 1) {
      if (editedData.conditions) stateKeys.testConditions = editedData.conditions;
      if (editedData.analysis) stateKeys.requirementAnalysis = editedData.analysis;
    } else if (checkpointNumber === 2) {
      if (editedData.cases) stateKeys.draftTestCases = editedData.cases;
    } else if (checkpointNumber === 3) {
      if (editedData.cases) stateKeys.finalTestCases = editedData.cases;
      if (editedData.matrix) stateKeys.coverageMatrix = editedData.matrix;
    }
    if (Object.keys(stateKeys).length === 0) return;

    const graph = buildTestGenGraph({ provider: createDummyProvider(), checkpointer });
    await graph.updateState({ configurable: { thread_id: row.thread_id } }, stateKeys);

    try {
      const updatedPayload = await this.getCheckpointState(runId);
      if (updatedPayload) {
        this.sseGateway.emit(runId, 'checkpoint:waiting', {
          checkpointNumber,
          type: row.phase,
          summary: 'Awaiting Review',
          payload: updatedPayload,
        });
      }
      if (agentName) pipelineRepo.updateAgentLogOutput(runId, agentName, stateKeys);
    } catch (err) {
      console.error(`[Orchestrator] Failed to refresh checkpoint state after edit for ${runId}:`, err);
    }
  }

  private async continueRemainingBatches(
    runId: string,
    projectId: string,
    config: any,
    ctx: RunContext,
  ): Promise<{ allResults: BatchResult[]; interrupted: boolean }> {
    const requirementIds: string[] = config.requirementIds || [];
    const flowIds: string[] = config.flowIds || [];
    const startFrom = ctx.scope.currentBatch;

    const allIndex = buildRequirementIndex(projectId);
    const selectedIds = new Set(requirementIds);
    const { epics, rootGroups, totalBatches } = groupRequirementsByEpic(allIndex, selectedIds);
    const requirements = requirementRepo.listByProject(projectId);
    const allProjectFlows = businessFlowRepo.listByProject(projectId);
    const selectedFlowSet = new Set(flowIds);
    const filteredFlows = selectedFlowSet.size > 0
      ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
      : allProjectFlows;
    const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });

    const remaining = epics
      .map((epic, i) => ({
        batchIndex: i,
        inputState: this.buildBatchInputState(projectId, requirementIds, requirements, rootGroups, epic, i, totalBatches, businessFlows, config.mode || 'auto', config.includeFlowCases, config.flowIds),
      }))
      .slice(startFrom);

    if (remaining.length === 0) return { allResults: [], interrupted: false };

    const allResults: BatchResult[] = [];
    for (const batch of remaining) {
      if (ctx.isAborted()) break;
      ctx.scope.setBatch(batch.batchIndex + 1, totalBatches);
      pipelineRepo.updateCurrentBatch(runId, batch.batchIndex + 1);
      pipelineRepo.updateThreadId(runId, `${runId}-batch-${batch.batchIndex}`);

      const outcome = await ctx.session.startBatch(batch);
      if (outcome.type === 'interrupt') {
        ctx.scope.flushAndPersistThinking();
        pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
        return { allResults, interrupted: true };
      }
      allResults.push(outcome.result);
      ctx.sendEvent('batch:complete', {
        batch: batch.batchIndex + 1, total: totalBatches,
        testCases: outcome.result.cases.length,
      });
    }
    return { allResults, interrupted: false };
  }

  private buildBatchInputState(
    projectId: string,
    requirementIds: string[],
    requirements: any[],
    rootGroups: Map<string, string[]>,
    epic: any,
    i: number,
    totalBatches: number,
    businessFlows: any[],
    mode: 'auto' | 'interactive' = 'auto',
    includeFlowCases = false,
    selectedFlowIds: string[] = [],
  ) {
    return {
      projectId,
      runId: '',
      mode,
      requirementIds,
      currentBatch: requirements
        .filter((r: any) => new Set(rootGroups.get(epic.id)!).has(r.id))
        .map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? '', parentId: r.parentId ?? '' })),
      batchContext: { currentBatch: i + 1, totalBatches, processedCount: i },
      projectContext: { name: epic.title, pages: [], endpoints: [] },
      businessFlowBlueprints: businessFlows,
      includeFlowCases,
      selectedFlowIds,
      phase: 'analysis' as const,
      errors: [],
    };
  }
}