import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildDesignerSystemPrompt, buildDesignerUserMessage } from '../prompts';
import { buildDesignerSkills } from '../skills/skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { createDesignerOutputProfile } from '../structured-output/designer.ts';
import { Log } from '../../../../shared/services/logger.ts';

// ============================================================
// Output Schema
// ============================================================
// ============================================================
// Node
// ============================================================
export interface DesignerNodeOptions {
  provider: AIProvider;
  skills?: SkillDefinition[];
  observer?: AgentObserver;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeDesignerNode(opts: DesignerNodeOptions) {
  const { provider, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'test_designer';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const log = Log.for(agentName);
    const condCount = (state.approvedConditions ?? state.testConditions ?? []).length;
    // 在节点内部动态构建 skills：传入 state.runId 让 previous_batch_cases_query 能查询历史 agent logs
    const skills = opts.skills ?? buildDesignerSkills(state.runId);
    log.info(`ENTER ── ${condCount} conditions to design`);

    observer?.onStart?.(agentName);

    try {
      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildDesignerSystemPrompt(state, override?.custom_prompt ?? undefined);
      const conditions = state.approvedConditions ?? state.testConditions ?? [];
      const outputProfile = createDesignerOutputProfile(conditions.map((condition) => ({
        id: condition.id,
        requirementId: condition.requirementId,
      })));

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildDesignerUserMessage(state) },
      ];

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        outputProfile,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      const latencyMs = Date.now() - startTime;
      const draftCount = validated.draftTestCases?.length ?? 0;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const avgScore = draftCount > 0
        ? validated.draftTestCases.reduce((sum, tc) => sum + tc.selfReview.score, 0) / draftCount
        : 0;
      observer?.onStep?.(agentName, 4, `Designed ${draftCount} cases, avg self-review ${avgScore.toFixed(1)}/10`);
      log.success(`EXIT ── ${draftCount} draft test cases`);
      log.kv('selfReview.avg', avgScore.toFixed(1));
      log.kv('skill.calls', skillCallCount);
      log.kv('tokens', usage.input + usage.output);
      log.kv('latency', `${latencyMs}ms`);
      if (skillCallCount > 0) {
        log.kv('skill.details', toolCallRecords!.map(tc => `${tc.name}(completed)`).join(', '));
      }
      observer?.onComplete?.(agentName, usage, latencyMs, messages, validated);

      return {
        draftTestCases: validated.draftTestCases as any,
        skillCalls: (toolCallRecords ?? []).map(tc => ({
          agent: agentName,
          skillName: tc.name,
          input: tc.input,
          output: tc.output,
          latencyMs: 0,
          timestamp: Date.now(),
        })),
        phase: 'review-draft' as const,
      };
    } catch (err: any) {
      observer?.onError?.(agentName, err);
      throw err;
    }
  };
}
