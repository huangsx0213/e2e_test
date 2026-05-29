import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { Semaphore } from '../../../../shared/ai/semaphore.ts';
import { createAIProviderWithFallback } from '../../../../shared/ai/provider.ts';
import { computePromptVersion } from '../../../../shared/ai/prompt-version.ts';
import { createTestGenerationPipeline } from '../../../../shared/ai-test-gen/test-generation.ts';
import {
  TestAnalystRole,
  TestDesignerRole,
  QualityManagerRole,
} from '../../../../shared/ai/roles/index.ts';
import { useCacheStore } from '../../../../shared/ai/cache.ts';
import { db } from '../../../shared/db/client.ts';
import { requirementRepo } from '../../requirements/repository.ts';
import { buildRequirementIndex } from '../../requirements/index-generator.ts';
import { groupRequirementsByEpic } from './requirement-grouper.ts';
import { deduplicateTestCases } from './result-deduplicator.ts';
import { buildFallbackConfigs } from './fallback-config-builder.ts';
import { nlCaseRepo } from '../../nl-cases/repository.ts';
import { buildBusinessFlowBlueprints } from '../business-flow-blueprint.ts';
import { businessFlowRepo } from '../../business-flows/repository.ts';
import { pipelineRepo, decryptApiKey } from '../infrastructure/db/test-gen-repository.ts';
import type { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';
import type { PipelineBusinessFlowBlueprint, Requirement } from '../../../../shared/contracts/index.ts';
import { randomId } from '../../../shared/utils/index.ts';
import { TestGenExecutionScope } from '../test-gen-scope.ts';
import { TestGenSession } from './test-gen-session.ts';
import { InteractiveResolver, AutoResolver } from './checkpoint-resolver.ts';
import { BatchOrchestrator } from './batch-orchestrator.ts';

export class TestGenService {
  private readonly abortedRuns = new Set<string>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly concurrencySlot: Semaphore;
  private readonly maxConcurrent: number;

  constructor(
    private readonly sseGateway: SSEGateway,
    maxConcurrent = 3,
  ) {
    this.maxConcurrent = maxConcurrent;
    this.concurrencySlot = new Semaphore(maxConcurrent);
    useCacheStore(pipelineRepo.getCacheStore());
  }

  abortRun(runId: string): void {
    this.abortedRuns.add(runId);
    this.abortControllers.get(runId)?.abort();
    pipelineRepo.markRunFailed(runId);
  }

  resumeRun(runId: string, action: string, feedback?: string, editedData?: unknown): void {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row || row.status !== 'WAITING_REVIEW') {
      throw new Error('Test gen is not waiting for review');
    }

    pipelineRepo.insertAuditLog(runId, row.phase, action, editedData);
    pipelineRepo.setRunRunning(runId);

    this.resumePipeline(runId, row, action, feedback, editedData).catch(err => {
      console.error(`[TestGenService] Resume failed for ${runId}:`, err);
      pipelineRepo.markRunFailed(runId);
      this.sseGateway.emit(runId, 'pipeline:error', {
        phase: 'resume',
        message: err.message,
        recoverable: false,
      });
    });
  }

  deleteRun(runId: string): void {
    this.abortedRuns.add(runId);
    this.abortControllers.get(runId)?.abort();
    pipelineRepo.deleteRun(runId);
    this.sseGateway.cleanup(runId);
  }

  async recoverInterruptedRuns(): Promise<void> {
    const waitingRuns = pipelineRepo.getWaitingRuns();
    if (waitingRuns.length === 0) return;

    console.log(`[TestGenService] Found ${waitingRuns.length} WAITING_REVIEW run(s) to expose for resume`);

    for (const run of waitingRuns) {
      this.sseGateway.emit(run.id, 'checkpoint:waiting', {
        checkpointId: `${run.id}-cp-${run.phase}`,
        type: run.phase,
        summary: run.checkpoint_data
          ? ('conditions' in run.checkpoint_data
              ? `${(run.checkpoint_data as any).conditions?.length || 0} Test Conditions`
              : 'cases' in run.checkpoint_data
                ? `${(run.checkpoint_data as any).cases?.length || 0} Draft Cases`
                : 'Final Review')
          : 'Awaiting Review',
        payload: run.checkpoint_data,
        recovered: true,
      });
    }
  }

  startCheckpointTimeoutMonitor(intervalMs = 60_000): void {
    setInterval(() => {
      const waitingRuns = pipelineRepo.getWaitingRuns();
      const now = Date.now();
      const TIMEOUT_MS = 30 * 60 * 1000;

      for (const run of waitingRuns) {
        const updatedAt = new Date(run.updated_at).getTime();
        if (now - updatedAt > TIMEOUT_MS) {
          console.log(`[TestGenService] Auto-abandoning stale run ${run.id} (no response in 30min)`);
          this.abortRun(run.id);
          this.sseGateway.emit(run.id, 'checkpoint:timeout', {
            checkpointId: `${run.id}-cp`,
            message: 'Review timed out after 30 minutes',
          });
        }
      }
    }, intervalMs);
  }

  private createPipelineFactory(provider: any, callbacks: any, agentOpts: any) {
    return async () => {
      return createTestGenerationPipeline(provider, {
        testAnalyst: TestAnalystRole,
        testDesigner: TestDesignerRole,
        qualityManager: QualityManagerRole,
      }, callbacks, agentOpts, new SqliteSaver(db));
    };
  }

  async startPipeline(runId: string, projectId: string, params: {
    requirementIds: string[];
    providerConfigName?: string;
    mode: string;
    flowIds?: string[];
    includeFlowCases?: boolean;
    useCache?: boolean;
  }): Promise<void> {
    const sendEvent = (event: string, data: unknown) => this.sseGateway.emit(runId, event, data);
    const aborted = () => this.abortedRuns.has(runId);
    const runMode = (params.mode || 'auto') as 'auto' | 'interactive';

    let initCompleted = false;
    let initTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      await this.concurrencySlot.acquire();
      if (aborted()) return;

      const runAbortController = new AbortController();
      this.abortControllers.set(runId, runAbortController);
      const abortSignal = runAbortController.signal;

      const { requirementIds, providerConfigName, flowIds, includeFlowCases } = params;

      const allIndex = buildRequirementIndex(projectId);
      const selectedIds = new Set(requirementIds || []);
      const { epics, rootGroups, totalBatches, selectedIndex } = groupRequirementsByEpic(allIndex, selectedIds);
      if (epics.length === 0) {
        throw new Error('No matching requirements found for selected IDs');
      }
      pipelineRepo.updateBatchCount(runId, totalBatches);

      let providerConfigRow: any;
      if (providerConfigName) {
        providerConfigRow = pipelineRepo.getProviderConfigByName(providerConfigName);
      } else {
        providerConfigRow = pipelineRepo.getActiveProviderConfig();
      }
      if (!providerConfigRow) {
        throw new Error('No active AI provider configuration found. Go to Settings → AI Provider to configure one.');
      }

      const monthlyLimit = providerConfigRow.monthly_token_limit as number | null;
      if (monthlyLimit) {
        const used = pipelineRepo.getMonthlyTokenUsage(projectId);
        if (used >= monthlyLimit) {
          throw new Error(`Monthly token limit exceeded (${used}/${monthlyLimit}). Limit resets on the 1st of next month.`);
        }
      }

      const fallbackIds = JSON.parse(providerConfigRow.fallback_config_ids || '[]') as string[];
      const fallbackConfigs = buildFallbackConfigs(pipelineRepo, fallbackIds);

      initTimer = setTimeout(() => {
        if (!initCompleted) {
          sendEvent('pipeline:error', {
            phase: 'orchestrator',
            message: 'Test gen initialization timed out. Check server logs for details.',
            recoverable: false,
          });
        }
      }, 30_000);

      const provider = createAIProviderWithFallback({
        type: providerConfigRow.type,
        endpoint: providerConfigRow.endpoint,
        apiKey: decryptApiKey(providerConfigRow.encrypted_api_key),
        deployment: providerConfigRow.deployment,
        apiVersion: providerConfigRow.api_version,
        model: providerConfigRow.model,
        fallbackConfigs: fallbackConfigs as any,
      });

      const promptVersion = computePromptVersion();
      const modelName = providerConfigRow.model || providerConfigRow.deployment || 'unknown';

      pipelineRepo.updateProviderInfo(runId, {
        providerType: providerConfigRow.type,
        modelName,
        promptVersion,
        providerConfigName: providerConfigRow.name || null,
        tokenLimit: providerConfigRow.monthly_token_limit ?? null,
      });

      const scope = new TestGenExecutionScope(runId, projectId, runMode,
        (event, data) => this.sseGateway.emit(runId, event, data));

      const pipelineCallbacks = {
        onStep: (agentName: string, stepIndex: number, stepName: string) => {
          scope.recordAgentStep(agentName, scope.currentBatch, stepIndex, stepName);
        },
        onThinking: (agentName: string, text: string) => {
          scope.recordAgentThinking(agentName, text);
        },
        onStart: (agentName: string, inputPrompt?: any) => {
          scope.recordAgentStart(agentName, scope.currentBatch, inputPrompt);
        },
        onComplete: (agentName: string, tokenUsage: any, latencyMs: number, inputPrompt?: any, outputData?: any) => {
          scope.recordAgentComplete(agentName, scope.currentBatch, { tokenUsage, latencyMs, inputPrompt, outputData });
        },
      };

      const agentOpts = {
        promptVersion,
        modelName,
        tokenLimit: providerConfigRow.monthly_token_limit ?? null,
        timeoutMs: 300_000,
        useCache: params.useCache ?? false,
        signal: abortSignal,
      };

      const pipelineFactory = this.createPipelineFactory(provider, pipelineCallbacks, agentOpts);

      initCompleted = true;
      if (initTimer) clearTimeout(initTimer);

      const requirements = requirementRepo.listByProject(projectId);
      const allProjectFlows = businessFlowRepo.listByProject(projectId);
      const selectedFlowSet = new Set(flowIds || []);
      const filteredFlows = selectedFlowSet.size > 0
        ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
        : allProjectFlows;
      const businessFlows = buildBusinessFlowBlueprints({
        flows: filteredFlows,
        requirements,
      });

      sendEvent('phase:start', { phase: 'preparation', message: `Processing ${selectedIndex.length} requirements in ${totalBatches} batch(es)` });
      sendEvent('pipeline:context', { flows: businessFlows.length, indexEntries: selectedIndex.length });

      const avgTokensPerReq = 1000;
      const estimated = selectedIndex.length * avgTokensPerReq;
      const tokenLimit = providerConfigRow.monthly_token_limit as number | null;
      if (tokenLimit) {
        const budgetMsg = estimated > tokenLimit
          ? `Estimated token usage (${estimated}) exceeds limit (${tokenLimit}). Some batches may fail.`
          : `Estimated token usage (${estimated}) within limit (${tokenLimit}).`;
        sendEvent('pipeline:budget', { estimated, limit: tokenLimit, warning: estimated > tokenLimit, message: budgetMsg });
      } else {
        sendEvent('pipeline:budget', { estimated, limit: null, warning: false, message: `Estimated ${estimated} tokens (no limit configured)` });
      }

      const preparationLogId = randomId('log');
      const preparationOutput = {
        initLogs: [
          { type: 'pipeline:context', data: { flows: businessFlows.length, indexEntries: selectedIndex.length }, timestamp: new Date().toISOString() },
          { type: 'pipeline:budget', data: { estimated, limit: tokenLimit }, timestamp: new Date().toISOString() },
          { type: 'phase:start', data: { phase: 'preparation', message: `Processing ${selectedIndex.length} requirements in ${totalBatches} batch(es)` }, timestamp: new Date().toISOString() },
        ],
        requirementCount: selectedIndex.length,
        totalBatches,
        estimatedTokens: estimated,
        flowCases: businessFlows.length,
      };
      db.prepare(`
        INSERT INTO test_gen_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
        VALUES (?, ?, 0, 'preparation', '', NULL, ?, NULL, 0, NULL, 'COMPLETED')
      `).run(preparationLogId, runId, JSON.stringify(preparationOutput));

      const resolver = runMode === 'interactive'
        ? new InteractiveResolver(
            (rid, data, phase) => pipelineRepo.setCheckpointData(rid, data, phase),
            this.sseGateway,
          )
        : new AutoResolver();

      const session = new TestGenSession(runId, pipelineFactory, resolver, {
        mode: runMode,
        onEvent: sendEvent,
        signal: abortSignal,
      });

      let allResults: any[] = [];
      let actualBatches = 0;

      if (includeFlowCases) {
        const reqIdSet = new Set<string>();
        for (const flow of businessFlows) {
          for (const step of flow.steps) {
            reqIdSet.add(step.requirementId);
          }
        }

        const expandedIds = new Set<string>();
        const addDescendants = (parentId: string) => {
          for (const req of requirements) {
            if (req.parentId === parentId && !expandedIds.has(req.id)) {
              expandedIds.add(req.id);
              addDescendants(req.id);
            }
          }
        };
        for (const id of reqIdSet) {
          expandedIds.add(id);
          addDescendants(id);
        }

        const flowRequirements = requirements.filter(r => expandedIds.has(r.id));
        scope.setBatch(1, 1);

        sendEvent('phase:start', { phase: 'flow-batch', message: `Processing ${businessFlows.length} flow(s) with ${flowRequirements.length} expanded requirements` });

        const outcome = await session.startBatch(0, {
          projectId,
          requirementIds: Array.from(expandedIds),
          currentBatch: flowRequirements,
          batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
          projectContext: { name: 'Business Flow Batch', pages: [], endpoints: [] },
          businessFlowBlueprints: businessFlows,
          phase: 'analysis',
          errors: [],
        });

        if (outcome.type === 'interrupt') {
          pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);
          pipelineRepo.setCheckpointData(runId, outcome.interrupt.payload, outcome.interrupt.phase);
          return;
        }

        if (outcome.result.lastState) allResults.push(outcome.result.lastState);
        actualBatches = 1;
        sendEvent('batch:complete', { batch: 1, total: 1, testCases: outcome.result.cases.length ?? 0 });
      } else {
        const orchestrator = new BatchOrchestrator(session, {
          onBatchStart: (batchIndex) => {
            scope.setBatch(batchIndex + 1, totalBatches);
            pipelineRepo.updateCurrentBatch(runId, batchIndex + 1);
          },
          onBatchComplete: (batchIndex, result) => {
            if (result?.lastState) allResults.push(result.lastState);
            actualBatches++;
            sendEvent('batch:complete', { batch: batchIndex + 1, total: totalBatches, testCases: result?.cases.length ?? 0 });
          },
          onBatchError: (batchIndex, err) => {
            sendEvent('pipeline:error', { phase: 'batch', batch: batchIndex + 1, message: err.message, recoverable: true });
          },
          onBatchInterrupt: (batchIndex, interrupt) => {
            pipelineRepo.updateThreadId(runId, interrupt.threadId);
            pipelineRepo.setCheckpointData(runId, interrupt.payload, interrupt.phase);
          },
          isAborted: aborted,
        });

        const batchInputs = epics.map((epic, i) => ({
          batchIndex: i,
          inputState: {
            projectId,
            requirementIds,
            currentBatch: requirements.filter(r => new Set(rootGroups.get(epic.id)!).has(r.id)),
            batchContext: { currentBatch: i + 1, totalBatches, processedCount: i },
            projectContext: { name: epic.title, pages: [], endpoints: [] },
            businessFlowBlueprints: businessFlows,
            phase: 'analysis',
            errors: [],
          },
        }));

        const summary = await orchestrator.runAll(batchInputs);
        actualBatches = summary.actualBatches;

        if (summary.interruptedBatch) {
          return;
        }
      }

      if (!aborted()) {
        const { allCases, conflicts, removedCount } = deduplicateTestCases(allResults.flatMap((r: any) => r.finalTestCases || []));
        if (removedCount > 0) {
          sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length, conflicts });
        }

        for (const tc of allCases) {
          nlCaseRepo.save({ ...tc, projectId });
        }

        scope.markComplete({ totalCases: allCases.length, totalBatches: actualBatches || totalBatches });
      }
    } catch (err: any) {
      if (initTimer && !initCompleted) clearTimeout(initTimer);
      if (!aborted()) {
        sendEvent('pipeline:error', { phase: 'orchestrator', message: err.message, recoverable: false });
      }
    } finally {
      this.concurrencySlot.release();
      this.abortedRuns.delete(runId);
      this.abortControllers.delete(runId);
      this.sseGateway.cleanup(runId);
    }
  }

  private async resumePipeline(
    runId: string,
    runRow: { thread_id: string; phase: string; checkpoint_data: any; config: any; project_id: string; mode: string; current_batch: number },
    action: string,
    feedback?: string,
    editedData?: unknown,
  ): Promise<void> {
    const sendEvent = (event: string, data: unknown) => this.sseGateway.emit(runId, event, data);
    const aborted = () => this.abortedRuns.has(runId);
    const runMode = (runRow.mode || 'auto') as 'auto' | 'interactive';

    const runAbortController = new AbortController();
    this.abortControllers.set(runId, runAbortController);
    const abortSignal = runAbortController.signal;

    try {
      await this.concurrencySlot.acquire();
      if (aborted()) return;

      const config = runRow.config || {};
      const { providerConfigName } = config;

      const providerConfigRow = providerConfigName
        ? pipelineRepo.getProviderConfigByName(providerConfigName)
        : pipelineRepo.getActiveProviderConfig();
      if (!providerConfigRow) throw new Error('No active AI provider configuration found');

      const fallbackIds = JSON.parse(providerConfigRow.fallback_config_ids || '[]') as string[];
      const fallbackConfigs = buildFallbackConfigs(pipelineRepo, fallbackIds);

      const provider = createAIProviderWithFallback({
        type: providerConfigRow.type as any,
        endpoint: providerConfigRow.endpoint,
        apiKey: decryptApiKey(providerConfigRow.encrypted_api_key),
        deployment: providerConfigRow.deployment,
        apiVersion: providerConfigRow.api_version,
        model: providerConfigRow.model,
        fallbackConfigs: fallbackConfigs as any,
      });

      const promptVersion = computePromptVersion();
      const modelName = providerConfigRow.model || providerConfigRow.deployment || 'unknown';
      const scope = new TestGenExecutionScope(runId, runRow.project_id, runMode, sendEvent);

      const pipelineCallbacks = {
        onStep: (agentName: string, stepIndex: number, stepName: string) => scope.recordAgentStep(agentName, scope.currentBatch, stepIndex, stepName),
        onThinking: (agentName: string, text: string) => scope.recordAgentThinking(agentName, text),
        onStart: (agentName: string, inputPrompt?: any) => scope.recordAgentStart(agentName, scope.currentBatch, inputPrompt),
        onComplete: (agentName: string, tokenUsage: any, latencyMs: number, inputPrompt?: any, outputData?: any) => scope.recordAgentComplete(agentName, scope.currentBatch, { tokenUsage, latencyMs, inputPrompt, outputData }),
      };

      const agentOpts = {
        promptVersion,
        modelName,
        tokenLimit: providerConfigRow.monthly_token_limit ?? null,
        timeoutMs: 300_000,
        useCache: config.useCache ?? false,
        signal: abortSignal,
      };

      const pipelineFactory = this.createPipelineFactory(provider, pipelineCallbacks, agentOpts);

      const resolver = new InteractiveResolver(
        (rid, data, phase) => pipelineRepo.setCheckpointData(rid, data, phase),
        this.sseGateway,
      );

      const session = new TestGenSession(runId, pipelineFactory, resolver, {
        mode: runMode,
        onEvent: sendEvent,
        signal: abortSignal,
      });

      const outcome = await session.resumeBatch(
        runRow.current_batch || 0,
        runRow.thread_id,
        { action, feedback, edits: editedData as Record<string, unknown> | undefined },
        runRow.checkpoint_data || {},
      );

      if (outcome.type === 'interrupt') {
        pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);
        pipelineRepo.setCheckpointData(runId, outcome.interrupt.payload, outcome.interrupt.phase);
        sendEvent('checkpoint:waiting', {
          checkpointId: `${runId}-cp-${outcome.interrupt.checkpointNumber}`,
          checkpointNumber: outcome.interrupt.checkpointNumber,
          type: outcome.interrupt.phase,
          payload: outcome.interrupt.payload,
        });
      } else if (outcome.type === 'complete') {
        if (outcome.result?.lastState) {
          const { allCases } = deduplicateTestCases(
            (outcome.result.lastState.finalTestCases || []) as any[]
          );
          for (const tc of allCases) {
            nlCaseRepo.save({ ...tc, projectId: runRow.project_id });
          }
          scope.markComplete({ totalCases: allCases.length, totalBatches: 1 });
        } else {
          scope.markComplete({ totalCases: 0, totalBatches: 1 });
        }
      }
    } finally {
      this.concurrencySlot.release();
      this.abortedRuns.delete(runId);
      this.abortControllers.delete(runId);
      this.sseGateway.cleanup(runId);
    }
  }
}
