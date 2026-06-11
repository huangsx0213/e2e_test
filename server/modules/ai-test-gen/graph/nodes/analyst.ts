import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildAnalystSystemPrompt, buildAnalystUserMessage } from '../prompts';
import { ANALYST_SKILLS } from '../skills/skills.ts';
import { z } from 'zod';

// ============================================================
// Output Schema
// ============================================================
const AnalystOutputSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string().describe('Overall test strategy for this batch'),
    riskAssessmentSummary: z.string().describe('Summary of key risks identified'),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    condition: z.string().describe('ISTQB-style test condition description'),
    category: z.string().describe('One of: functional, ui, api, boundary, edge, error, validation, performance'),
    priority: z.string().describe('One of: critical, high, medium, low'),
    riskLevel: z.string().describe('One of: high, medium, low'),
    primaryTechnique: z.string().describe('Primary ISTQB test technique'),
    secondaryTechniques: z.array(z.string()),
    techniqueRationale: z.string(),
    coverageDimensions: z.array(z.string()),
    dataRequirements: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).default([]),
    requirementLevel: z.string().optional(),
  })),
});

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
    const reqCount = state.currentBatch?.length ?? 0;
    const batchInfo = `${state.batchContext?.currentBatch ?? '?'}/${state.batchContext?.totalBatches ?? '?'}`;
    const flowMode = state.includeFlowCases ? 'FLOW-LEVEL' : 'REQUIREMENT-LEVEL';
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${batchInfo}, ${reqCount} requirements, mode=${flowMode}, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Assess risk & priority');

    try {
      const messages = [
        { role: 'system' as const, content: buildAnalystSystemPrompt(state) },
        { role: 'user' as const, content: buildAnalystUserMessage(state) },
      ];
      console.log(`[test-gen:graph] [${agentName}] Calling LLM with ${skills.length} skills available`);

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        AnalystOutputSchema,
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
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${tcCount} test conditions, ${skillCallCount} skill calls, tokens=${usage.input + usage.output}, latency=${latencyMs}ms`);
      console.log(`[test-gen:graph] [${agentName}] Techniques: ${JSON.stringify(techniqueBreakdown)}`);
      if (skillCallCount > 0) {
        console.log(`[test-gen:graph] [${agentName}] Skill calls: ${toolCallRecords!.map(tc => `${tc.name}(${JSON.stringify(tc.input).slice(0, 60)})`).join(', ')}`);
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