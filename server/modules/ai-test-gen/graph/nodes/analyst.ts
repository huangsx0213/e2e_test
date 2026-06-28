import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import type { RiskLevel } from '../../../../../shared/contracts/index.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildAnalystSystemPrompt, buildAnalystUserMessage } from '../prompts';
import { ANALYST_SKILLS } from '../skills/skills.ts';
import { bindProjectIdToCoverageQuery } from '../skills/data-skills.ts';
import { pipelineRepo } from '../../repository.ts';
import { createAnalystOutputProfile } from '../structured-output/analyst.ts';
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
    const analystMode = state.analystMode || 'STAGE_1_REQUIREMENT';
    log.info(`ENTER ── batch ${batchInfo}, ${reqCount} items, mode=${analystMode}`);
    log.kv('skills.available', skills.length);
    log.kv('analystMode', analystMode);

    observer?.onStart?.(agentName);

    try {
      // Bind projectId to coverage_check_query so the LLM can query the persistent matrix
      bindProjectIdToCoverageQuery(state.projectId);

      const override = pipelineRepo.getPromptOverride(state.projectId, agentName);
      const systemPrompt = buildAnalystSystemPrompt(state, override?.custom_prompt ?? undefined);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildAnalystUserMessage(state) },
      ];

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);

      // Stage 1 (per-epic): 只允许引用当前 batch 内的 requirement
      // Stage 2 (flow): 不做限制 — flow 跨多个 requirement，LLM 需自由引用 flow 路径上的所有需求
      // Stage 3 (error): 不做限制
      const allowedReqIds: Set<string> = analystMode === 'STAGE_1_REQUIREMENT'
        ? new Set((state.currentBatch ?? []).map(r => r.id))
        : new Set();

      // 计算 priorityFloor：从 directiveTestStrategy 的 epicDirectives 构建 priority floor 映射
      const priorityFloor = new Map<string, RiskLevel>();
      if (state.directiveTestStrategy?.epicDirectives) {
        for (const ed of state.directiveTestStrategy.epicDirectives) {
          priorityFloor.set(ed.epicId, ed.riskPriority);
        }
      }

      const analystOutputProfile = createAnalystOutputProfile(allowedReqIds, priorityFloor);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        analystOutputProfile,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      // Stage 1/2/3: 语义去重
      let dedupedConditions = validated.testConditions ?? [];
      if (dedupedConditions.length > 1) {
        const comparisonConditions = dedupedConditions.map((tc: any, i: number) => ({
          index: i,
          id: tc.id,
          title: tc.title,
          condition: tc.condition,
        }));

        const systemPrompt = `You are a test condition deduplication expert. Given a list of test conditions, identify which ones are semantic duplicates — i.e., they test the SAME test scenario even though the wording differs.

Rules:
1. Two conditions are semantic duplicates if they test the SAME test scenario, even if titles/wording differs slightly.
2. Two conditions are NOT duplicates if they test different aspects (different inputs, different paths, different error conditions, or different coverage dimensions).
3. When a group of conditions are semantic duplicates, keep the one with the clearest title and most specific wording.
4. Return a JSON object with "groups" (each group is an array of indices that are duplicates) and "keptIndices" (the indices to keep in each group).

Example output format:
{
  "groups": [
    { "indices": [0, 3], "keptIndex": 0, "reason": "Same scenario: login with valid credentials" }
  ],
  "keptIndices": [0, 1, 2]
}`;

        const userMessage = JSON.stringify({
          conditions: comparisonConditions,
          instruction: 'Identify semantic duplicates. Return ONLY the JSON object.',
        }, null, 2);

        try {
          const { output: semanticOutput } = await callLLMWithStructuredOutput(
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
                  keptIndices: { type: 'array' as const, items: { type: 'number' as const } },
                },
                required: ['groups', 'keptIndices'] as string[],
              },
              shouldAttemptPhase1Extraction: () => true,
              normalize: (raw: unknown) => raw,
              parse: (normalized: unknown) => normalized as any,
              formatValidationError: () => '',
            },
            undefined,
            'semantic_dedup',
            { signal: AbortSignal.timeout(30_000), agentName: 'semantic_dedup' },
          );

          const keptIndices = Array.from(new Set([...(semanticOutput.keptIndices ?? [])]));
          const removedIndices = comparisonConditions
            .map((_: any, i: number) => i)
            .filter(i => !keptIndices.includes(i));

          if (removedIndices.length > 0) {
            dedupedConditions = dedupedConditions.filter((_: any, i: number) => keptIndices.includes(i));
            log.kv('semantic_dedup.removed', removedIndices.length);
          }
        } catch (err: any) {
          log.warn(`Semantic dedup failed: ${err.message}`);
          // Fall back to no dedup
        }
      }

      const latencyMs = Date.now() - startTime;
      const tcCount = dedupedConditions.length;
      const skillCallCount = toolCallRecords?.length ?? 0;
      const techniqueNames = [...new Set(dedupedConditions.map((tc: any) => tc.primaryTechnique).filter(Boolean))] as string[];
      observer?.onStep?.(agentName, 4, `Found ${tcCount} test conditions (after semantic dedup), ${techniqueNames.length} techniques`);
      const techniqueBreakdown = dedupedConditions.reduce((acc: Record<string, number>, tc: any) => {
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
        testConditions: dedupedConditions as any,
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
