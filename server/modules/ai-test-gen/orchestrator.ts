import { createHash } from 'crypto';
import type { AIProvider } from './infra/provider.ts';
import { pipelineRepo } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { ContextBuilder, type RunContext, type StartParams } from './context.ts';
import { TestGenSession, type BatchInput, type BatchResult } from './session.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';
import { groupRequirementsByEpic } from './helpers.ts';
import { deduplicateTestCases } from './helpers.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';
import { checkpointer } from './graph/checkpointer.ts';
import { buildTestGenGraph } from './graph/graph.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import type { TestGenState } from './graph/state.ts';
import { buildArchitectSystemPrompt, buildArchitectUserMessage } from './graph/prompts.ts';
import { callLLMWithStructuredOutput } from './graph/nodes/utils.ts';
import { ANALYST_SKILLS } from './graph/skills/skills.ts';
import { createArchitectOutputProfile } from './graph/structured-output/architect.ts';
import type { GlobalTestBlueprint, ContextBoundary } from '../../../shared/contracts/index.ts';
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
    log.kv('ai.cleanStart', params.cleanStart ?? false ? 'yes' : 'no');
    log.kv('requirements', `${params.requirementIds?.length ?? 0} selected`);
    log.kv('flows', `${params.flowIds?.length ?? 0} selected`);
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
      const requirementsMap = new Map(requirements.map((r: any) => [r.id, r]));
      const allFlowBlueprints = buildBusinessFlowBlueprints({ flows: allProjectFlows, requirementsMap });
      const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows, requirementsMap });
      log.info(`Business flows: ${allProjectFlows.length} total, ${filteredFlows.length} selected, ${businessFlows.length} blueprints`);

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

      // Clean Start: 清空历史覆盖矩阵
      if (params.cleanStart) {
        log.info('Clean start requested — clearing persistent coverage');
        pipelineRepo.clearProjectCoverage(projectId);
        pipelineRepo.clearProjectArchitectCache(projectId);
      }

      // Global Blueprint: 执行 Architect 一次（不在 per-batch 循环内）
      // Pass ALL project data (not filtered) so Architect has full global vision
      // selectedEpicIds is computed from the epic grouping, not raw params.requirementIds
      const selectedEpicIds = epics.map((e: any) => e.id);
      Log.subsection('Global Blueprint ── Architect (once before batch loop)');
      const globalBlueprint = await this.ensureGlobalBlueprint(ctx, projectId, params, requirements, allProjectFlows, allFlowBlueprints, selectedEpicIds);

      // === 3-Stage Routing ===
      // Stage 1: Requirement batches (STAGE_1_REQUIREMENT)
      // Stage 2: Flow batches (STAGE_2_FLOW) — only when flows are selected
      // Stage 3: Error guessing batches (STAGE_3_ERROR_GUESSING)
      const allResults: BatchResult[] = [];
      let stageTotalBatches = totalBatches;

      const hasFlows = filteredFlows.length > 0;
      const flowCount = hasFlows ? 1 : 0;
      const finalTotalBatches = totalBatches + flowCount + 1; // +1 for error‑guessing

      // --- Stage 1: Requirement Analysis ---
      {
        ctx.sendEvent('phase:start', { phase: 'analysis', message: `Stage 1: Requirement analysis (${epics.length} batch(es))` });
        const reqBatches = epics.map((epic, i) => ({
          batchIndex: i,
          inputState: this.buildBatchInputState(
            projectId, params.requirementIds, requirements, rootGroups, epic, i, finalTotalBatches, businessFlows,
            params.mode, params.flowIds,
            'STAGE_1_REQUIREMENT', globalBlueprint,
          ),
        }));

        for (const batch of reqBatches) {
          if (ctx.isAborted()) break;
          Log.subsection(`[Stage 1] Batch ${batch.batchIndex + 1}/${reqBatches.length} ── req analysis`);
          const outcome = await this.runSingleBatch(ctx, runId, batch, finalTotalBatches, allResults);
          if (!outcome) { keepSse = true; return; }
        }
      }

      // --- Stage 2: Flow Integration (only if flows exist) ---
      if (!ctx.isAborted() && hasFlows) {
        const flowBatches = this.buildFlowBatches(
          projectId, params, filteredFlows, businessFlows, requirements,
          allResults.length, finalTotalBatches, globalBlueprint,
        );
        stageTotalBatches += flowBatches.length;
        pipelineRepo.updateBatchCount(runId, stageTotalBatches);

        ctx.sendEvent('phase:start', { phase: 'analysis', message: `Stage 2: Flow integration (${flowBatches.length} batch(es))` });
        for (const batch of flowBatches) {
          if (ctx.isAborted()) break;
          Log.subsection(`[Stage 2] Batch ${batch.batchIndex + 1}/${flowBatches.length} ── flow analysis`);
          const outcome = await this.runSingleBatch(ctx, runId, batch, finalTotalBatches, allResults);
          if (!outcome) { keepSse = true; return; }
        }
      }

      // --- Stage 3: Error Guessing ---
      if (!ctx.isAborted()) {
        const errorBatches = this.buildErrorGuessingBatches(
          projectId, params, requirements, businessFlows,
          allResults.length, finalTotalBatches, globalBlueprint,
        );
        stageTotalBatches += errorBatches.length;
        pipelineRepo.updateBatchCount(runId, stageTotalBatches);

        ctx.sendEvent('phase:start', { phase: 'analysis', message: `Stage 3: Error guessing (${errorBatches.length} batch(es))` });
        for (const batch of errorBatches) {
          if (ctx.isAborted()) break;
          Log.subsection(`[Stage 3] Batch ${batch.batchIndex + 1}/${errorBatches.length} ── error guessing`);
          const outcome = await this.runSingleBatch(ctx, runId, batch, finalTotalBatches, allResults);
          if (!outcome) { keepSse = true; return; }
        }
      }

      // 完成 — 合并所有阶段的结果
      if (!ctx.isAborted()) {
        const { allCases, removedCount } = deduplicateTestCases(
          allResults.flatMap(r => r.lastState?.finalTestCases || r.cases || []),
        );
        log.success(`All stages done ── ${allCases.length} final cases${removedCount > 0 ? ` (${removedCount} duplicates removed)` : ''}`);
        if (removedCount > 0) {
          ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length });
        }
        ctx.scope.markComplete({ totalCases: allCases.length, totalBatches: stageTotalBatches });
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

    if (cpNum >= 0) {
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

  async getCheckpointState(runId: string, batch?: number): Promise<any> {
    const run = pipelineRepo.getRunWithThreadId(runId);
    if (!run) return null;
    if (!run.thread_id && batch === undefined) return null;

    // Compute the correct thread_id for the requested batch.
    // When batch is provided (1-based), map to the 0-based batchIndex used in thread_id.
    // When batch is not provided, fall back to the DB's thread_id (last/interrupted batch).
    // For checkpoint_0 (architect / 'review-blueprint' phase), always use batch 0's thread
    // since the architect runs once globally before the batch loop.
    const isArchitectPhase = run.phase === 'review-blueprint';
    const effectiveBatch = isArchitectPhase ? 1 : batch;
    const threadId = effectiveBatch !== undefined
      ? `${runId}-batch-${effectiveBatch - 1}`
      : run.thread_id;
    if (!threadId) return null;

    pipelineRepo.touchRun(runId);

    const graph = buildTestGenGraph({ provider: createDummyProvider(), checkpointer });
    const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
    const state = snapshot?.values;
    if (!state) return null;

    switch (run.phase) {
      case 'review-blueprint':
        return { checkpointData: { blueprint: state.globalBlueprint ?? null } };
      case 'review-conditions':
        return { checkpointData: { conditions: state.testConditions ?? [], analysis: state.requirementAnalysis ?? null } };
      case 'review-draft':
        return { checkpointData: { cases: state.draftTestCases ?? [] } };
      case 'final-review':
        return { checkpointData: { cases: state.finalTestCases ?? [], matrix: state.coverageMatrix ?? null, validationWarnings: state.validationWarnings ?? [] } };
      default:
        return null;
    }
  }

  async saveCheckpointEdits(runId: string, editedData: Record<string, unknown>, checkpointNumber: number, batch?: number): Promise<void> {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row) {
      Log.for('orchestrator').error(`Run ${runId} not found`);
      return;
    }
    if (!row.thread_id && batch === undefined) {
      Log.for('orchestrator').error(`Run ${runId} missing or no thread_id`);
      return;
    }

    // Compute the correct thread_id for the requested batch.
    // When batch is provided (1-based), map to the 0-based batchIndex used in thread_id.
    // When batch is not provided, fall back to the DB's thread_id (last/interrupted batch).
    // For checkpoint_0 (architect), always use batch 0's thread since the architect
    // runs once globally before the batch loop (its agent log has batch=0).
    const isArchitectCheckpoint = checkpointNumber === 0;
    const effectiveBatch = isArchitectCheckpoint ? 1 : batch;
    const threadId = effectiveBatch !== undefined
      ? `${runId}-batch-${effectiveBatch - 1}`
      : row.thread_id;
    if (!threadId) {
      Log.for('orchestrator').error(`Run ${runId} could not determine thread_id`);
      return;
    }

    const AGENT_NAMES: Record<number, string> = { 0: 'test_architect', 1: 'test_analyst', 2: 'test_designer', 3: 'quality_manager' };
    const agentName = AGENT_NAMES[checkpointNumber];

    const stateKeys: Record<string, unknown> = {};
    if (checkpointNumber === 0) {
      if (editedData.blueprint) stateKeys.globalBlueprint = editedData.blueprint;
    } else if (checkpointNumber === 1) {
      if (editedData.conditions) stateKeys.testConditions = editedData.conditions;
      if (editedData.analysis) stateKeys.requirementAnalysis = editedData.analysis;
    } else if (checkpointNumber === 2) {
      if (editedData.cases) stateKeys.draftTestCases = editedData.cases;
    } else if (checkpointNumber === 3) {
      if (editedData.cases) stateKeys.finalTestCases = editedData.cases;
      if (editedData.matrix) stateKeys.coverageMatrix = editedData.matrix;
    }
    if (Object.keys(stateKeys).length === 0) return;

    const nodeNames = ['checkpoint_0', 'checkpoint_1', 'checkpoint_2', 'checkpoint_3'];
    const asNode = nodeNames[checkpointNumber] ?? undefined;

    const graph = buildTestGenGraph({ provider: createDummyProvider(), checkpointer });
    await graph.updateState({ configurable: { thread_id: threadId } }, stateKeys, asNode);

    try {
      const updatedPayload = await this.getCheckpointState(runId, batch);
      if (updatedPayload) {
        this.sseGateway.emit(runId, 'checkpoint:waiting', {
          checkpointNumber,
          type: row.phase,
          summary: 'Awaiting Review',
          payload: updatedPayload.checkpointData ?? updatedPayload,
        });
      }
      // For checkpoint_0 (architect), don't filter agent log by batch since
      // the architect runs before the batch loop (its log has batch=0).
      // Also, the architect's output_data IS the blueprint directly (not wrapped
      // in { globalBlueprint: ... }), so pass the edited blueprint directly
      // instead of stateKeys (which wraps it under globalBlueprint for the
      // LangGraph state update).
      const logBatch = isArchitectCheckpoint ? undefined : batch;
      const logOutputData = isArchitectCheckpoint && editedData.blueprint
        ? editedData.blueprint as Record<string, unknown>
        : stateKeys;
      if (agentName) pipelineRepo.updateAgentLogOutput(runId, agentName, logOutputData, logBatch);
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
    const requirementsMap = new Map(requirements.map((r: any) => [r.id, r]));
    const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows, requirementsMap });

    const globalBlueprint = pipelineRepo.getGlobalBlueprint(runId);

    const remaining = epics
      .map((epic, i) => ({
        batchIndex: i,
        inputState: this.buildBatchInputState(projectId, requirementIds, requirements, rootGroups, epic, i, totalBatches, businessFlows, config.mode || 'auto', config.flowIds, 'STAGE_1_REQUIREMENT', globalBlueprint),
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

  private async runSingleBatch(
    ctx: RunContext,
    runId: string,
    batch: BatchInput,
    totalBatches: number,
    allResults: BatchResult[],
  ): Promise<boolean> {
    const batchNum = batch.batchIndex + 1;
    ctx.scope.setBatch(batchNum, totalBatches);
    pipelineRepo.updateCurrentBatch(runId, batchNum);
    pipelineRepo.updateThreadId(runId, `${runId}-batch-${batch.batchIndex}`);

    const outcome = await ctx.session.startBatch(batch);
    if (outcome.type === 'interrupt') {
      const log = Log.for('orchestrator');
      log.info(`Batch ${batchNum} INTERRUPTED at phase=${outcome.interrupt.phase}, checkpoint=${outcome.interrupt.checkpointNumber}`);
      ctx.scope.flushAndPersistThinking();
      pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
      this.sseGateway.emit(runId, 'checkpoint:waiting', {
        checkpointNumber: outcome.interrupt.checkpointNumber,
        phase: outcome.interrupt.phase,
        summary: 'Awaiting Review',
        payload: outcome.interrupt.payload,
      });
      return false;
    }
    const log = Log.for('orchestrator');
    log.success(`Batch ${batchNum} complete ── ${outcome.result.cases.length} test cases`);
    allResults.push(outcome.result);
    ctx.sendEvent('batch:complete', {
      batch: batchNum, total: totalBatches,
      testCases: outcome.result.cases.length,
    });
    return true;
  }

  private buildFlowBatches(
    projectId: string,
    params: StartParams,
    filteredFlows: any[],
    businessFlows: any[],
    requirements: any[],
    startBatchIndex: number,
    finalTotalBatches: number,
    globalBlueprint?: GlobalTestBlueprint,
  ): BatchInput[] {
    if (filteredFlows.length === 0) return [];
    const mode = params.mode || 'auto';
    const currentBatch = filteredFlows.map(f => ({ id: f.id, title: f.name || f.id, level: 'flow', parentId: '' }));
    const flowNames = filteredFlows.map(f => f.name || f.id).join(', ');
    return [{
      batchIndex: startBatchIndex,
      inputState: {
        projectId,
        runId: '',
        mode,
        requirementIds: params.requirementIds || [],
        currentBatch,
        batchContext: { currentBatch: startBatchIndex + 1, totalBatches: finalTotalBatches, processedCount: startBatchIndex },
        projectContext: { name: `Flows: ${flowNames}`, pages: [], endpoints: [] },
        businessFlowBlueprints: businessFlows,
        selectedFlowIds: filteredFlows.map(f => f.id),
        selectionBoundary: { selectedEpicIds: params.requirementIds ?? [], selectedFlowIds: params.flowIds ?? [] },
        phase: 'analysis' as const,
        analystMode: 'STAGE_2_FLOW' as const,
        errors: [],
        globalBlueprint,
      },
    }];
  }

  private buildErrorGuessingBatches(
    projectId: string,
    params: StartParams,
    requirements: any[],
    businessFlows: any[],
    startBatchIndex: number,
    finalTotalBatches: number,
    globalBlueprint?: GlobalTestBlueprint,
  ): BatchInput[] {
    const mode: 'auto' | 'interactive' = params.mode || 'auto';
    const allReqs = requirements.map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? '', parentId: r.parentId ?? '' }));
    const batch: BatchInput = {
      batchIndex: startBatchIndex,
      inputState: {
        projectId,
        runId: '',
        mode,
        requirementIds: params.requirementIds || [],
        currentBatch: allReqs,
        batchContext: { currentBatch: startBatchIndex + 1, totalBatches: finalTotalBatches, processedCount: startBatchIndex },
        projectContext: { name: 'Error Guessing', pages: [], endpoints: [] },
        businessFlowBlueprints: businessFlows,
        selectedFlowIds: [],
        selectionBoundary: { selectedEpicIds: params.requirementIds ?? [], selectedFlowIds: params.flowIds ?? [] },
        phase: 'analysis' as const,
        analystMode: 'STAGE_3_ERROR_GUESSING' as const,
        errors: [],
        globalBlueprint,
      },
    };
    return [batch];
  }

  private computeRequirementHash(requirements: any[], allFlows: any[]): string {
    const sortedReqs = [...requirements]
      .map((r: any) => ({ id: r.id, title: r.title, description: r.description ?? '' }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    const sortedFlows = [...allFlows]
      .map((f: any) => ({ id: f.id, name: f.name, steps: f.steps ?? [] }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    const hashInput = { requirements: sortedReqs, flows: sortedFlows };
    return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
  }

  private async ensureGlobalBlueprint(
    ctx: RunContext,
    projectId: string,
    params: StartParams,
    allRequirements: any[],
    allProjectFlows: any[],
    allFlowBlueprints: any[],
    computedSelectedEpicIds?: string[],
  ): Promise<GlobalTestBlueprint | undefined> {
    const log = Log.for('orchestrator');
    const hash = this.computeRequirementHash(allRequirements, allProjectFlows);

    // 1. Check DB cache
    if (!params.forceArchitect) {
      const cached = pipelineRepo.getCachedBlueprint(projectId, hash);
      if (cached) {
        log.info(`Architect: cache HIT ── reusing cached blueprint (hash=${hash.slice(0, 12)}...)`);
        const normalized = this.normalizeGlobalBlueprint(cached, computedSelectedEpicIds ?? params.requirementIds ?? [], params.flowIds ?? []);

        // Deterministic dependency-warning backfill for cached blueprints too
        const cachedWarnings = normalized.contextBoundary?.dependencyWarning ?? [];
        const selectedIds = computedSelectedEpicIds ?? params.requirementIds ?? [];
        const deterministicWarnings = this.computeDependencyWarnings(allRequirements, selectedIds, cachedWarnings);
        if (deterministicWarnings.length > cachedWarnings.length) {
          log.info(`dependencyWarning backfill (cached): ${cachedWarnings.length} → ${deterministicWarnings.length}`);
          normalized.contextBoundary.dependencyWarning = deterministicWarnings;
        }

        ctx.scope.recordAgentStart('test_architect');
        ctx.scope.recordAgentComplete('test_architect', {
          tokenUsage: { input: 0, output: 0, reasoning: 0 },
          latencyMs: 0,
          outputData: normalized,
        });
        pipelineRepo.saveGlobalBlueprint(ctx.runId, normalized);
        return normalized;
      }
    }

    log.info(`Architect: cache MISS${params.forceArchitect ? ' (forceArchitect=true)' : ''} ── generating via LLM...`);
    log.info(`Architect input: ${allRequirements.length} reqs (${params.requirementIds?.length ?? 0} selected), ${allProjectFlows.length} flows (${params.flowIds?.length ?? 0} selected)`);
    ctx.sendEvent('phase:start', { phase: 'preparation', message: 'Generating Global Test Blueprint...' });
    ctx.scope.recordAgentStart('test_architect');

    // 2. Gather aggregate data for the architect
    const coverageRows = pipelineRepo.getProjectCoverage(projectId);
    const coverageSnapshot = coverageRows.map((row: any) => ({
      requirementId: row.requirement_id,
      conditionHash: row.condition_hash,
      technique: row.technique,
      testCaseIds: row.test_case_ids ?? [],
    }));

    // 3. Build synthetic state for architect prompts — include ALL data + selection boundary
    // Use computed epic IDs (from groupRequirementsByEpic) not raw params.requirementIds
    const selectedEpicIds = computedSelectedEpicIds ?? params.requirementIds ?? [];
    const selectedFlowIds = params.flowIds ?? [];
    const allEpicItems = allRequirements
      .filter((r: any) => r.level === 'epic')
      .map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? 'epic', parentId: r.parentId ?? '' }));
    const syntheticState: Partial<TestGenState> = {
      projectId,
      currentBatch: allEpicItems as any,
      batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
      projectContext: { name: projectId, pages: [], endpoints: [] },
      businessFlowBlueprints: allFlowBlueprints as any,
      coverageSnapshot: coverageSnapshot as any,
      selectionBoundary: { selectedEpicIds, selectedFlowIds },
    };

    // 4. Generate blueprint via LLM
    const override = pipelineRepo.getPromptOverride(projectId, 'test_architect');
    const systemPrompt = buildArchitectSystemPrompt(syntheticState as TestGenState, override?.custom_prompt ?? undefined);
    const userMessage = buildArchitectUserMessage(syntheticState as TestGenState, allRequirements, allFlowBlueprints);
    const outputProfile = createArchitectOutputProfile();

    const architectMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    const architectStartTime = Date.now();
    const { output: blueprint, usage } = await callLLMWithStructuredOutput(
      ctx.provider,
      architectMessages,
      ANALYST_SKILLS,
      outputProfile,
      {
        onStep: (name, idx, step) => ctx.scope.recordAgentStep('test_architect', idx, step),
        onThinking: (name, text, type, phase) => ctx.scope.recordAgentThinking('test_architect', text, type, phase),
      },
      'test_architect',
    );
    const architectLatencyMs = Date.now() - architectStartTime;

    const globalBlueprint = blueprint as GlobalTestBlueprint;

    // 4b. Deterministic dependency-warning backfill (override LLM omissions)
    const llmWarnings = globalBlueprint.contextBoundary?.dependencyWarning ?? [];
    const deterministicWarnings = this.computeDependencyWarnings(allRequirements, selectedEpicIds, llmWarnings);
    if (deterministicWarnings.length > llmWarnings.length) {
      log.info(`dependencyWarning backfill: LLM=${llmWarnings.length}, deterministic=${deterministicWarnings.length} ── overriding`);
      globalBlueprint.contextBoundary.dependencyWarning = deterministicWarnings;
    }

    const riskCount = globalBlueprint.riskEpicTree?.length ?? 0;
    const anomalyCount = globalBlueprint.anomalousFlowProposals?.length ?? 0;
    log.success(`Blueprint generated ── ${riskCount} risk epics, ${anomalyCount} anomalous flows`);

    // 5. Emit agent:complete with usage and persist to DB
    ctx.scope.recordAgentComplete('test_architect', {
      tokenUsage: { input: usage.input, output: usage.output, reasoning: usage.reasoning },
      latencyMs: architectLatencyMs,
      inputPrompt: architectMessages,
      outputData: globalBlueprint,
    });
    pipelineRepo.saveGlobalBlueprint(ctx.runId, globalBlueprint);
    pipelineRepo.saveCachedBlueprint(projectId, hash, globalBlueprint);

    return globalBlueprint;
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
    selectedFlowIds: string[] = [],
    analystMode: 'STAGE_1_REQUIREMENT' | 'STAGE_2_FLOW' | 'STAGE_3_ERROR_GUESSING' = 'STAGE_1_REQUIREMENT',
    globalBlueprint?: GlobalTestBlueprint,
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
      selectedFlowIds,
      selectionBoundary: { selectedEpicIds: requirementIds, selectedFlowIds },
      phase: 'analysis' as const,
      analystMode,
      errors: [],
      globalBlueprint,
    };
  }

  /** Deterministically compute dependencyWarning from requirement data.
   *  Dependencies are only allowed on story-level requirements (validation enforces this).
   *  For each story belonging to a selected epic, check if its `dependencies`
   *  reference stories in unselected epics. Merge any found into the warning.
   */
  private computeDependencyWarnings(
    allRequirements: any[],
    selectedEpicIds: string[],
    llmWarnings: string[],
  ): string[] {
    const selectedSet = new Set(selectedEpicIds);
    const reqById = new Map<string, any>();
    const epicMap = new Map<string, string>();

    for (const req of allRequirements) {
      reqById.set(req.id, req);
      if (req.level === 'epic') {
        epicMap.set(req.id, req.id);
      }
    }

    // Resolve each non-epic requirement to its root epic via parentId chain
    for (const req of allRequirements) {
      if (epicMap.has(req.id)) continue;
      let cur: any = req;
      const visited = new Set<string>();
      while (cur.parentId && !epicMap.has(cur.id)) {
        if (!visited.add(cur.id)) break;
        cur = reqById.get(cur.parentId);
        if (!cur) break;
      }
      const rootEpicId = epicMap.get(cur.id);
      if (rootEpicId) epicMap.set(req.id, rootEpicId);
    }

    const warnings = new Set(llmWarnings);

    for (const req of allRequirements) {
      const reqEpicId = epicMap.get(req.id);
      if (!reqEpicId || !selectedSet.has(reqEpicId)) continue;
      for (const depId of req.dependencies ?? []) {
        const depEpicId = epicMap.get(depId);
        if (depEpicId && !selectedSet.has(depEpicId)) {
          warnings.add(depEpicId);
        }
      }
    }

    return Array.from(warnings);
  }

  /** Ensure backward compatibility for cached blueprints without contextBoundary */
  private normalizeGlobalBlueprint(bp: any, selectedEpicIds: string[], selectedFlowIds: string[]): GlobalTestBlueprint {
    if (!bp.contextBoundary) {
      const allEpicIds = bp.riskEpicTree?.map((n: any) => n.epicId) ?? selectedEpicIds;
      bp.contextBoundary = {
        selectedEpicIds,
        selectedFlowIds,
        allEpicIds,
        allFlowIds: selectedFlowIds,
        dependencyWarning: [],
      };
    }
    return bp as GlobalTestBlueprint;
  }
}