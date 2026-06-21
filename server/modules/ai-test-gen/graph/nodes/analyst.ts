import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildAnalystSystemPrompt, buildAnalystUserMessage } from '../prompts';
import { ANALYST_SKILLS } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { analystOutputProfile } from '../structured-output/analyst.ts';
import { Log } from '../../../../shared/services/logger.ts';

// ============================================================
// Output Schema
// ============================================================
// ============================================================
// Node
// ============================================================
export interface AnalystNodeOptions {
  provider: AIProvider;
  skills?: SkillDefinition[];
  observer?: AgentObserver;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeAnalystNode(opts: AnalystNodeOptions) {
  const { provider, skills = ANALYST_SKILLS, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'test_analyst';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const log = Log.for(agentName);
    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
    const flowMode = state.includeFlowCases ? 'FLOW-LEVEL' : 'REQUIREMENT-LEVEL';
    log.info(`ENTER ── batch ${batchInfo}, ${reqCount} requirements, mode=${flowMode}`);
    log.kv('skills.available', skills.length);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Assess risk & priority');

    try {
      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildAnalystSystemPrompt(state, override?.custom_prompt ?? undefined);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildAnalystUserMessage(state) },
      ];

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        analystOutputProfile,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Extract test conditions');
      observer?.onStep?.(agentName, 2, 'Select ISTQB techniques');

      const latencyMs = Date.now() - startTime;
      const tcCount = validated.testConditions?.length ?? 0;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const techniqueBreakdown = validated.testConditions?.reduce((acc: Record<string, number>, tc: any) => {
        acc[tc.primaryTechnique] = (acc[tc.primaryTechnique] || 0) + 1;
        return acc;
      }, {});
      log.success(`EXIT ── ${tcCount} test conditions`);
      log.kv('skill.calls', skillCallCount);
      log.kv('tokens', usage.input + usage.output);
      log.kv('latency', `${latencyMs}ms`);
      log.kv('techniques', JSON.stringify(techniqueBreakdown));
      if (skillCallCount > 0) {
        log.kv('skill.details', toolCallRecords!.map(tc => `${tc.name}(completed)`).join(', '));
      }
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      return {
        requirementAnalysis: validated.requirementAnalysis,
        testConditions: validated.testConditions as any,
        skillCalls: (toolCallRecords ?? []).map(tc => ({
          agent: agentName,
          skillName: tc.name,
          input: tc.input,
          output: tc.output,
          latencyMs: 0,
          timestamp: Date.now(),
        })),
        phase: 'review-conditions' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}
