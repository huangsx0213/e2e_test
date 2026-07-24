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
import type { GlobalRequirementEntry, PreviousBatchConditionSummary } from './graph/state.ts';
import { db } from '../../shared/db/client.ts';
import { Log } from '../../shared/services/logger.ts';

function createDummyProvider(): AIProvider {
  return {
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
    const log = Log.for('orchestrator');
    Log.banner('PIPELINE START');
    log.kv('runId', runId);
    log.kv('projectId', projectId);
    log.kv('mode', params.mode);
    log.kv('ai.provider', params.providerConfigName ?? 'default');
    log.kv('ai.model', params.model ?? 'default');
    log.kv('ai.reasoningEffort', params.reasoningEffort ?? 'default');
    log.kv('ai.reasoningSummary', params.reasoningSummary ?? 'default');
    log.kv('ai.textVerbosity', params.textVerbosity ?? 'default');
    log.kv('ai.cache', params.useCache ?? false ? 'on' : 'off');
    log.kv('requirements', `${params.requirementIds?.length ?? 0} selected`);
    log.kv('flows', `${params.flowIds?.length ?? 0} selected (includeFlowCases: ${params.includeFlowCases ?? false})`);
    Log.divider();
    let ctx: RunContext | null = null;
    let keepSse = false;

    try {
      ctx = await this.contextBuilder.build(runId, projectId, params.mode, {
        providerConfigName: params.providerConfigName,
        model: params.model,
        useCache: params.useCache,
        reasoningEffort: params.reasoningEffort,
        reasoningSummary: params.reasoningSummary,
        textVerbosity: params.textVerbosity,
      });
      const providerRow = params.providerConfigName
        ? pipelineRepo.getProviderConfigByName(params.providerConfigName)
        : pipelineRepo.getActiveProviderConfig();
      log.kv('context.model', ctx.modelName);
      log.kv('ai.apiVersion', providerRow?.api_version ?? 'default');
      log.kv('context.tokenLimit', ctx.tokenLimit ?? 'none', 0);

      // 构建需求索引和批次
      const allIndex = buildRequirementIndex(projectId);
      const selectedIds = new Set(params.requirementIds || []);
      const { epics, rootGroups, totalBatches, selectedIndex } = groupRequirementsByEpic(allIndex, selectedIds);
      if (epics.length === 0) throw new Error('No matching requirements found for selected IDs');
      log.info(`Requirements indexed: ${selectedIndex.length} selected, ${epics.length} epics, ${totalBatches} batch(es)`);
      pipelineRepo.updateBatchCount(runId, totalBatches);
      pipelineRepo.updateModelInfo(runId, ctx.modelName, params.providerConfigName ?? null);

      const requirements = requirementRepo.listByProject(projectId);
      const allProjectFlows = businessFlowRepo.listByProject(projectId);
      const selectedFlowSet = new Set(params.flowIds || []);
      const filteredFlows = selectedFlowSet.size > 0
        ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
        : allProjectFlows;
      const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });
      log.info(`Business flows: ${allProjectFlows.length} total, ${filteredFlows.length} selected, ${businessFlows.length} blueprints`);

      // ── 构建全局需求快照（所有批次共享，解决 Epic 信息孤岛问题）──
      const epicIdMap = new Map<string, string>(); // reqId → epicId
      for (const [epicId, childIds] of rootGroups) {
        for (const id of childIds) epicIdMap.set(id, epicId);
      }
      const globalRequirementIndex: GlobalRequirementEntry[] = requirements.map(r => ({
        id: r.id,
        title: r.title,
        level: r.level,
        parentId: r.parentId ?? null,
        epicId: epicIdMap.get(r.id) ?? null,
      }));
      const globalStats = {
        totalRequirements: requirements.length,
        totalEpics: epics.length,
        totalFlows: allProjectFlows.length,
      };
      log.info(`Global snapshot: ${globalRequirementIndex.length} requirements, ${globalStats.totalEpics} epics, ${globalStats.totalFlows} flows`);

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

      // 执行批次（累积 previousBatchConditions 给后续批次使用）
      const allResults: BatchResult[] = [];
      const accumulatedConditions: PreviousBatchConditionSummary[] = [];

      // 如果指定了参考的其他 Runs，则从其历史中提取已生成的 test conditions，避免生成重复用例
      if (params.referenceRunIds && params.referenceRunIds.length > 0) {
        for (const refId of params.referenceRunIds) {
          try {
            const refLogs = pipelineRepo.getAgentLogs(refId, 'test_analyst');
            for (const refLog of refLogs) {
              const batchConditions: any[] = refLog.output_data?.testConditions ?? [];
              for (const tc of batchConditions) {
                if (tc.id && tc.condition && tc.requirementId) {
                  accumulatedConditions.push({
                    id: tc.id,
                    condition: tc.condition,
                    requirementId: tc.requirementId,
                    category: tc.category ?? 'functional',
                    primaryTechnique: tc.primaryTechnique ?? 'Unknown',
                  });
                }
              }
            }
            log.info(`Loaded conditions from reference run ${refId}`);
          } catch (e) {
            log.error(`Failed to load reference conditions from run ${refId}: ${e}`);
          }
        }
        log.info(`Total accumulated reference conditions: ${accumulatedConditions.length}`);
      }

      for (let i = 0; i < epics.length; i++) {
        if (ctx.isAborted()) break;
        const epic = epics[i];
        Log.subsection(`Batch ${i + 1}/${epics.length} START ── epic: ${epic.id ?? 'N/A'}`);
        ctx.scope.setBatch(i + 1, totalBatches);
        pipelineRepo.updateCurrentBatch(runId, i + 1);
        pipelineRepo.updateThreadId(runId, `${runId}-batch-${i}`);

        const batchInput: BatchInput = {
          batchIndex: i,
          inputState: {
            ...this.buildBatchInputState(
              projectId, params.requirementIds, requirements, rootGroups, epic, i, totalBatches, businessFlows,
              params.mode, params.includeFlowCases, params.flowIds,
            ),
            // 注入全局上下文
            globalRequirementIndex,
            globalStats,
            // 注入已完成批次的 test conditions（防止重复生成）
            previousBatchConditions: accumulatedConditions.length > 0 ? [...accumulatedConditions] : undefined,
          },
        };

        const outcome = await ctx.session.startBatch(batchInput);
        if (outcome.type === 'interrupt') {
          log.info(`Batch ${i + 1} INTERRUPTED at phase=${outcome.interrupt.phase}, checkpoint=${outcome.interrupt.checkpointNumber}`);
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

        // 累积本批次已生成的 conditions，供后续批次参考
        const batchConditions: any[] = outcome.result.lastState?.testConditions ?? [];
        for (const tc of batchConditions) {
          accumulatedConditions.push({
            id: tc.id,
            condition: tc.condition,
            requirementId: tc.requirementId,
            category: tc.category,
            primaryTechnique: tc.primaryTechnique,
          });
        }
        log.success(`Batch ${i + 1}/${epics.length} complete ── ${outcome.result.cases.length} test cases, ${batchConditions.length} conditions accumulated`);
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
        log.success(`All batches done ── ${allCases.length} final cases${removedCount > 0 ? ` (${removedCount} duplicates removed)` : ''}`);
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
        reasoningEffort: config.reasoningEffort,
        reasoningSummary: config.reasoningSummary,
        textVerbosity: config.textVerbosity,
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
        reasoningEffort: config.reasoningEffort,
        reasoningSummary: config.reasoningSummary,
        textVerbosity: config.textVerbosity,
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
      Log.for('orchestrator').error(`Run ${runId} missing or no thread_id`);
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
      Log.for('orchestrator').error(`Failed to refresh checkpoint state after edit for ${runId}: ${err}`);
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

    // Rebuild global context
    const epicIdMap = new Map<string, string>();
    for (const [epicId, childIds] of rootGroups) {
      for (const id of childIds) epicIdMap.set(id, epicId);
    }
    const globalRequirementIndex: GlobalRequirementEntry[] = requirements.map(r => ({
      id: r.id,
      title: r.title,
      level: r.level,
      parentId: r.parentId ?? null,
      epicId: epicIdMap.get(r.id) ?? null,
    }));
    const globalStats = {
      totalRequirements: requirements.length,
      totalEpics: epics.length,
      totalFlows: allProjectFlows.length,
    };

    const remainingEpics = epics.slice(startFrom);
    if (remainingEpics.length === 0) return { allResults: [], interrupted: false };

    const allResults: BatchResult[] = [];
    const accumulatedConditions: PreviousBatchConditionSummary[] = [];

    // Optionally: could load past batches' conditions here, but keeping it simple for now
    // and accumulating from the resume point onwards.

    for (let i = 0; i < remainingEpics.length; i++) {
      if (ctx.isAborted()) break;
      const actualBatchIndex = startFrom + i;
      const epic = remainingEpics[i];

      ctx.scope.setBatch(actualBatchIndex + 1, totalBatches);
      pipelineRepo.updateCurrentBatch(runId, actualBatchIndex + 1);
      pipelineRepo.updateThreadId(runId, `${runId}-batch-${actualBatchIndex}`);

      const batchInput = {
        batchIndex: actualBatchIndex,
        inputState: {
          ...this.buildBatchInputState(projectId, requirementIds, requirements, rootGroups, epic, actualBatchIndex, totalBatches, businessFlows, config.mode || 'auto', config.includeFlowCases, config.flowIds),
          globalRequirementIndex,
          globalStats,
          previousBatchConditions: accumulatedConditions.length > 0 ? [...accumulatedConditions] : undefined,
        },
      };

      const outcome = await ctx.session.startBatch(batchInput);
      if (outcome.type === 'interrupt') {
        ctx.scope.flushAndPersistThinking();
        pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
        return { allResults, interrupted: true };
      }

      // 累积本批次 conditions
      const batchConditions: any[] = outcome.result.lastState?.testConditions ?? [];
      for (const tc of batchConditions) {
        accumulatedConditions.push({
          id: tc.id,
          condition: tc.condition,
          requirementId: tc.requirementId,
          category: tc.category,
          primaryTechnique: tc.primaryTechnique,
        });
      }

      allResults.push(outcome.result);
      ctx.sendEvent('batch:complete', {
        batch: actualBatchIndex + 1, total: totalBatches,
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