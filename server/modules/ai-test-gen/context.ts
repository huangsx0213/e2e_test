import { Semaphore } from './infra/semaphore.ts';
import { createAIProviderWithFallback } from './infra/provider.ts';
import { computePromptVersion } from './infra/prompt-version.ts';
import { useCacheStore } from './infra/cache.ts';
import { pipelineRepo, decryptApiKey } from './repository.ts';
import { SSEGateway } from './sse-gateway.ts';
import { RunScope } from './scope.ts';
import { TestGenSession } from './session.ts';
import { buildFallbackConfigs } from './helpers.ts';
import type { AgentObserver } from './graph/nodes/types.ts';
import type { AIProvider } from './infra/provider.ts';

export interface RunContext {
  runId: string;
  projectId: string;
  mode: 'auto' | 'interactive';
  provider: AIProvider;
  promptVersion: string;
  modelName: string;
  tokenLimit: number | null;
  scope: RunScope;
  session: TestGenSession;
  abortSignal: AbortSignal;
  sendEvent: (event: string, data: unknown) => void;
  isAborted: () => boolean;
  releaseSlot: () => void;
}

export interface StartParams {
  requirementIds: string[];
  providerConfigName?: string;
  mode: 'auto' | 'interactive';
  flowIds?: string[];
  includeFlowCases?: boolean;
  useCache?: boolean;
}

export class ContextBuilder {
  private readonly abortedRuns = new Set<string>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly concurrencySlot: Semaphore;

  constructor(
    private readonly sseGateway: SSEGateway,
    maxConcurrent = 3,
  ) {
    this.concurrencySlot = new Semaphore(maxConcurrent);
    useCacheStore(pipelineRepo.getCacheStore());
  }

  abort(runId: string): void {
    this.abortedRuns.add(runId);
    this.abortControllers.get(runId)?.abort();
  }

  delete(runId: string): void {
    this.abortedRuns.add(runId);
    this.abortControllers.get(runId)?.abort();
    this.abortControllers.delete(runId);
    this.abortedRuns.delete(runId);
  }

  release(runId: string): void {
    this.abortedRuns.delete(runId);
    this.abortControllers.delete(runId);
  }

  async build(
    runId: string,
    projectId: string,
    mode: 'auto' | 'interactive',
    config: { providerConfigName?: string; useCache?: boolean; currentBatch?: number } = {},
  ): Promise<RunContext> {
    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    const sendEvent = (event: string, data: unknown) => this.sseGateway.emit(runId, event, data);
    const isAborted = () => this.abortedRuns.has(runId);

    await this.concurrencySlot.acquire();
    if (isAborted()) {
      this.concurrencySlot.release();
      this.abortControllers.delete(runId);
      throw new Error('aborted');
    }

    const providerConfigRow = config.providerConfigName
      ? pipelineRepo.getProviderConfigByName(config.providerConfigName)
      : pipelineRepo.getActiveProviderConfig();
    if (!providerConfigRow) {
      this.concurrencySlot.release();
      this.abortControllers.delete(runId);
      throw new Error('No active AI provider configuration found. Go to Settings → AI Provider to configure one.');
    }

    const monthlyLimit = providerConfigRow.monthly_token_limit as number | null;
    if (monthlyLimit) {
      const used = pipelineRepo.getMonthlyTokenUsage(projectId);
      if (used >= monthlyLimit) {
        this.concurrencySlot.release();
        this.abortControllers.delete(runId);
        throw new Error(`Monthly token limit exceeded (${used}/${monthlyLimit}).`);
      }
    }

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
    console.log(`[context] AI provider created: type=${providerConfigRow.type}, model=${providerConfigRow.model || providerConfigRow.deployment || 'unknown'}, fallbacks=${fallbackConfigs.length}`);

    const promptVersion = computePromptVersion();
    const modelName = providerConfigRow.model || providerConfigRow.deployment || 'unknown';
    pipelineRepo.updateProviderInfo(runId, {
      providerType: providerConfigRow.type,
      modelName,
      promptVersion,
      providerConfigName: providerConfigRow.name || null,
      tokenLimit: providerConfigRow.monthly_token_limit ?? null,
    });

    const scope = new RunScope(runId, projectId, mode, sendEvent);
    if (config.currentBatch != null) scope.restoreBatchState(config.currentBatch);

    const observer: AgentObserver = {
      onStep: (agentName, stepIndex, stepName) => {
        scope.recordAgentStep(agentName, stepIndex, stepName);
      },
      onThinking: (agentName, text) => {
        scope.recordAgentThinking(agentName, text);
      },
      onStart: (agentName) => {
        scope.recordAgentStart(agentName);
      },
      onComplete: (agentName, tokenUsage, latencyMs, inputPrompt, outputData) => {
        scope.recordAgentComplete(agentName, {
          tokenUsage,
          latencyMs,
          inputPrompt: inputPrompt as any,
          outputData,
        });
      },
      onError: (agentName, error) => {
        scope.recordAgentError(agentName, error);
      },
    };

    const session = new TestGenSession({
      runId,
      provider,
      observer,
      modelName,
      tokenLimit: providerConfigRow.monthly_token_limit ?? null,
      timeoutMs: 300_000,
      useCache: config.useCache ?? false,
      signal: abortController.signal,
    });

    return {
      runId,
      projectId,
      mode,
      provider,
      promptVersion,
      modelName,
      tokenLimit: providerConfigRow.monthly_token_limit ?? null,
      scope,
      session,
      abortSignal: abortController.signal,
      sendEvent,
      isAborted,
      releaseSlot: () => {
        this.concurrencySlot.release();
        this.release(runId);
      },
    };
  }
}