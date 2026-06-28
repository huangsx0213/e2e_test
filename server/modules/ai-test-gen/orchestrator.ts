import { createHash } from 'crypto';
import type { AIProvider } from './infra/provider.ts';
import { pipelineRepo } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { ContextBuilder, type RunContext, type StartParams } from './context.ts';
import { TestGenSession, type BatchInput, type BatchResult } from './session.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';
import { groupRequirementsByEpic, findRootEpic, deduplicateTestCases } from './helpers.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';
import { checkpointer } from './graph/checkpointer.ts';
import { buildTestGenGraph } from './graph/graph.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import type { TestGenState } from './graph/state.ts';
import { buildArchitectSystemPrompt, buildArchitectUserMessage } from './graph/prompts.ts';
import { callLLMWithStructuredOutput } from './graph/nodes/utils.ts';
import { ANALYST_SKILLS } from './graph/skills/skills.ts';
import { createArchitectOutputProfile } from './graph/structured-output/architect.ts';
import type { GlobalTestBlueprint, DirectiveTestStrategy, DirectiveAnomalousFlowProposal } from '../../../shared/contracts/index.ts';
import { Log } from '../../shared/services/logger.ts';

function createDummyProvider(): AIProvider {
  return {
    streamChat: async function* () { /* noop */ },
  };
}

/**
 * PRD §3.6a §3.2: 项目级频次扫描。遍历所有业务流的 steps，统计每个 requirementId 被引用次数。
 * occurrenceCount > 1 标记为 isDuplicateReference（高优先级，要求 Analyst prompt 注入 High-Frequency 段落）。
 */
function computeProjectRequirementFrequencies(
  flows: any[],
  requirements: any[],
): Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }> {
  const allReqIds = new Set(requirements.map((r: any) => r.id));
  const counts: Record<string, number> = {};
  for (const flow of flows ?? []) {
    for (const step of flow.steps ?? []) {
      const rid = step.requirementId;
      if (!rid || !allReqIds.has(rid)) continue;
      counts[rid] = (counts[rid] ?? 0) + 1;
    }
  }
  return [...allReqIds].map(id => ({
    requirementId: id,
    occurrenceCount: counts[id] ?? 0,
    isDuplicateReference: (counts[id] ?? 0) > 1,
  }));
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

  private handleRunError(runId: string, phase: string, err: any, ctx?: RunContext, recoverable = false): void {
    if (ctx) {
      if (!ctx.isAborted()) ctx.scope.markFailed(err.message);
    } else {
      this.sseGateway.emit(runId, 'pipeline:error', { phase, message: err.message, recoverable });
    }
  }

  private handleRunCleanup(runId: string, ctx?: RunContext, keepSse?: boolean): void {
    if (ctx) {
      ctx.releaseSlot();
      if (!keepSse) this.sseGateway.cleanup(runId);
    }
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
      const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });
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

      // 项目级 requirementFrequencies (PRD §3.6a §3.2) — 用于 Analyst prompt 的 High-Frequency 段落
      const projectRequirementFrequencies = computeProjectRequirementFrequencies(businessFlows, requirements);

      // 项目级 coverageSnapshot (PRD §3.2) — 用于 Analyst prompt 的 Already Covered 段落
      const projectCoverageSnapshot = pipelineRepo.getProjectCoverage(projectId).map((row: any) => ({
        requirementId: row.requirement_id,
        conditionHash: row.condition_hash,
        technique: row.technique,
        testCaseIds: row.test_case_ids ?? [],
      }));
      if (projectRequirementFrequencies.length > 0 || projectCoverageSnapshot.length > 0) {
        log.kv('project.requirementFrequencies', projectRequirementFrequencies.filter(f => f.isDuplicateReference).length);
        log.kv('project.coverageSnapshot', projectCoverageSnapshot.length);
      }

      // Global Blueprint: 执行 Architect 一次（不在 per-batch 循环内）
      Log.subsection('Global Blueprint ── Architect (once before batch loop)');
      const globalBlueprint = await this.ensureGlobalBlueprint(ctx, projectId, params, requirements, businessFlows);

      // === 3-Stage Routing ===
      // Stage 1: Requirement batches (STAGE_1_REQUIREMENT)
      // Stage 2: Flow batches (STAGE_2_FLOW) — only when flows are selected
      // Stage 3: Error guessing batches (STAGE_3_ERROR_GUESSING)
      const allResults: BatchResult[] = [];
      let stageTotalBatches = totalBatches;

      const hasFlows = filteredFlows.length > 0;
      const flowCount = hasFlows ? 1 : 0;

      // 偏差 #4: Stage 3 batch count depends on anomalous proposals + affected epics.
      // We compute this here (before finalTotalBatches) so the total reflects the new logic.
      const proposals = (globalBlueprint as DirectiveTestStrategy | undefined)?.anomalousFlowProposals ?? [];
      let stage3Estimate = 1; // default fallback
      if (proposals.length > 0) {
        const parentMap = new Map(allIndex.map((i: any) => [i.id, i.parent]));
        const affectedEpicIds = new Set(
          proposals.flatMap(p => p.affectedRequirementIds).map(rid => findRootEpic(rid, parentMap))
        );
        const affectedEpics = epics.filter((e: any) => affectedEpicIds.has(e.id));
        stage3Estimate = affectedEpics.length > 0 ? affectedEpics.length : 1;
      }
      const finalTotalBatches = totalBatches + flowCount + stage3Estimate;

      // --- Stage 1: Requirement Analysis ---
      {
        ctx.sendEvent('phase:start', { phase: 'analysis', message: `Stage 1: Requirement analysis (${epics.length} batch(es))` });
        const reqBatches = epics.map((epic, i) => ({
          batchIndex: i,
          inputState: this.buildBatchInputState(
            projectId, params.requirementIds, requirements, rootGroups, epic, i, finalTotalBatches, businessFlows,
            params.mode, params.flowIds,
            'STAGE_1_REQUIREMENT', globalBlueprint,
            globalBlueprint as DirectiveTestStrategy,
            projectRequirementFrequencies, projectCoverageSnapshot,
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
          globalBlueprint as DirectiveTestStrategy,
          projectRequirementFrequencies, projectCoverageSnapshot,
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
          projectId, params, requirements, allIndex, businessFlows, epics,
          allResults.length, finalTotalBatches, globalBlueprint,
          globalBlueprint as DirectiveTestStrategy,
          projectRequirementFrequencies, projectCoverageSnapshot,
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
        const rawAllCases = allResults.flatMap(r => r.lastState?.finalTestCases || r.cases || []);
        const { allCases: dedupedCases, removedCount: textRemovedCount, conflicts: textConflicts } = deduplicateTestCases(rawAllCases);
        log.success(`All stages done ── ${dedupedCases.length} final cases${textRemovedCount > 0 ? ` (${textRemovedCount} text duplicates removed)` : ''}`);

        // Level 3: LLM semantic dedup on remaining cases
        let semanticRemovedCount = 0;
        let semanticConflicts: string[] = [];
        if (dedupedCases.length > 1) {
          const semanticResult = await this.llmSemanticDedup(ctx.provider, dedupedCases);
          semanticRemovedCount = semanticResult.removedCount;
          semanticConflicts = semanticResult.conflicts;
          textConflicts.push(...semanticConflicts);
          log.success(`Semantic dedup ── ${semanticRemovedCount} semantic duplicates removed`);
        }

        const totalRemoved = textRemovedCount + semanticRemovedCount;
        if (totalRemoved > 0) {
          ctx.sendEvent('pipeline:dedup', { removed: totalRemoved, remaining: dedupedCases.length });
        }
        ctx.scope.markComplete({ totalCases: dedupedCases.length, totalBatches: stageTotalBatches });
      }
    } catch (err: any) {
      this.handleRunError(runId, 'orchestrator', err, ctx ?? undefined, false);
    } finally {
      this.handleRunCleanup(runId, ctx ?? undefined, keepSse);
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

      const { allCases: dedupedCases, removedCount: textRemovedCount } = deduplicateTestCases(
        allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []),
      );

      // Level 3: LLM semantic dedup on remaining cases
      let semanticRemovedCount = 0;
      if (dedupedCases.length > 1) {
        try {
          const semanticResult = await this.llmSemanticDedup(ctx.provider, dedupedCases);
          semanticRemovedCount = semanticResult.removedCount;
        } catch {
          // Non-critical — fall back to text-based dedup only
        }
      }

      const totalRemoved = textRemovedCount + semanticRemovedCount;
      if (totalRemoved > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: totalRemoved, remaining: dedupedCases.length - semanticRemovedCount });
      }
      ctx.scope.markComplete({ totalCases: dedupedCases.length - semanticRemovedCount, totalBatches: totalBatches || 1 });
    } catch (err: any) {
      this.handleRunError(runId, 'resume', err, ctx ?? undefined, false);
    } finally {
      this.handleRunCleanup(runId, ctx ?? undefined, keepSse);
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

      const { allCases: dedupedCases, removedCount: textRemovedCount } = deduplicateTestCases(
        allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []),
      );

      // Level 3: LLM semantic dedup on remaining cases
      let semanticRemovedCount = 0;
      if (dedupedCases.length > 1) {
        try {
          const semanticResult = await this.llmSemanticDedup(ctx.provider, dedupedCases);
          semanticRemovedCount = semanticResult.removedCount;
        } catch {
          // Non-critical — fall back to text-based dedup only
        }
      }

      const totalRemoved = textRemovedCount + semanticRemovedCount;
      if (totalRemoved > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: totalRemoved, remaining: dedupedCases.length - semanticRemovedCount });
      }
      ctx.scope.markComplete({ totalCases: dedupedCases.length - semanticRemovedCount, totalBatches: totalBatches || 1 });
    } catch (err: any) {
      this.handleRunError(runId, 'retry', err, ctx ?? undefined, true);
    } finally {
      this.handleRunCleanup(runId, ctx ?? undefined, keepSse);
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
    const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });

    const globalBlueprint = pipelineRepo.getGlobalBlueprint(runId);

    // Recompute project-level frequencies and coverage for continue flow
    const projectRequirementFrequencies = computeProjectRequirementFrequencies(businessFlows, requirements);
    const projectCoverageSnapshot = pipelineRepo.getProjectCoverage(projectId).map((row: any) => ({
      requirementId: row.requirement_id,
      conditionHash: row.condition_hash,
      technique: row.technique,
      testCaseIds: row.test_case_ids ?? [],
    }));

    const remaining = epics
      .map((epic, i) => ({
        batchIndex: i,
        inputState: this.buildBatchInputState(projectId, requirementIds, requirements, rootGroups, epic, i, totalBatches, businessFlows, config.mode || 'auto', config.flowIds, 'STAGE_1_REQUIREMENT', globalBlueprint, undefined, projectRequirementFrequencies, projectCoverageSnapshot),
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
    globalBlueprint?: GlobalTestBlueprint | DirectiveTestStrategy,
    directiveTestStrategy?: DirectiveTestStrategy,
    requirementFrequencies?: Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }>,
    coverageSnapshot?: Array<{ requirementId: string; conditionHash: string; technique: string; testCaseIds: string[] }>,
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
        phase: 'analysis' as const,
        analystMode: 'STAGE_2_FLOW' as const,
        errors: [],
        globalBlueprint,
        directiveTestStrategy,
        requirementFrequencies: requirementFrequencies ?? [],
        coverageSnapshot,
      },
    }];
  }

  private buildErrorGuessingBatches(
    projectId: string,
    params: StartParams,
    requirements: any[],
    allIndex: any[],
    businessFlows: any[],
    epics: any[],
    startBatchIndex: number,
    finalTotalBatches: number,
    globalBlueprint?: GlobalTestBlueprint | DirectiveTestStrategy,
    directiveTestStrategy?: DirectiveTestStrategy,
    requirementFrequencies?: Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }>,
    coverageSnapshot?: Array<{ requirementId: string; conditionHash: string; technique: string; testCaseIds: string[] }>,
  ): BatchInput[] {
    const mode: 'auto' | 'interactive' = params.mode || 'auto';
    const proposals = directiveTestStrategy?.anomalousFlowProposals ?? [];

    // 偏差 #4: 按 affected Epic 分批；无 proposals 时降级为全量单 batch
    if (proposals.length === 0) {
      return [{
        batchIndex: startBatchIndex,
        inputState: {
          projectId,
          runId: '',
          mode,
          requirementIds: params.requirementIds || [],
          currentBatch: requirements.map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? '', parentId: r.parentId ?? '' })),
          batchContext: { currentBatch: startBatchIndex + 1, totalBatches: finalTotalBatches, processedCount: startBatchIndex },
          projectContext: { name: 'Error Guessing (all requirements)', pages: [], endpoints: [] },
          businessFlowBlueprints: businessFlows,
          selectedFlowIds: [],
          phase: 'analysis' as const,
          analystMode: 'STAGE_3_ERROR_GUESSING' as const,
          errors: [],
          globalBlueprint,
          directiveTestStrategy,
          requirementFrequencies: requirementFrequencies ?? [],
          coverageSnapshot,
        },
      }];
    }

    // Compute affected epic IDs from anomalousFlowProposals
    const parentMap = new Map(allIndex.map((i: any) => [i.id, i.parent]));
    const affectedEpicIds = new Set(
      proposals.flatMap(p => p.affectedRequirementIds).map(rid => findRootEpic(rid, parentMap))
    );

    const affectedEpics = epics.filter((e: any) => affectedEpicIds.has(e.id));

    // Fallback: if no matching epics found (orphan references), use all
    const targetEpics = affectedEpics.length > 0 ? affectedEpics : epics;

    return targetEpics.map((epic: any, idx: number) => {
      const epicReqIds = new Set(
        allIndex
          .filter((entry: any) => findRootEpic(entry.id, parentMap) === epic.id)
          .map((entry: any) => entry.id)
      );
      const batchReqs = requirements.filter((r: any) => epicReqIds.has(r.id));

      return {
        batchIndex: startBatchIndex + idx,
        inputState: {
          projectId,
          runId: '',
          mode,
          requirementIds: params.requirementIds || [],
          currentBatch: batchReqs.map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? '', parentId: r.parentId ?? '' })),
          batchContext: { currentBatch: startBatchIndex + idx + 1, totalBatches: finalTotalBatches, processedCount: startBatchIndex + idx },
          projectContext: { name: `Error Guessing: ${epic.title}`, pages: [], endpoints: [] },
          businessFlowBlueprints: businessFlows,
          selectedFlowIds: [],
          phase: 'analysis' as const,
          analystMode: 'STAGE_3_ERROR_GUESSING' as const,
          errors: [],
          globalBlueprint,
          directiveTestStrategy,
          requirementFrequencies: requirementFrequencies ?? [],
          coverageSnapshot,
        },
      };
    });
  }

  private computeRequirementHash(params: StartParams, requirements: any[], businessFlows?: any[]): string {
    const allReqs = [...requirements]
      .map((r: any) => ({ id: r.id, title: r.title, description: r.description ?? '' }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    const flows = (businessFlows ?? [])
      .map((f: any) => ({ id: f.id, name: f.name, type: f.type }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));
    const hashInput = { requirements: allReqs, businessFlows: flows };
    return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
  }

  private computeCrossRefs(flows: any[]): Array<{ requirementId: string; sharedByFlowIds: string[]; coOccurringReqIds: string[]; conflictRisk: 'high' | 'low' }> {
    const reqToFlows = new Map<string, { flowIds: Set<string>; coOccurring: Set<string> }>();
    for (const flow of flows) {
      for (let i = 0; i < (flow.steps ?? []).length; i++) {
        const step = flow.steps[i];
        const rid = step.requirementId;
        if (!rid) continue;
        const entry = reqToFlows.get(rid) ?? { flowIds: new Set(), coOccurring: new Set() };
        entry.flowIds.add(flow.id);
        if (i > 0) entry.coOccurring.add(flow.steps[i - 1].requirementId);
        if (i < flow.steps.length - 1) entry.coOccurring.add(flow.steps[i + 1].requirementId);
        reqToFlows.set(rid, entry);
      }
    }
    return [...reqToFlows.entries()].map(([reqId, data]) => ({
      requirementId: reqId,
      sharedByFlowIds: [...data.flowIds],
      coOccurringReqIds: [...data.coOccurring].filter(Boolean),
      conflictRisk: data.flowIds.size > 1 ? 'high' : 'low',
    }));
  }

  private async ensureGlobalBlueprint(
    ctx: RunContext,
    projectId: string,
    params: StartParams,
    allRequirements: any[],
    businessFlows: any[],
  ): Promise<DirectiveTestStrategy | undefined> {
    const log = Log.for('orchestrator');
    const hash = this.computeRequirementHash(params, allRequirements, businessFlows);

    // 1. Check DB cache (only v2 entries)
    if (!params.forceArchitect) {
      const cached = pipelineRepo.getCachedBlueprint(projectId, hash);
      if (cached && (cached as any).schema_version === 'v2') {
        log.info(`Architect: cache HIT ── reusing cached directive strategy (hash=${hash.slice(0, 12)}...)`);
        ctx.scope.recordAgentStart('test_architect');
        ctx.scope.recordAgentComplete('test_architect', {
          tokenUsage: { input: 0, output: 0, reasoning: 0 },
          latencyMs: 0,
          outputData: cached,
        });
        pipelineRepo.saveGlobalBlueprint(ctx.runId, cached);
        return cached as DirectiveTestStrategy;
      }
    }

    log.info(`Architect: cache MISS${params.forceArchitect ? ' (forceArchitect=true)' : ''} ── generating via LLM...`);
    ctx.sendEvent('phase:start', { phase: 'preparation', message: 'Generating Directive Test Strategy...' });
    ctx.scope.recordAgentStart('test_architect');

    // 2. Compute cross-references from flows
    const crossRefs = this.computeCrossRefs(businessFlows);

    // 3. Gather aggregate data for the architect
    const coverageRows = pipelineRepo.getProjectCoverage(projectId);
    const coverageSnapshot = coverageRows.map((row: any) => ({
      requirementId: row.requirement_id,
      conditionHash: row.condition_hash,
      technique: row.technique,
      testCaseIds: row.test_case_ids ?? [],
    }));
    const sortedReqIds = [...(params.requirementIds || [])].sort();
    const allSelectedReqs = allRequirements
      .filter((r: any) => sortedReqIds.includes(r.id))
      .map((r: any) => ({ id: r.id, title: r.title, description: r.description ?? '', acceptanceCriteria: r.acceptanceCriteria ?? [], level: r.level ?? 'story', parentId: r.parentId ?? '' }));

    // 4. Build synthetic state for architect prompts
    const syntheticState: Partial<TestGenState> = {
      projectId,
      currentBatch: allSelectedReqs,
      batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
      projectContext: { name: projectId, pages: [], endpoints: [] },
      businessFlowBlueprints: businessFlows as any,
      coverageSnapshot: coverageSnapshot as any,
      directiveTestStrategy: { crossReferenceMap: crossRefs } as any,
    };

    // 5. Generate blueprint via LLM
    const override = pipelineRepo.getPromptOverride(projectId, 'test_architect');
    const systemPrompt = buildArchitectSystemPrompt(syntheticState as TestGenState, override?.custom_prompt ?? undefined);
    const userMessage = buildArchitectUserMessage(syntheticState as TestGenState);
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

    const directiveStrategy = blueprint as DirectiveTestStrategy;
    // Attach the computed crossRefs (overrides any LLM-generated ones for accuracy)
    directiveStrategy.crossReferenceMap = crossRefs;
    const epicCount = directiveStrategy.epicDirectives?.length ?? 0;
    const flowCount = directiveStrategy.flowDirectives?.length ?? 0;
    const anomalyCount = directiveStrategy.anomalousFlowProposals?.length ?? 0;
    log.success(`Directive strategy generated ── ${epicCount} epic directives, ${flowCount} flow directives, ${anomalyCount} anomalous flows`);

    // 6. Emit agent:complete with usage and persist to DB
    ctx.scope.recordAgentComplete('test_architect', {
      tokenUsage: { input: usage.input, output: usage.output, reasoning: usage.reasoning },
      latencyMs: architectLatencyMs,
      inputPrompt: architectMessages,
      outputData: directiveStrategy,
    });
    pipelineRepo.saveGlobalBlueprint(ctx.runId, directiveStrategy);
    pipelineRepo.saveCachedBlueprint(projectId, hash, { ...directiveStrategy, schema_version: 'v2' });

    return directiveStrategy;
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
    globalBlueprint?: GlobalTestBlueprint | DirectiveTestStrategy,
    directiveTestStrategy?: DirectiveTestStrategy,
    requirementFrequencies?: Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }>,
    coverageSnapshot?: Array<{ requirementId: string; conditionHash: string; technique: string; testCaseIds: string[] }>,
  ) {
    // Stage 1: 从 allowedReqIds 排除 coverageDirective='skip' 的 requirement
    let batchReqs = requirements.filter((r: any) => new Set(rootGroups.get(epic.id)!).has(r.id));
    if (directiveTestStrategy?.epicDirectives) {
      const skipEpicIds = new Set(
        directiveTestStrategy.epicDirectives
          .filter(ed => ed.coverageDirective === 'skip')
          .map(ed => ed.epicId)
      );
      if (skipEpicIds.has(epic.id)) {
        batchReqs = [];
      }
    }

    // 偏差 #5: Stage 1 按 crossReferenceMap 过滤 businessFlows — 仅注入与当前 batch req 直接相关的 flows
    let filteredFlows = businessFlows;
    if (analystMode === 'STAGE_1_REQUIREMENT' && directiveTestStrategy?.crossReferenceMap?.length) {
      const batchReqSet = new Set(batchReqs.map((r: any) => r.id));
      const relevantFlowIds = new Set<string>();
      for (const xref of directiveTestStrategy.crossReferenceMap) {
        if (batchReqSet.has(xref.requirementId)) {
          for (const flowId of xref.sharedByFlowIds ?? []) relevantFlowIds.add(flowId);
        }
      }
      filteredFlows = relevantFlowIds.size > 0
        ? businessFlows.filter((f: any) => relevantFlowIds.has(f.id))
        : businessFlows; // fallback: pass all when no xref match (avoid empty injection)
    }

    return {
      projectId,
      runId: '',
      mode,
      requirementIds,
      currentBatch: batchReqs.map((r: any) => ({ id: r.id, title: r.title, level: r.level ?? '', parentId: r.parentId ?? '' })),
      batchContext: { currentBatch: i + 1, totalBatches, processedCount: i },
      projectContext: { name: epic.title, pages: [], endpoints: [] },
      businessFlowBlueprints: filteredFlows,
      selectedFlowIds,
      phase: 'analysis' as const,
      analystMode,
      errors: [],
      globalBlueprint,
      directiveTestStrategy,
      requirementFrequencies: requirementFrequencies ?? [],
      coverageSnapshot,
    } as TestGenState;
  }

  /**
   * Level 3 dedup: LLM semantic comparison.
   * Groups remaining cases by semantic similarity; keeps the clearest in each group.
   */
  private async llmSemanticDedup(provider: AIProvider, cases: any[]): Promise<{ allCases: any[]; removedCount: number; conflicts: string[] }> {
    const log = Log.for('orchestrator');

    // Build a prompt that asks the LLM to compare all cases and identify semantic duplicates
    const comparisonCases = cases.map((tc, i) => ({
      index: i,
      id: tc.id,
      title: tc.title,
      condition: tc.conditionId || '',
      description: tc.condition || tc.title,
      stepsCount: (tc.steps ?? []).length,
    }));

    const systemPrompt = `You are a test case deduplication expert. Given a list of test cases, identify which ones are semantic duplicates — i.e., they test the same thing even though the wording differs.

Rules:
1. Two cases are semantic duplicates if they test the SAME test scenario, even if titles/steps differ slightly.
2. Two cases are NOT duplicates if they test different aspects (different inputs, different paths, different error conditions).
3. When a group of cases are semantic duplicates, keep the one with the clearest title and most detailed steps.
4. Return a JSON object with "groups" (each group is an array of indices that are duplicates) and "kept" (the index to keep in each group).

Example output format:
{
  "groups": [
    { "indices": [0, 3], "keptIndex": 0, "reason": "Same test scenario: login with valid credentials" }
  ]
}`;

    const userMessage = JSON.stringify({
      cases: comparisonCases,
      instruction: 'Identify semantic duplicates. Return ONLY the JSON object.',
    }, null, 2);

    try {
      const { output } = await callLLMWithStructuredOutput(
        provider,
        [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userMessage },
        ],
        [],
        {
          toolSchema: {
            type: 'object' as const,
            properties: {
              groups: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    indices: { type: 'array' as const, items: { type: 'number' as const } },
                    keptIndex: { type: 'number' as const },
                    reason: { type: 'string' as const },
                  },
                },
              },
            },
            required: ['groups'] as string[],
          },
          shouldAttemptPhase1Extraction: () => true,
          normalize: (raw: unknown) => raw,
          parse: (normalized: unknown) => normalized as any,
          formatValidationError: () => '',
        },
        {},
        'semantic_dedup',
        { signal: AbortSignal.timeout(30_000), agentName: 'semantic_dedup' },
      );

      const groups = output.groups ?? [];
      const keptIndices = new Set<number>();
      const removedIndices = new Set<number>();
      const conflicts: string[] = [];

      for (const group of groups) {
        const kept = group.keptIndex;
        keptIndices.add(kept);
        for (const idx of (group.indices ?? [])) {
          if (idx !== kept) {
            removedIndices.add(idx);
            const keptCase = cases[kept];
            const removedCase = cases[idx];
            conflicts.push(`Semantic duplicate of "${keptCase.title}": "${removedCase.title}" — ${group.reason}`);
          }
        }
      }

      const finalCases = cases.filter((_, i) => !removedIndices.has(i));
      const removedCount = removedIndices.size;

      if (removedCount > 0) {
        log.kv('semantic.dedup.removed', removedCount);
      }

      return { allCases: finalCases, removedCount, conflicts };
    } catch (err: any) {
      // Semantic dedup is non-critical — fall back to text-based dedup only
      log.warn(`Semantic dedup failed: ${err.message}`);
      return { allCases: cases, removedCount: 0, conflicts: [] };
    }
  }
}