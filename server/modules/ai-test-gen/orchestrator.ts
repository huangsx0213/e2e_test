import { randomId } from '../../shared/utils/index.ts';
import type { AIProvider } from './infra/provider.ts';
import { pipelineRepo } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { ContextBuilder, type RunContext, type StartParams } from './context.ts';
import { TestGenSession, type BatchInput, type BatchResult, type InterruptInfo, type RunOutcome } from './session.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { groupRequirementsByEpic, selectedRequirementAndFlowIds } from './helpers.ts';
import { deduplicateTestCases } from './helpers.ts';
import { buildBlueprintsFromFlowStories } from './business-flow-blueprint.ts';
import { checkpointer } from './graph/checkpointer.ts';
import { buildTestGenGraph } from './graph/graph.ts';
import { CHECKPOINT_BY_PHASE } from './graph/state.ts';
import { buildAnalystInput } from './analyst-input-builder.ts';
import type { GlobalEpicEntry, PreviousBatchCoverageSummary } from './graph/state.ts';
import { db } from '../../shared/db/client.ts';
import { Log } from '../../shared/services/logger.ts';

function createDummyProvider(): AIProvider {
  return {
    streamChat: async function* () { /* noop */ },
  };
}

/**
 * 把一个 test condition 合并到 accumulatedCoverage Map 中（按 requirementId 聚合）。
 * P2: 不再累积 conditionTitles，只增加 conditionCount；具体标题由 LLM 通过
 * previous_batch_conditions_query 按需查询，避免 token 随批次累积爆炸。
 */
function mergeCoverage(
  acc: Map<string, PreviousBatchCoverageSummary>,
  tc: { id: string; condition: string; requirementId: string; category?: string; primaryTechnique?: string },
): void {
  const reqId = tc.requirementId;
  const category = tc.category ?? 'functional';
  const technique = tc.primaryTechnique ?? 'Unknown';
  const existing = acc.get(reqId);
  if (existing) {
    existing.conditionCount += 1;
    if (!existing.categories.includes(category)) existing.categories.push(category);
    if (!existing.techniques.includes(technique)) existing.techniques.push(technique);
  } else {
    acc.set(reqId, {
      requirementId: reqId,
      conditionCount: 1,
      categories: [category],
      techniques: [technique],
      caseCountByLevel: { component: 0, integration: 0 },
    });
  }
}

/**
 * 把一个 finalTestCase 合并到 accumulatedCoverage Map 中（按 requirementId 聚合）。
 * P2: 不再累积 caseTitles/caseLevels，改为按 testLevel 递增 caseCountByLevel 计数；
 * 具体标题由 LLM 通过 previous_batch_cases_query 按需查询。
 */
function mergeCaseCoverage(
  acc: Map<string, PreviousBatchCoverageSummary>,
  tc: { title?: string; testLevel?: string; requirementId?: string },
): void {
  const reqId = tc.requirementId;
  if (!reqId) return;
  const level = (tc.testLevel ?? '').toLowerCase();
  const isIntegration = level === 'integration';
  const existing = acc.get(reqId);
  if (existing) {
    if (isIntegration) existing.caseCountByLevel.integration += 1;
    else existing.caseCountByLevel.component += 1;
  } else {
    acc.set(reqId, {
      requirementId: reqId,
      conditionCount: 0,
      categories: [],
      techniques: [],
      caseCountByLevel: {
        component: isIntegration ? 0 : 1,
        integration: isIntegration ? 1 : 0,
      },
    });
  }
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
      log.kv('flows', `${params.flowIds?.length ?? 0} selected (each epic: component then flow)`);
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
      const requirements = requirementRepo.listByProject(projectId);

      // Explicitly selected Flow Stories must be part of the same Epic group as
      // selected component Stories so each Epic can run component then flow.
      const selectedFlowSet = new Set(params.flowIds || []);
      const reqMap = new Map(requirements.map(r => [r.id, r]));
      const selectedIds = selectedRequirementAndFlowIds(params.requirementIds || [], params.flowIds || []);
      const { epics, rootGroups, totalBatches, selectedIndex } = groupRequirementsByEpic(allIndex, selectedIds);
      if (epics.length === 0 && selectedFlowSet.size === 0) {
        throw new Error('No matching requirements found for selected IDs');
      }

      log.info(`Requirements indexed: ${selectedIndex.length} selected, ${epics.length} epics`);
      pipelineRepo.updateModelInfo(runId, ctx.modelName, params.providerConfigName ?? null);

      // Build context map: for each selected flow, collect its referenced
      // component stories (with ACs) so they can be injected into the batch
      // prompt WITHOUT creating separate batches for them.
      const flowReferencedComponentContext = this.buildFlowReferencedComponentContext(selectedFlowSet, requirements, reqMap);
      if (flowReferencedComponentContext.size > 0) {
        log.info(`Flow context: ${selectedFlowSet.size} flows, ${flowReferencedComponentContext.size} with referenced component context`);
      }

      const allFlowStories = requirements
        .filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');
      const filteredFlowStories = selectedFlowSet.size > 0
        ? allFlowStories.filter(s => selectedFlowSet.has(s.id))
        : allFlowStories;
      const businessFlows = buildBlueprintsFromFlowStories({ flowStories: filteredFlowStories });
      log.info(`Flow stories: ${allFlowStories.length} total, ${filteredFlowStories.length} selected, ${businessFlows.length} blueprints`);

      // 计算总批次数：每个 epic 一个批次（component + flow 合并）
      let totalSubBatches = 0;
      for (const epic of epics) {
        const childIds = rootGroups.get(epic.id) ?? [];
        const hasComponentStories = childIds.some(id => {
          const r = reqMap.get(id);
          return r && r.level === 'story' && !r.isFlow;
        });
        const hasFlowStories = childIds.some(id => {
          const r = reqMap.get(id);
          return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
        });
        if (hasComponentStories || hasFlowStories) totalSubBatches++;
      }
      pipelineRepo.updateBatchCount(runId, totalSubBatches);
      log.info(`Total sub-batches: ${totalSubBatches} (component + flow per epic)`);

      // ── 构建全局统计 + L1 Epic 索引（所有批次共享） ──
      const globalStats = {
        totalRequirements: requirements.length,
        totalEpics: epics.length,
        totalFlows: allFlowStories.length,
      };
      const globalEpicIndex: GlobalEpicEntry[] = epics.map(epic => {
        const childIds = rootGroups.get(epic.id) ?? [];
        const childReqSet = new Set(childIds);
        const childReqs = requirements.filter(r => childReqSet.has(r.id));
        const epicFlowCount = allFlowStories.filter(s =>
          childReqSet.has(s.id) || childReqSet.has(s.parentId || '')
        ).length;
        const statusBreakdown: Record<string, number> = {};
        for (const r of childReqs) {
          statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + 1;
        }
        const stories = childReqs.filter(r => r.level === 'story');
        const storyIds = new Set(stories.map(s => s.id));
        const flowStoryIds = new Set(stories.filter((s: any) => s.isFlow).map(s => s.id));
        const allAcs = requirements.filter(r => storyIds.has(r.parentId) && r.level === 'ac');
        // ACs under flow stories inherit the flow flag from their parent story,
        // since the DB may not set isFlow=true on ACs individually.
        const nonFlowAcCount = allAcs.filter(a => !a.isFlow && !flowStoryIds.has(a.parentId)).length;
        const flowAcCount = allAcs.filter(a => a.isFlow || flowStoryIds.has(a.parentId)).length;
        return {
          epicId: epic.id,
          title: epic.title,
          requirementCount: childReqs.length,
          storyCount: stories.length,
          nonFlowAcCount,
          flowAcCount,
          flowCount: epicFlowCount,
          statusBreakdown,
          children: childReqs.map(r => ({
            id: r.id, title: r.title, level: r.level, isFlow: r.isFlow ?? false,
            // Nested ACs for story-level children so the prompt can list
            // story + AC titles/ids without a tool call.
            acs: r.level === 'story'
              ? allAcs
                  .filter(a => a.parentId === r.id)
                  .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                  .map(a => ({ id: a.id, title: a.title, level: 'ac', isFlow: r.isFlow || a.isFlow || false }))
              : undefined,
          })),
        };
      });
      log.info(`Global snapshot: ${globalStats.totalRequirements} requirements, ${globalStats.totalEpics} epics, ${globalStats.totalFlows} flows; L1 Epic index built`);

      // 发送准备阶段事件
      ctx.sendEvent('phase:start', { phase: 'preparation', message: `Processing ${selectedIndex.length} requirements in ${totalSubBatches} sub-batch(es)` });
      ctx.sendEvent('pipeline:context', { flows: businessFlows.length, indexEntries: selectedIndex.length });

      const avgTokensPerReq = 1000;
      const estimated = selectedIndex.length * avgTokensPerReq;
      ctx.sendEvent('pipeline:budget', {
        estimated, limit: ctx.tokenLimit,
        message: ctx.tokenLimit && estimated > ctx.tokenLimit
          ? `Estimated token usage (${estimated}) exceeds limit (${ctx.tokenLimit}).`
          : `Estimated token usage (${estimated}) within limit.`,
      });

      // 发送 L1 Epic 索引（全局观，供 Preparation 页面展示）
      ctx.sendEvent('preparation:context', {
        globalStats,
        globalEpicIndex: globalEpicIndex.map(e => ({
          epicId: e.epicId,
          title: e.title,
          requirementCount: e.requirementCount,
          flowCount: e.flowCount,
        })),
      });

      // 记录 preparation 日志
      const preparationLogId = randomId('log');
      const preparationOutput = {
        requirementCount: selectedIndex.length,
        totalBatches: totalSubBatches,
        estimatedTokens: estimated,
        flowCases: businessFlows.length,
      };
      db.prepare(`
        INSERT INTO test_gen_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
        VALUES (?, ?, 0, 'preparation', '', NULL, ?, NULL, 0, NULL, 'COMPLETED')
      `).run(preparationLogId, runId, JSON.stringify(preparationOutput));

      // 执行批次（累积 previousBatchCoverageSummary 给后续批次使用）
      const allResults: BatchResult[] = [];
      // L2 累积：按 requirementId 分组的覆盖摘要
      const accumulatedCoverage = new Map<string, PreviousBatchCoverageSummary>();

      // 如果指定了参考的其他 Runs，则从其历史中提取已生成的 test conditions 和 finalTestCases，避免生成重复用例
      if (params.referenceRunIds && params.referenceRunIds.length > 0) {
        for (const refId of params.referenceRunIds) {
          try {
            const refAnalystLogs = pipelineRepo.getAgentLogs(refId, 'test_analyst');
            for (const refLog of refAnalystLogs) {
              const batchConditions: any[] = refLog.output_data?.testConditions ?? [];
              for (const tc of batchConditions) {
                if (tc.id && tc.condition && tc.requirementId) {
                  mergeCoverage(accumulatedCoverage, tc);
                }
              }
            }
            // 同步加载参考 runs 的 finalTestCases，让 Designer case 级去重覆盖跨运行场景
            const refQualityLogs = pipelineRepo.getAgentLogs(refId, 'quality_manager');
            for (const refLog of refQualityLogs) {
              const refCases: any[] = refLog.output_data?.finalTestCases ?? [];
              for (const tc of refCases) {
                mergeCaseCoverage(accumulatedCoverage, tc);
              }
            }
            log.info(`Loaded conditions+cases from reference run ${refId}`);
          } catch (e) {
            log.error(`Failed to load reference coverage from run ${refId}: ${e}`);
          }
        }
        log.info(`Total accumulated reference requirements: ${accumulatedCoverage.size}`);
      }

      // ── Pre-flight validation ──
      // Validate selected flows and their AC references before entering the
      // batch loop, so we fail fast on data issues instead of wasting tokens.
      const validationErrors: string[] = [];
      for (const flowId of selectedFlowSet) {
        const flowStory = reqMap.get(flowId);
        if (!flowStory) {
          validationErrors.push(`Flow ${flowId} not found`);
          continue;
        }
        if (!flowStory.isFlow) {
          validationErrors.push(`Requirement ${flowId} is not a flow story (isFlow=false)`);
        }
        if (flowStory.status !== 'APPROVED') {
          validationErrors.push(`Flow ${flowId} status is ${flowStory.status}, must be APPROVED`);
        }
        // Validate flow AC relatedRequirementIds point to existing APPROVED component stories
        const flowAcs = requirements.filter(r => r.parentId === flowId && r.level === 'ac');
        for (const ac of flowAcs) {
          const refs = (ac as any).relatedRequirementIds as string[] | undefined;
          if (!refs || refs.length === 0) continue;
          for (const refId of refs) {
            const ref = reqMap.get(refId);
            if (!ref) {
              validationErrors.push(`Flow "${flowStory.title}" AC "${ac.title}" references non-existent requirement ${refId}`);
            } else if (ref.status !== 'APPROVED') {
              validationErrors.push(`Flow "${flowStory.title}" AC "${ac.title}" references ${refId} with status ${ref.status} (must be APPROVED)`);
            }
          }
        }
      }
      if (validationErrors.length > 0) {
        const msg = `Pre-flight validation failed (${validationErrors.length} errors):\n  - ${validationErrors.join('\n  - ')}`;
        log.error(msg);
        ctx.sendEvent('pipeline:error', { phase: 'preflight', message: msg, recoverable: false });
        throw new Error(msg);
      }
      log.info(`Pre-flight validation passed: ${selectedFlowSet.size} flow(s), all references valid`);

      let subBatchIndex = 0;
      for (let i = 0; i < epics.length; i++) {
        if (ctx.isAborted()) break;
        const epic = epics[i];
        const childIds = rootGroups.get(epic.id) ?? [];
        // 合并 component 和 flow stories 为一个批次
        const componentStoryIds = childIds.filter(id => {
          const r = reqMap.get(id);
          return r && r.level === 'story' && !r.isFlow;
        });
        const flowStoryIds = childIds.filter(id => {
          const r = reqMap.get(id);
          return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
        });
        const combinedStoryIds = [...componentStoryIds, ...flowStoryIds];

        if (combinedStoryIds.length > 0) {
          subBatchIndex++;
          if (ctx.isAborted()) break;
          Log.subsection(`Batch ${subBatchIndex}/${totalSubBatches} START ── epic: ${epic.id ?? 'N/A'} [MIXED]`);
          ctx.scope.setBatch(subBatchIndex, totalSubBatches);
          pipelineRepo.updateCurrentBatch(runId, subBatchIndex);
          pipelineRepo.updateThreadId(runId, `${runId}-batch-${i}-mixed`);

          const previousBatchCoverageSummary = [...accumulatedCoverage.values()];

          const batchInput: BatchInput = {
            batchIndex: subBatchIndex - 1,
            inputState: {
              ...this.buildBatchInputState(
                runId, projectId, params.requirementIds, requirements, rootGroups, epic, subBatchIndex - 1, totalSubBatches, businessFlows,
                params.mode, params.flowIds,
                'mixed', // generationMode — component + flow in one batch
                combinedStoryIds,
                flowReferencedComponentContext,
              ),
              // 注入全局上下文
              globalStats,
              globalEpicIndex,
              previousBatchCoverageSummary: previousBatchCoverageSummary.length > 0 ? previousBatchCoverageSummary : undefined,
              flowReferencedComponentContext: flowReferencedComponentContext.size > 0
                ? Object.fromEntries(flowReferencedComponentContext)
                : undefined,
            },
          };

          const outcome = await ctx.session.startBatch(batchInput);
          if (outcome.type === 'interrupt') {
            log.info(`Batch ${subBatchIndex} INTERRUPTED at phase=${outcome.interrupt.phase}, checkpoint=${outcome.interrupt.checkpointNumber}`);
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

          // 累积本批次已生成的 conditions 摘要，供后续批次参考
          const batchConditions: any[] = outcome.result.lastState?.testConditions ?? [];
          for (const tc of batchConditions) {
            mergeCoverage(accumulatedCoverage, tc);
          }
          // 累积本批次已生成的 finalTestCases 标题+级别，供 Designer 跨批次去重参考
          const batchCases: any[] = outcome.result.lastState?.finalTestCases ?? [];
          for (const tc of batchCases) {
            mergeCaseCoverage(accumulatedCoverage, tc);
          }
          log.success(`Batch ${subBatchIndex}/${totalSubBatches} complete ── ${outcome.result.cases.length} test cases (MIXED), ${batchConditions.length} conditions, ${batchCases.length} cases accumulated`);
          allResults.push(outcome.result);
          ctx.sendEvent('batch:complete', {
            batch: subBatchIndex, total: totalSubBatches,
            testCases: outcome.result.cases.length,
            mode: 'mixed',
          });
        }
      }

      // 完成：totalCases 使用原始计数（与保存行为一致），去重仅作度量告警
      if (!ctx.isAborted()) {
        // D3: 全局覆盖矩阵后处理（纯 TS 计算，不调用 LLM）
        const allBatchResults = allResults;
        const globalSummary = {
          totalConditions: allBatchResults.reduce((sum, r) => sum + (r.lastState?.testConditions?.length ?? 0), 0),
          totalCases: allBatchResults.reduce((sum, r) => sum + (r.lastState?.finalTestCases?.length ?? r.cases?.length ?? 0), 0),
          batchCount: epics.length,
        };
        ctx.sendEvent('pipeline:global-coverage', globalSummary);
        log.info(`Global coverage: ${globalSummary.totalConditions} conditions, ${globalSummary.totalCases} cases across ${globalSummary.batchCount} batches`);

        const allRawCases = allResults.flatMap(r => r.lastState?.finalTestCases || r.cases || []);
        const { removedCount } = deduplicateTestCases(allRawCases);
        log.success(`All batches done ── ${allRawCases.length} final cases${removedCount > 0 ? ` (${removedCount} suspected duplicates — prevent at generation, not here)` : ''}`);
        if (removedCount > 0) {
          ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allRawCases.length - removedCount, total: allRawCases.length });
        }
        ctx.scope.markComplete({ totalCases: allRawCases.length, totalBatches: epics.length });
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

      // totalCases 使用原始计数（与保存行为一致），去重仅作度量告警
      const allRawCases = allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []);
      const { removedCount } = deduplicateTestCases(allRawCases);
      if (removedCount > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allRawCases.length - removedCount, total: allRawCases.length });
      }
      ctx.scope.markComplete({ totalCases: allRawCases.length, totalBatches: totalBatches || 1 });
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
    const log = Log.for('orchestrator');
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

      // Always try checkpoint recovery first. When a node (analyst/designer/
      // quality) throws, LangGraph does NOT save a checkpoint for that node —
      // the last checkpoint is from the PREVIOUS successful node. So
      // stream(null, ...) resumes from the failed agent itself, which is
      // exactly what we want.
      //
      // If recovery fails (no checkpoint, corrupt state, __start__-only
      // checkpoint, etc.), fall back to restarting the batch from scratch.
      let outcome: RunOutcome;
      try {
        log.info(`Attempting checkpoint recovery (threadId=${threadId}, batch=${batchIndex}, failedPhase=${row.phase || 'unknown'})`);
        outcome = await ctx.session.retryFromLastCheckpoint(threadId, batchIndex);
      } catch (retryErr: any) {
        log.warn(`Checkpoint recovery failed (${retryErr.message}), attempting agent-log recovery for batch ${row.current_batch}`);
        const batchInput = this.rebuildBatchInputForRetry(runId, row.project_id, config, row.current_batch || 1);
        if (!batchInput) {
          throw new Error(`Failed to rebuild batch input for retry (batch ${row.current_batch}): ${retryErr.message}`);
        }

        // 查出当前 batch 已成功完成的 agent logs，按执行顺序排序。
        // 这样可以从失败的 agent 继续执行，而不是从 preparation 从头开始，
        // 避免浪费已成功 agent 的 LLM 调用结果。
        const currentBatchNum = row.current_batch || 1;
        const allLogs = pipelineRepo.getAgentLogs(runId);
        const batchLogs = allLogs.filter(l => l.batch === currentBatchNum && l.status === 'COMPLETED');
        const agentOrder = ['test_analyst', 'test_designer', 'quality_manager'];
        const completedAgentOutputs = agentOrder
          .map(name => batchLogs.find(l => l.agent_name === name))
          .filter((l): l is NonNullable<typeof l> => !!l && !!l.output_data)
          .map(l => ({ agentName: l.agent_name as string, outputData: l.output_data as Record<string, unknown> }));

        // Use a fresh thread_id to avoid stale checkpoint state
        const retryThreadId = `${threadId}-retry-${Date.now()}`;
        pipelineRepo.updateThreadId(runId, retryThreadId);

        if (completedAgentOutputs.length > 0) {
          log.info(`Recovered ${completedAgentOutputs.length} completed agent(s) [${completedAgentOutputs.map(a => a.agentName).join(', ')}] from logs, resuming from failed agent (not from scratch)`);
          outcome = await ctx.session.retryFromAgentLogs(
            retryThreadId,
            batchIndex,
            batchInput.inputState as Record<string, unknown>,
            completedAgentOutputs,
          );
        } else {
          // 没有已成功的 agent（例如 analyst 就失败了），只能从头开始
          log.info(`No completed agents found for batch ${currentBatchNum}, starting from scratch`);
          outcome = await ctx.session.startBatch(batchInput, retryThreadId);
        }
      }

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

      // totalCases 使用原始计数（与保存行为一致），去重仅作度量告警
      const allRawCases = allResults.flatMap((r: any) => r.lastState?.finalTestCases || r.cases || []);
      const { removedCount } = deduplicateTestCases(allRawCases);
      if (removedCount > 0) {
        ctx.sendEvent('pipeline:dedup', { removed: removedCount, remaining: allRawCases.length - removedCount, total: allRawCases.length });
      }
      ctx.scope.markComplete({ totalCases: allRawCases.length, totalBatches: totalBatches || 1 });
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

  /**
   * Rebuild the BatchInput for a failed batch when no checkpoint exists to
   * resume from. Iterates through epics/sub-batches to find the epic +
   * generationMode that corresponds to the given batch number, then builds
   * the full batch input state (including global context and accumulated
   * coverage from past batches).
   */
  private rebuildBatchInputForRetry(
    runId: string,
    projectId: string,
    config: any,
    currentBatch: number,
  ): BatchInput | null {
    const requirementIds: string[] = config.requirementIds || [];
    const flowIds: string[] = config.flowIds || [];

    const allIndex = buildRequirementIndex(projectId);
    const selectedIds = selectedRequirementAndFlowIds(requirementIds, flowIds);
    const { epics, rootGroups } = groupRequirementsByEpic(allIndex, selectedIds);
    const requirements = requirementRepo.listByProject(projectId);
    const allFlowStories = requirements.filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');
    const selectedFlowSet = new Set(flowIds);
    const filteredFlowStories = selectedFlowSet.size > 0
      ? allFlowStories.filter(s => selectedFlowSet.has(s.id))
      : allFlowStories;
    const businessFlows = buildBlueprintsFromFlowStories({ flowStories: filteredFlowStories });
    const reqMap = new Map(requirements.map(r => [r.id, r]));

    // Compute total sub-batches: 1 per epic (component + flow merged, mixed mode)
    let totalSubBatches = 0;
    for (const epic of epics) {
      const childIds = rootGroups.get(epic.id) ?? [];
      const hasComponentStories = childIds.some(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && !r.isFlow;
      });
      const hasFlowStories = childIds.some(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
      });
      if (hasComponentStories || hasFlowStories) totalSubBatches++;
    }

    // Find the epic for the current batch number (mixed mode: 1 batch per epic)
    let batchCounter = 0;
    let failedEpic: any = null;
    let failedStoryIds: string[] = [];

    for (const epic of epics) {
      const childIds = rootGroups.get(epic.id) ?? [];
      const componentStoryIds = childIds.filter(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && !r.isFlow;
      });
      const flowStoryIds = childIds.filter(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
      });
      const combinedStoryIds = [...componentStoryIds, ...flowStoryIds];

      if (combinedStoryIds.length > 0) {
        batchCounter++;
        if (batchCounter === currentBatch) {
          failedEpic = epic;
          failedStoryIds = combinedStoryIds;
          break;
        }
      }
    }

    if (!failedEpic) {
      Log.for('orchestrator').error(`Could not find epic for batch ${currentBatch} (total ${totalSubBatches} sub-batches)`);
      return null;
    }

    const flowReferencedComponentContext = this.buildFlowReferencedComponentContext(selectedFlowSet, requirements, reqMap);

    // Rebuild global context (same as continueRemainingBatches)
    const globalStats = {
      totalRequirements: requirements.length,
      totalEpics: epics.length,
      totalFlows: allFlowStories.length,
    };
    const globalEpicIndex: GlobalEpicEntry[] = epics.map(epic => {
      const childIds = rootGroups.get(epic.id) ?? [];
      const childReqSet = new Set(childIds);
      const childReqs = requirements.filter(r => childReqSet.has(r.id));
      const epicFlowCount = allFlowStories.filter(s =>
        childReqSet.has(s.id) || childReqSet.has(s.parentId || '')
      ).length;
      const statusBreakdown: Record<string, number> = {};
      for (const r of childReqs) {
        statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + 1;
      }
      const stories = childReqs.filter(r => r.level === 'story');
      const storyIds = new Set(stories.map(s => s.id));
      const allAcs = requirements.filter(r => storyIds.has(r.parentId) && r.level === 'ac');
      // ACs inherit flow status from their parent story — the DB does not set
      // isFlow on AC records individually.
      const flowStoryIds = new Set(stories.filter((s: any) => s.isFlow).map(s => s.id));
      const nonFlowAcCount = allAcs.filter(a => !a.isFlow && !flowStoryIds.has(a.parentId)).length;
      const flowAcCount = allAcs.filter(a => a.isFlow || flowStoryIds.has(a.parentId)).length;
      return {
        epicId: epic.id, title: epic.title,
        requirementCount: childReqs.length,
        storyCount: stories.length,
        nonFlowAcCount, flowAcCount,
        flowCount: epicFlowCount, statusBreakdown,
        children: childReqs.map(r => ({
          id: r.id, title: r.title, level: r.level, isFlow: r.isFlow ?? false,
          acs: r.level === 'story'
            ? allAcs.filter(a => a.parentId === r.id)
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map(a => ({ id: a.id, title: a.title, level: 'ac', isFlow: a.isFlow || flowStoryIds.has(a.parentId) || false }))
            : undefined,
        })),
      };
    });

    // Load accumulated coverage from past agent logs
    const accumulatedCoverage = new Map<string, PreviousBatchCoverageSummary>();
    try {
      const pastAnalystLogs = pipelineRepo.getAgentLogs(runId, 'test_analyst');
      for (const logEntry of pastAnalystLogs) {
        const tcs: any[] = logEntry.output_data?.testConditions ?? [];
        for (const tc of tcs) {
          if (tc.id && tc.condition && tc.requirementId) {
            mergeCoverage(accumulatedCoverage, tc);
          }
        }
      }
      const pastQualityLogs = pipelineRepo.getAgentLogs(runId, 'quality_manager');
      for (const logEntry of pastQualityLogs) {
        const cases: any[] = logEntry.output_data?.finalTestCases ?? [];
        for (const tc of cases) {
          mergeCaseCoverage(accumulatedCoverage, tc);
        }
      }
    } catch (e) {
      Log.for('orchestrator').warn(`Failed to load past coverage for retry: ${e}`);
    }

    const previousBatchCoverageSummary = [...accumulatedCoverage.values()];

    const batchInput: BatchInput = {
      batchIndex: currentBatch - 1,
      inputState: {
        ...this.buildBatchInputState(
          runId, projectId, requirementIds, requirements, rootGroups, failedEpic,
          currentBatch - 1, totalSubBatches, businessFlows,
          config.mode || 'auto', config.flowIds,
          'mixed', failedStoryIds, flowReferencedComponentContext,
        ),
        flowReferencedComponentContext: flowReferencedComponentContext.size > 0
          ? Object.fromEntries(flowReferencedComponentContext)
          : undefined,
        globalStats,
        globalEpicIndex,
        previousBatchCoverageSummary: previousBatchCoverageSummary.length > 0
          ? previousBatchCoverageSummary
          : undefined,
      },
    };

    return batchInput;
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
    const selectedIds = selectedRequirementAndFlowIds(requirementIds, flowIds);
    const { epics, rootGroups, totalBatches } = groupRequirementsByEpic(allIndex, selectedIds);
    const requirements = requirementRepo.listByProject(projectId);
    const allFlowStories = requirements
      .filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');
    const selectedFlowSet = new Set(flowIds);
    const filteredFlowStories = selectedFlowSet.size > 0
      ? allFlowStories.filter(s => selectedFlowSet.has(s.id))
      : allFlowStories;
    const businessFlows = buildBlueprintsFromFlowStories({ flowStories: filteredFlowStories });
    const reqMap = new Map(requirements.map(r => [r.id, r]));

    // 计算总子批次数：每个 epic 一个批次（component + flow 合并，mixed mode）
    let totalSubBatches = 0;
    for (const epic of epics) {
      const childIds = rootGroups.get(epic.id) ?? [];
      const hasComponentStories = childIds.some(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && !r.isFlow;
      });
      const hasFlowStories = childIds.some(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
      });
      if (hasComponentStories || hasFlowStories) totalSubBatches++;
    }

    const flowReferencedComponentContext = this.buildFlowReferencedComponentContext(selectedFlowSet, requirements, reqMap);

    // Rebuild global context
    const globalStats = {
      totalRequirements: requirements.length,
      totalEpics: epics.length,
      totalFlows: allFlowStories.length,
    };

    // L1 索引层重建
    const globalEpicIndex: GlobalEpicEntry[] = epics.map(epic => {
      const childIds = rootGroups.get(epic.id) ?? [];
      const childReqSet = new Set(childIds);
      const childReqs = requirements.filter(r => childReqSet.has(r.id));
      const epicFlowCount = allFlowStories.filter(s =>
        childReqSet.has(s.id) || childReqSet.has(s.parentId || '')
      ).length;
      const statusBreakdown: Record<string, number> = {};
      for (const r of childReqs) {
        statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + 1;
      }
      const stories = childReqs.filter(r => r.level === 'story');
      const storyIds = new Set(stories.map(s => s.id));
      const allAcs = requirements.filter(r => storyIds.has(r.parentId) && r.level === 'ac');
      // ACs inherit flow status from their parent story — the DB does not set
      // isFlow on AC records individually.
      const flowStoryIds = new Set(stories.filter((s: any) => s.isFlow).map(s => s.id));
      const nonFlowAcCount = allAcs.filter(a => !a.isFlow && !flowStoryIds.has(a.parentId)).length;
      const flowAcCount = allAcs.filter(a => a.isFlow || flowStoryIds.has(a.parentId)).length;
      return {
        epicId: epic.id, title: epic.title,
        requirementCount: childReqs.length,
        storyCount: stories.length,
        nonFlowAcCount, flowAcCount,
        flowCount: epicFlowCount, statusBreakdown,
        children: childReqs.map(r => ({
          id: r.id, title: r.title, level: r.level, isFlow: r.isFlow ?? false,
          acs: r.level === 'story'
            ? allAcs
                .filter(a => a.parentId === r.id)
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map(a => ({ id: a.id, title: a.title, level: 'ac', isFlow: a.isFlow || flowStoryIds.has(a.parentId) || false }))
            : undefined,
        })),
      };
    });

    const allResults: BatchResult[] = [];
    // L2 累积：从已完成的 agent logs 加载，避免 resume 后跨批次防重复失效
    const accumulatedCoverage = new Map<string, PreviousBatchCoverageSummary>();
    try {
      const pastAnalystLogs = pipelineRepo.getAgentLogs(runId, 'test_analyst');
      for (const logEntry of pastAnalystLogs) {
        const tcs: any[] = logEntry.output_data?.testConditions ?? [];
        for (const tc of tcs) {
          if (tc.id && tc.condition && tc.requirementId) {
            mergeCoverage(accumulatedCoverage, tc);
          }
        }
      }
      // 同步加载历史 finalTestCases，让 Designer 跨批次 case 级去重生效
      const pastQualityLogs = pipelineRepo.getAgentLogs(runId, 'quality_manager');
      for (const logEntry of pastQualityLogs) {
        const cases: any[] = logEntry.output_data?.finalTestCases ?? [];
        for (const tc of cases) {
          mergeCaseCoverage(accumulatedCoverage, tc);
        }
      }
      if (accumulatedCoverage.size > 0) {
        Log.for('orchestrator').info(`Pre-loaded coverage for ${accumulatedCoverage.size} requirements from past batches before continuing`);
      }
    } catch (e) {
      Log.for('orchestrator').warn(`Failed to pre-load past batch coverage: ${e}`);
    }

    // Iterate through ALL epics (not sliced) and count sub-batches.
    // Only process batches with batchCounter > startFrom (i.e., batches
    // AFTER the one that just completed/retried). This fixes the bug where
    // epics.slice(startFrom) treated the batch number as an epic index,
    // causing sub-batches within the same epic to be skipped.
    let batchCounter = 0;
    for (let i = 0; i < epics.length; i++) {
      if (ctx.isAborted()) break;
      const epic = epics[i];
      const childIds = rootGroups.get(epic.id) ?? [];

      // 合并 component 和 flow stories 为一个批次
      const componentStoryIds = childIds.filter(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && !r.isFlow;
      });
      const flowStoryIds = childIds.filter(id => {
        const r = reqMap.get(id);
        return r && r.level === 'story' && r.isFlow && r.status === 'APPROVED';
      });
      const combinedStoryIds = [...componentStoryIds, ...flowStoryIds];

      if (combinedStoryIds.length > 0) {
        batchCounter++;
        if (batchCounter > startFrom) {
          if (ctx.isAborted()) break;

          ctx.scope.setBatch(batchCounter, totalSubBatches);
          pipelineRepo.updateCurrentBatch(runId, batchCounter);
          pipelineRepo.updateThreadId(runId, `${runId}-batch-${epic.id}-mixed`);

          const previousBatchCoverageSummary = [...accumulatedCoverage.values()];

          const batchInput = {
            batchIndex: batchCounter - 1,
            inputState: {
              ...this.buildBatchInputState(runId, projectId, requirementIds, requirements, rootGroups, epic, batchCounter - 1, totalSubBatches, businessFlows, config.mode || 'auto', config.flowIds, 'mixed', combinedStoryIds, flowReferencedComponentContext),
              flowReferencedComponentContext: flowReferencedComponentContext.size > 0
                ? Object.fromEntries(flowReferencedComponentContext)
                : undefined,
              globalStats,
              globalEpicIndex,
              previousBatchCoverageSummary: previousBatchCoverageSummary.length > 0 ? previousBatchCoverageSummary : undefined,
            },
          };

          const outcome = await ctx.session.startBatch(batchInput);
          if (outcome.type === 'interrupt') {
            ctx.scope.flushAndPersistThinking();
            pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
            return { allResults, interrupted: true };
          }

          // 累积本批次 conditions 摘要
          const batchConditions: any[] = outcome.result.lastState?.testConditions ?? [];
          for (const tc of batchConditions) {
            mergeCoverage(accumulatedCoverage, tc);
          }
          // 累积本批次 finalTestCases 标题+级别
          const batchCases: any[] = outcome.result.lastState?.finalTestCases ?? [];
          for (const tc of batchCases) {
            mergeCaseCoverage(accumulatedCoverage, tc);
          }

          allResults.push(outcome.result);
          ctx.sendEvent('batch:complete', {
            batch: batchCounter, total: totalSubBatches,
            testCases: outcome.result.cases.length,
            mode: 'mixed',
          });
        }
      }
    }
    return { allResults, interrupted: false };
  }

  /**
   * For each selected flow, collect its referenced component stories (with
   * ACs) so they can be injected into the batch prompt WITHOUT creating
   * separate batches for them. Shared by `start` and `continueRemainingBatches`.
   *
   * P4 dedup: component story contexts are built once globally and shared by
   * reference across flows, so a story referenced by N flows is constructed
   * once (not N times). AC serialization is slimmed to only `id` + `title`;
   * the LLM can call requirement_detail_query for full AC Given/When/Then text.
   */
  private buildFlowReferencedComponentContext(
    selectedFlowSet: Set<string>,
    requirements: any[],
    reqMap: Map<string, any>,
  ): Map<string, any[]> {
    const ctx = new Map<string, any[]>();
    if (selectedFlowSet.size === 0) return ctx;

    // Step 1: Collect each flow's referenced component story IDs, and the
    // global union of all referenced IDs (for one-shot context building).
    const flowToStoryIds = new Map<string, string[]>();
    const allReferencedStoryIds = new Set<string>();
    for (const flowId of selectedFlowSet) {
      const flowACs = requirements.filter(r => r.parentId === flowId && r.level === 'ac');
      const referencedStoryIds: string[] = [];
      const seen = new Set<string>();
      for (const ac of flowACs) {
        for (const refId of ac.relatedRequirementIds ?? []) {
          if (seen.has(refId)) continue;
          const refReq = reqMap.get(refId);
          if (refReq && refReq.level === 'story' && !refReq.isFlow) {
            referencedStoryIds.push(refId);
            seen.add(refId);
            allReferencedStoryIds.add(refId);
          }
        }
      }
      if (referencedStoryIds.length > 0) {
        flowToStoryIds.set(flowId, referencedStoryIds);
      }
    }

    // Step 2: Build context for each unique component story ONCE.
    // ACs include description (Given/When/Then) and flowType so the prompt
    // builder can parse them into structured fields — no tool calls needed.
    const storyContextCache = new Map<string, any>();
    for (const storyId of allReferencedStoryIds) {
      const story = reqMap.get(storyId)!;
      const epicReq = reqMap.get(story.parentId ?? '');
      const acs = requirements
        .filter(r => r.parentId === storyId && r.level === 'ac')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(ac => ({
          id: ac.id,
          title: ac.title,
          description: ac.description ?? '',
          flowType: ac.flowType ?? 'atomic',
        }));
      storyContextCache.set(storyId, {
        id: story.id,
        title: story.title,
        description: story.description ?? '',
        epicId: epicReq?.id ?? '',
        epicTitle: epicReq?.title ?? '',
        isFlow: story.isFlow ?? false,
        acceptanceCriteria: acs,
      });
    }

    // Step 3: Each flow stores references to the shared story contexts
    // (no duplicate construction per flow).
    for (const [flowId, storyIds] of flowToStoryIds) {
      ctx.set(flowId, storyIds.map(id => storyContextCache.get(id)!));
    }
    return ctx;
  }

  private buildBatchInputState(
    runId: string,
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
    generationMode: 'component' | 'flow' | 'mixed' = 'component',
    selectedStoryIds: string[] = [],
    flowReferencedComponentContext: Map<string, any[]> = new Map(),
  ) {
    const selectedStoryIdSet = new Set(selectedStoryIds);
    // Filter requirements to only include selected stories and their ACs
    const batchReqs = requirements.filter((r: any) => {
      if (r.level === 'story') {
        return selectedStoryIdSet.has(r.id);
      }
      if (r.level === 'ac') {
        return selectedStoryIdSet.has(r.parentId);
      }
      return false;
    });

    // IndexEntry only has {id, parent, level, title} — look up description
    // from the full requirements array.
    const epicReq = requirements.find((r: any) => r.id === epic.id);
    const epicData = { id: epic.id, title: epic.title, description: epicReq?.description ?? '' };

    // Build currentBatch (used by Designer/Quality prompts and validation).
    // AC records inherit isFlow from their parent story — the DB does not set
    // isFlow on ACs individually (see comment above at the flowAcCount fix).
    const storyIsFlow = new Map<string, boolean>();
    for (const r of batchReqs) {
      if (r.level === 'story') storyIsFlow.set(r.id, r.isFlow ?? false);
    }
    const currentBatch = batchReqs.map((r: any) => {
      const acs = r.level === 'story'
        ? requirements
            .filter((c: any) => c.parentId === r.id && c.level === 'ac')
            .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
            .map((ac: any) => ({
              id: ac.id,
              title: ac.title,
              description: ac.description ?? '',
              flowType: ac.flowType ?? 'atomic',
              relatedRequirementIds: ac.relatedRequirementIds ?? [],
            }))
        : [];
      return {
        id: r.id,
        title: r.title,
        level: r.level ?? '',
        parentId: r.parentId ?? '',
        description: r.description ?? '',
        isFlow: r.level === 'ac'
          ? (r.isFlow || storyIsFlow.get(r.parentId) || false)
          : (r.isFlow ?? false),
        acceptanceCriteria: acs,
      };
    });

    // Keep businessFlowBlueprints for the state (used by Designer/Quality prompts).
    // Blueprints are keyed by AC id (one per AC path), so filter by AC ids
    // under the flow stories in this batch.
    let filteredBusinessFlows: any[] = [];
    if (generationMode === 'flow' || generationMode === 'mixed') {
      const batchAcIds = new Set<string>();
      for (const story of currentBatch.filter(r => r.isFlow)) {
        for (const ac of (story.acceptanceCriteria ?? [])) {
          batchAcIds.add(ac.id);
        }
      }
      filteredBusinessFlows = businessFlows.filter((f: any) => batchAcIds.has(f.id));
    }

    // Build the pre-assembled analystInput JSON — one source of truth for
    // the Analyst's user prompt, avoiding reconstruction in buildAnalystUserMessage.
    // Flow mode carries referencedComponentContext (for real dependency
    // conditionIds) — see analyst-input-builder.ts.
    // filteredBusinessFlows is passed so the LLM sees the exact flowId values
    // to use in flowStepRefs (prevents hallucinated flowId duplicates).
    const analystInput = buildAnalystInput({
      epic: epicData,
      currentBatch,
      flowReferencedComponentContext: flowReferencedComponentContext.size > 0
        ? Object.fromEntries(flowReferencedComponentContext)
        : undefined,
      generationMode,
      flowBlueprints: filteredBusinessFlows,
    });

    // Look up the real project name (single PK query). Previously this used
    // `epic.title`, which leaked the epic title into the Project field of
    // the prompt and confused the LLM about scope.
    const projectRow = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string } | undefined;
    const projectName = projectRow?.name ?? 'Unknown Project';

    return {
      projectId,
      runId,
      mode,
      requirementIds,
      epic: epicData,
      currentBatch,
      analystInput,
      batchContext: { currentBatch: i + 1, totalBatches, processedCount: i },
      projectContext: { name: projectName, pages: [], endpoints: [] },
      businessFlowBlueprints: filteredBusinessFlows,
      selectedFlowIds,
      generationMode,
      phase: 'analysis' as const,
      errors: [],
    };
  }
}
