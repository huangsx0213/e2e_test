import { Command } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { Semaphore } from '../../../../shared/ai/semaphore.ts';
import { createAIProviderWithFallback } from '../../../../shared/ai/provider.ts';
import { computePromptVersion } from '../../../../shared/ai/prompt-version.ts';
import { createNlPipeline } from '../../../../shared/ai/pipeline.ts';
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
import { PipelineExecutionScope } from '../pipeline-scope.ts';
import { pipelineRepo, decryptApiKey } from '../infrastructure/db/pipeline-repository.ts';
import type { SSEGateway } from '../infrastructure/sse/sse-gateway.ts';

interface ResumeEntry {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

export class PipelineService {
  private readonly resumeWaiters = new Map<string, ResumeEntry>();
  private readonly abortedRuns = new Set<string>();
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
    const waiter = this.resumeWaiters.get(runId);
    if (waiter) {
      this.resumeWaiters.delete(runId);
      waiter.reject(new Error('Pipeline aborted'));
    }
    pipelineRepo.markRunFailed(runId);
  }

  resumeRun(runId: string, action: string, feedback?: string, editedData?: unknown): void {
    const row = pipelineRepo.getRun(runId);
    if (!row || row.status !== 'WAITING_REVIEW') {
      throw new Error('Pipeline is not waiting for review');
    }
    pipelineRepo.insertAuditLog(runId, row.phase, action, editedData);
    pipelineRepo.setRunRunning(runId);
    const waiter = this.resumeWaiters.get(runId);
    if (waiter) {
      this.resumeWaiters.delete(runId);
      waiter.resolve({ action, feedback, editedData });
    }
  }

  deleteRun(runId: string): void {
    const waiter = this.resumeWaiters.get(runId);
    if (waiter) {
      this.resumeWaiters.delete(runId);
      waiter.reject(new Error('Pipeline deleted'));
    }
    pipelineRepo.deleteRun(runId);
    this.sseGateway.cleanup(runId);
  }

  async startPipeline(runId: string, projectId: string, params: {
    requirementIds: string[];
    providerConfigName?: string;
    mode: string;
  }): Promise<void> {
    const sendEvent = (event: string, data: unknown) => this.sseGateway.emit(runId, event, data);
    const aborted = () => this.abortedRuns.has(runId);

    let initCompleted = false;
    let initTimer: ReturnType<typeof setTimeout> | undefined;
    const runMode = (params.mode || 'auto') as 'auto' | 'interactive';

    try {
      await this.concurrencySlot.acquire();
      if (aborted()) return;

      const { requirementIds, providerConfigName } = params;

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
            message: 'Pipeline initialization timed out. Check server logs for details.',
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

      const scope = new PipelineExecutionScope(runId, projectId, runMode,
        (event, data) => this.sseGateway.emit(runId, event, data));

      const pipeline = await createNlPipeline(provider, {
        testAnalyst: TestAnalystRole,
        testDesigner: TestDesignerRole,
        qualityManager: QualityManagerRole,
      }, {
        onStep: (agentName, stepIndex, stepName) => {
          scope.recordAgentStep(agentName, scope.currentBatch, stepIndex, stepName);
        },
        onThinking: (agentName, text) => {
          scope.recordAgentThinking(agentName, text);
        },
        onStart: (agentName, inputPrompt) => {
          scope.recordAgentStart(agentName, scope.currentBatch, inputPrompt);
        },
        onComplete: (agentName, tokenUsage, latencyMs, inputPrompt, outputData) => {
          scope.recordAgentComplete(agentName, scope.currentBatch, { tokenUsage, latencyMs, inputPrompt, outputData });
        },
      }, {
        promptVersion,
        modelName,
        tokenLimit: providerConfigRow.monthly_token_limit ?? null,
        timeoutMs: 300_000,
      }, new SqliteSaver(db));

      initCompleted = true;
      if (initTimer) clearTimeout(initTimer);

      const requirements = requirementRepo.listByProject(projectId);
      const businessFlows = buildBusinessFlowBlueprints({
        flows: businessFlowRepo.listByProject(projectId),
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

      const allResults: any[] = [];

      const processBatch = async (epic: any, batchIndex: number, mode: 'auto' | 'interactive') => {
        if (aborted()) return;
        scope.setBatch(batchIndex + 1, totalBatches);

        const batchReqIds = new Set(rootGroups.get(epic.id)!);
        const batchRequirements = requirements.filter(r => batchReqIds.has(r.id));
        pipelineRepo.updateCurrentBatch(runId, batchIndex + 1);

        const config = { configurable: { thread_id: `${runId}-batch-${batchIndex}` } };
        const inputState = {
          projectId,
          requirementIds,
          currentBatch: batchRequirements,
          batchContext: { currentBatch: batchIndex, totalBatches, processedCount: batchIndex },
          projectContext: { name: epic.title, pages: [], endpoints: [] },
          phase: 'analysis',
          errors: [],
        };

        try {
          const result = await this.runBatch(pipeline, inputState, config, runId, batchIndex, sendEvent, aborted, mode);
          if (result?.finalTestCases?.length) allResults.push(result);
          sendEvent('batch:complete', { batch: batchIndex + 1, total: totalBatches, testCases: result?.finalTestCases?.length || 0 });
        } catch (err: any) {
          if (aborted()) return;
          sendEvent('pipeline:error', { phase: 'batch', batch: batchIndex + 1, message: err.message, recoverable: true });
        }
      };

      if (runMode === 'interactive') {
        for (let i = 0; i < totalBatches; i++) {
          if (aborted()) break;
          await processBatch(epics[i], i, 'interactive');
        }
      } else {
        const batchSemaphore = new Semaphore(this.maxConcurrent);
        const batchTasks = epics.map((epic, i) =>
          batchSemaphore.acquire().then(() => processBatch(epic, i, 'auto')).finally(() => batchSemaphore.release()),
        );
        await Promise.allSettled(batchTasks);
      }

      if (!aborted()) {
        const { allCases, conflicts, removedCount } = deduplicateTestCases(allResults.flatMap(r => r.finalTestCases || []));
        if (removedCount > 0) {
          sendEvent('pipeline:dedup', { removed: removedCount, remaining: allCases.length, conflicts });
        }

        for (const tc of allCases) {
          nlCaseRepo.save({ ...tc, projectId });
        }

        scope.markComplete({ totalCases: allCases.length, totalBatches });
      }
    } catch (err: any) {
      if (initTimer && !initCompleted) clearTimeout(initTimer);
      if (!aborted()) {
        const scope = new PipelineExecutionScope(runId, projectId, runMode,
          (event, data) => this.sseGateway.emit(runId, event, data));
        scope.markFailed(err.message);
      }
    } finally {
      this.concurrencySlot.release();
      this.abortedRuns.delete(runId);
      this.sseGateway.cleanup(runId);
    }
  }

  private async runBatch(
    pipeline: Awaited<ReturnType<typeof createNlPipeline>>,
    inputState: any,
    config: any,
    runId: string,
    batchIndex: number,
    sendEvent: (event: string, data: unknown) => void,
    aborted: () => boolean,
    mode: 'auto' | 'interactive' = 'interactive',
  ): Promise<any | null> {
    let isResume = false;
    while (true) {
      if (aborted()) return null;

      const stream = await pipeline.stream(
        isResume ? new Command({ resume: inputState }) : inputState,
        { ...config, streamMode: 'values' as const },
      );
      isResume = true;

      let lastState: any = null;

      for await (const chunk of stream) {
        if (aborted()) return null;
        lastState = chunk as any;
      }

      const interruptValue = (lastState as any)?.__interrupt__;
      if (interruptValue && interruptValue.length > 0) {
        const interruptPayload = interruptValue[0].value;

        const checkpointNumber = interruptPayload.conditions ? 1
          : interruptPayload.matrix ? 3 : 2;

        if (mode === 'auto') {
          if (checkpointNumber === 1) {
            inputState = { conditions: interruptPayload.conditions, analysis: interruptPayload.analysis };
          } else if (checkpointNumber === 2) {
            inputState = { cases: interruptPayload.cases };
          } else {
            inputState = { cases: interruptPayload.cases, matrix: interruptPayload.matrix };
          }
          continue;
        }

        pipelineRepo.setCheckpointData(runId, interruptPayload, lastState.phase);

        sendEvent('checkpoint:waiting', {
          checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
          checkpointNumber,
          type: lastState.phase,
          summary: checkpointNumber === 1 ? `${interruptPayload.conditions?.length || 0} Test Conditions`
            : checkpointNumber === 2 ? `${interruptPayload.cases?.length || 0} Draft Cases`
            : 'Final Review',
          payload: interruptPayload,
        });

        const resumeResult = await new Promise<any>((resolve, reject) => {
          this.resumeWaiters.set(runId, { resolve, reject });
          setTimeout(() => {
            if (this.resumeWaiters.has(runId)) {
              this.resumeWaiters.delete(runId);
              reject(new Error('Review timeout after 30 minutes'));
            }
          }, 30 * 60 * 1000);
        });

        sendEvent('checkpoint:resolved', {
          checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
          checkpointNumber,
          action: resumeResult.action,
          timestamp: Date.now(),
        });

        if (resumeResult.action === 'retry') {
          inputState = { retry: true };
        } else {
          const edits = resumeResult.editedData ?? {};
          if (checkpointNumber === 1) {
            inputState = { conditions: edits.conditions ?? interruptPayload.conditions, analysis: edits.analysis ?? interruptPayload.analysis, feedback: resumeResult.feedback };
          } else if (checkpointNumber === 2) {
            inputState = { cases: edits.cases ?? interruptPayload.cases, feedback: resumeResult.feedback };
          } else {
            inputState = { cases: edits.cases ?? interruptPayload.cases, matrix: edits.matrix ?? interruptPayload.matrix };
          }
        }

        continue;
      }

      if (lastState) {
        return lastState;
      }

      return null;
    }
  }
}
