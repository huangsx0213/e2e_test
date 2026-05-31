import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { Semaphore } from '../../../../shared/ai/semaphore.ts';
import { createAIProviderWithFallback } from '../../../../shared/ai/provider.ts';
import { computePromptVersion } from '../../../../shared/ai/prompt-version.ts';
import { createTestGenerationPipeline, createToolRegistry, createOrchestratedPipeline, createOrchestratorGraph } from '../../../../shared/ai-test-gen/test-generation.ts';
import { orchestratorNode } from './orchestrator-node.ts';
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
import { ToolRegistry } from '../../../../shared/ai/tool-registry.ts';

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

  async saveCheckpointEdits(runId: string, editedData: Record<string, unknown>, checkpointNumber: number): Promise<void> {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row) {
      console.error(`[TestGenService] Run ${runId} not found, cannot save edits`);
      return;
    }
    if (!row.thread_id) {
      console.error(`[TestGenService] No thread_id for run ${runId}, status: ${row.status}, cannot save edits`);
      return;
    }
    if (row.status === 'COMPLETED') {
      console.log(`[TestGenService] Saving edits for completed run ${runId}`);
    }

    // Map frontend payload keys → graph state keys
    const stateKeys: Record<string, unknown> = {};
    if (checkpointNumber === 1) {
      if (editedData.conditions) stateKeys.testConditions = editedData.conditions as any;
      if (editedData.analysis) stateKeys.requirementAnalysis = editedData.analysis as any;
    } else if (checkpointNumber === 2) {
      if (editedData.cases) stateKeys.draftTestCases = editedData.cases as any;
    } else if (checkpointNumber === 3) {
      if (editedData.cases) stateKeys.finalTestCases = editedData.cases as any;
      if (editedData.matrix) stateKeys.coverageMatrix = editedData.matrix as any;
    }

    if (Object.keys(stateKeys).length === 0) return;

    await this.applyStateUpdate(row.thread_id, stateKeys);

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

      // Persist edits to agent log so completed-run history loads edited data
      const AGENT_NAMES: Record<number, string> = { 1: 'test_analyst', 2: 'test_designer', 3: 'quality_manager' };
      const agentName = AGENT_NAMES[checkpointNumber];
      if (agentName) {
        pipelineRepo.updateAgentLogOutput(runId, agentName, stateKeys);
      }
    } catch (err) {
      console.error(`[TestGenService] Failed to refresh checkpoint state after edit for ${runId}:`, err);
    }
  }

  private async applyStateUpdate(threadId: string, stateKeys: Record<string, unknown>): Promise<void> {
    const dummyProvider = {
      chat: async () => ({ content: '', tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, reasoning_tokens: 0 } }),
      getModelName: () => 'dummy',
      getProviderType: () => 'dummy',
    } as any;
    const graph = await this.createOrchestratedPipelineFactory(dummyProvider, {}, {})();
    await graph.updateState(
      { configurable: { thread_id: threadId } },
      stateKeys,
    );
  }

  async getCheckpointState(runId: string): Promise<any> {
    const run = pipelineRepo.getRunWithThreadId(runId);
    if (!run?.thread_id) return null;

    pipelineRepo.touchRun(runId);

    const dummyProvider = {
      chat: async () => ({ content: '', tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, reasoning_tokens: 0 } }),
      getModelName: () => 'dummy',
      getProviderType: () => 'dummy',
    } as any;
    const graph = await this.createOrchestratedPipelineFactory(dummyProvider, {}, {})();
    const snapshot = await graph.getState({ configurable: { thread_id: run.thread_id } });

    const state = snapshot?.values;
    if (!state) return null;

    switch (run.phase) {
      case 'review-conditions':
        return { conditions: state.testConditions ?? [], analysis: state.requirementAnalysis ?? null };
      case 'review-draft':
        return { cases: state.draftTestCases ?? [] };
      case 'final-review':
        return { cases: state.finalTestCases ?? [], matrix: state.coverageMatrix ?? null };
      default:
        return null;
    }
  }

  resumeRun(runId: string, action: string, feedback?: string, editedData?: any): void {
    const row = pipelineRepo.getRunWithThreadId(runId);
    if (!row || row.status !== 'WAITING_REVIEW') {
      throw new Error('Test gen is not waiting for review');
    }

    pipelineRepo.insertAuditLog(runId, row.phase, action, editedData ?? null);
    pipelineRepo.setRunRunning(runId);

    // Notify client that checkpoint is resolved so checkpointData is cleared
    const PHASE_TO_NUM: Record<string, number> = { 'review-conditions': 1, 'review-draft': 2, 'final-review': 3 };
    const cpNum = PHASE_TO_NUM[row.phase] || 0;
    if (cpNum > 0) {
      this.sseGateway.emit(runId, 'checkpoint:resolved', { checkpointNumber: cpNum, action });
    }

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

    const PHASE_TO_NUM: Record<string, number> = {
      'review-conditions': 1, 'review-draft': 2, 'final-review': 3,
    };

    console.log(`[TestGenService] Found ${waitingRuns.length} WAITING_REVIEW run(s) to expose for resume`);

    for (const run of waitingRuns) {
      pipelineRepo.touchRun(run.id);

      const cpNum = PHASE_TO_NUM[run.phase] || 1;
      let payload: Record<string, unknown> | null = null;
      try {
        const cpState = await this.getCheckpointState(run.id);
        if (cpState) payload = cpState;
      } catch { /* fallback to null payload */ }

      this.sseGateway.emit(run.id, 'checkpoint:waiting', {
        checkpointNumber: cpNum,
        type: run.phase,
        summary: 'Awaiting Review',
        payload,
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

  private createOrchestratedPipelineFactory(provider: any, callbacks: any, agentOpts: any) {
    return async () => {
      return createOrchestratedPipeline(provider, {
        testAnalyst: TestAnalystRole,
        testDesigner: TestDesignerRole,
        qualityManager: QualityManagerRole,
      }, callbacks, agentOpts, new SqliteSaver(db));
    };
  }

  createToolRegistryInstance(provider: any, opts?: { promptVersion?: string; modelName?: string }): ToolRegistry {
    return createToolRegistry(provider, {
      testAnalyst: TestAnalystRole,
      testDesigner: TestDesignerRole,
      qualityManager: QualityManagerRole,
    }, opts);
  }

  async startOrchestrator(sessionId: string, input: unknown, providerConfigName?: string): Promise<any> {
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

    const graph = createOrchestratorGraph(orchestratorNode);
    const initialState: any = {
      input,
      messages: [],
      reactLoopState: null,
      providerFactory: () => provider,
      promptVersion,
      modelName,
    };

    const compiled = graph.compile();
    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: sessionId },
    });

    return result;
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
    let keepSse = false;

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
        onComplete: (agentName: string, tokenUsage: any, latencyMs: number, inputPrompt?: any, outputData?: any, toolHistory?: any) => {
          scope.recordAgentComplete(agentName, scope.currentBatch, { tokenUsage, latencyMs, inputPrompt, outputData, toolHistory });
        },
        onError: (agentName: string, error: Error) => {
          scope.recordAgentError(agentName, scope.currentBatch, error);
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

      const pipelineFactory = this.createOrchestratedPipelineFactory(provider, pipelineCallbacks, agentOpts);

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
        ? new InteractiveResolver(this.sseGateway)
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

        pipelineRepo.updateThreadId(runId, `${runId}-batch-0`);

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
          pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
          keepSse = true;
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
            // Save thread_id before startBatch fires SSE events
            pipelineRepo.updateThreadId(runId, `${runId}-batch-${batchIndex}`);
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
            // Safety net — thread_id already saved in onBatchStart
            pipelineRepo.updateThreadId(runId, interrupt.threadId);
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
          pipelineRepo.setRunWaiting(runId, summary.interruptedBatch.phase);
          keepSse = true;
          return;
        }
      }

      if (!aborted()) {
        const { allCases, conflicts, removedCount } = deduplicateTestCases(allResults.flatMap((r: any) => r.finalTestCases || []));
        if (removedCount > 0) {
          sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length, conflicts });
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
      if (!keepSse) {
        this.sseGateway.cleanup(runId);
      }
    }
  }

  private async resumePipeline(
    runId: string,
    runRow: { thread_id: string; phase: string; config: any; project_id: string; mode: string; current_batch: number; total_batches: number },
    action: string,
    feedback?: string,
    editedData?: any,
  ): Promise<void> {
    const sendEvent = (event: string, data: unknown) => this.sseGateway.emit(runId, event, data);
    const aborted = () => this.abortedRuns.has(runId);
    const runMode = (runRow.mode || 'auto') as 'auto' | 'interactive';

    const runAbortController = new AbortController();
    this.abortControllers.set(runId, runAbortController);
    const abortSignal = runAbortController.signal;

    let keepSse = false;

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
      scope.restoreBatchState(runRow.current_batch || 0);

      const pipelineCallbacks = {
        onStep: (agentName: string, stepIndex: number, stepName: string) => scope.recordAgentStep(agentName, scope.currentBatch, stepIndex, stepName),
        onThinking: (agentName: string, text: string) => scope.recordAgentThinking(agentName, text),
        onStart: (agentName: string, inputPrompt?: any) => scope.recordAgentStart(agentName, scope.currentBatch, inputPrompt),
        onComplete: (agentName: string, tokenUsage: any, latencyMs: number, inputPrompt?: any, outputData?: any, toolHistory?: any) => scope.recordAgentComplete(agentName, scope.currentBatch, { tokenUsage, latencyMs, inputPrompt, outputData, toolHistory }),
        onError: (agentName: string, error: Error) => scope.recordAgentError(agentName, scope.currentBatch, error),
      };

      const agentOpts = {
        promptVersion,
        modelName,
        tokenLimit: providerConfigRow.monthly_token_limit ?? null,
        timeoutMs: 300_000,
        useCache: config.useCache ?? false,
        signal: abortSignal,
      };

      const pipelineFactory = this.createOrchestratedPipelineFactory(provider, pipelineCallbacks, agentOpts);

      const resolver = new InteractiveResolver(this.sseGateway);

      const session = new TestGenSession(runId, pipelineFactory, resolver, {
        mode: runMode,
        onEvent: sendEvent,
        signal: abortSignal,
      });

      const outcome = await session.resumeBatch(
        runRow.current_batch || 0,
        runRow.thread_id,
        { action, feedback, edits: editedData },
      );

      if (outcome.type === 'interrupt') {
        pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);
        pipelineRepo.setRunWaiting(runId, outcome.interrupt.phase);
        keepSse = true;
        sendEvent('checkpoint:waiting', {
          checkpointId: `${runId}-cp-${outcome.interrupt.checkpointNumber}`,
          checkpointNumber: outcome.interrupt.checkpointNumber,
          type: outcome.interrupt.phase,
          payload: outcome.interrupt.payload,
        });
      } else if (outcome.type === 'complete') {
        const allResults: any[] = [];
        if (outcome.result?.lastState) allResults.push(outcome.result.lastState);

        const totalBatches = runRow.total_batches || 0;
        const currentBatch = runRow.current_batch || 0;

        if (currentBatch < totalBatches) {
          const remaining = await this.continueRemainingBatches(
            runId, runRow.project_id, config, session, scope, sendEvent, aborted,
          );
          if (remaining.interrupted) {
            keepSse = true;
            return;
          }
          allResults.push(...remaining.allResults);
        }

        const { allCases, removedCount } = deduplicateTestCases(
          allResults.flatMap((r: any) => r.finalTestCases || [])
        );
        if (removedCount > 0) {
          sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length, conflicts: [] });
        }
        scope.markComplete({ totalCases: allCases.length, totalBatches: totalBatches || 1 });
      }
    } finally {
      this.concurrencySlot.release();
      this.abortedRuns.delete(runId);
      this.abortControllers.delete(runId);
      if (!keepSse) {
        this.sseGateway.cleanup(runId);
      }
    }
  }

  /**
   * After resuming an interrupted batch, continue any remaining unprocessed batches.
   * Reconstructs batch inputs from persisted config and runs them via BatchOrchestrator.
   */
  private async continueRemainingBatches(
    runId: string,
    projectId: string,
    config: any,
    session: TestGenSession,
    scope: TestGenExecutionScope,
    sendEvent: (event: string, data: unknown) => void,
    aborted: () => boolean,
  ): Promise<{ allResults: any[]; interrupted: boolean }> {
    const requirementIds: string[] = config.requirementIds || [];
    const flowIds: string[] = config.flowIds || [];
    const currentBatch = scope.currentBatch;

    const allIndex = buildRequirementIndex(projectId);
    const selectedIds = new Set(requirementIds);
    const { epics, rootGroups, totalBatches } = groupRequirementsByEpic(allIndex, selectedIds);

    const requirements = requirementRepo.listByProject(projectId);
    const allProjectFlows = businessFlowRepo.listByProject(projectId);
    const selectedFlowSet = new Set(flowIds);
    const filteredFlows = selectedFlowSet.size > 0
      ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
      : allProjectFlows;
    const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows, requirements });

    const remainingBatchInputs = epics
      .map((epic, i) => ({
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
      }))
      .slice(currentBatch);

    if (remainingBatchInputs.length === 0) {
      return { allResults: [], interrupted: false };
    }

    const allResults: any[] = [];

    const orchestrator = new BatchOrchestrator(session, {
      onBatchStart: (batchIndex) => {
        scope.setBatch(batchIndex + 1, totalBatches);
        pipelineRepo.updateCurrentBatch(runId, batchIndex + 1);
        pipelineRepo.updateThreadId(runId, `${runId}-batch-${batchIndex}`);
      },
      onBatchComplete: (batchIndex, result) => {
        if (result?.lastState) allResults.push(result.lastState);
        sendEvent('batch:complete', {
          batch: batchIndex + 1, total: totalBatches,
          testCases: result?.cases.length ?? 0,
        });
      },
      onBatchError: (batchIndex, err) => {
        sendEvent('pipeline:error', {
          phase: 'batch', batch: batchIndex + 1,
          message: err.message, recoverable: true,
        });
      },
      onBatchInterrupt: (_batchIndex, interrupt) => {
        pipelineRepo.updateThreadId(runId, interrupt.threadId);
      },
      isAborted: aborted,
    });

    const summary = await orchestrator.runAll(remainingBatchInputs);

    if (summary.interruptedBatch) {
      pipelineRepo.setRunWaiting(runId, summary.interruptedBatch.phase);
      return { allResults, interrupted: true };
    }

    return { allResults, interrupted: false };
  }
}
