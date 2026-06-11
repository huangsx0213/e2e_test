import type { TestGenState } from '../state';
import type { AgentObserver, SkillDefinition } from './types';
import type { AIProvider } from '../../infra/provider.ts';
import { mergeSignals } from '../../infra/provider.ts';
import { callLLMWithStructuredOutput } from './utils';
import { buildDesignerSystemPrompt, buildDesignerUserMessage } from '../prompts';
import { DESIGNER_SKILLS } from '../skills/skills.ts';
import { z } from 'zod';

// ============================================================
// Output Schema
// ============================================================
const TestStepSchema = z.object({
  stepNumber: z.preprocess(
    (v) => (typeof v === 'number' ? v : Number(v) || 1),
    z.number(),
  ),
  action: z.preprocess((v) => String(v ?? ''), z.string()),
  expected: z.preprocess((v) => String(v ?? ''), z.string()),
});

const DesignerOutputSchema = z.preprocess(
  // If LLM outputs a single test case object at top level (missing draftTestCases wrapper),
  // wrap it automatically. Detect by presence of "steps" key without "draftTestCases".
  (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !('draftTestCases' in (v as Record<string, unknown>))) {
      const obj = v as Record<string, unknown>;
      if ('steps' in obj || 'conditionId' in obj || 'title' in obj) {
        return { draftTestCases: [obj] };
      }
    }
    return v;
  },
  z.object({
  draftTestCases: z.preprocess(
    (v) => Array.isArray(v) ? v : typeof v === 'object' && v !== null ? Object.values(v) : [],
    z.array(z.object({
    id: z.string(),
    title: z.string().describe('Concise test case title'),
    conditionId: z.string().describe('Reference to the test condition this covers'),
    requirementId: z.string(),
    priority: z.string().describe('One of: critical, high, medium, low'),
    category: z.string().describe('One of: functional, ui, api, boundary, edge, error, validation'),
    techniqueApplied: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(TestStepSchema).min(1),
    postconditions: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    selfReview: z.object({
      score: z.coerce.number().min(1).max(10).describe('Self-assessed quality score 1-10'),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      suggestions: z.array(z.string()),
    }),
  })).min(1)),
  }),
);

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
  const { provider, skills = DESIGNER_SKILLS, observer, timeoutMs = 600_000, signal } = opts;
  const agentName = 'test_designer';

  return async (state: TestGenState): Promise<Partial<TestGenState>> => {
    const startTime = Date.now();
    const condCount = (state.approvedConditions ?? state.testConditions ?? []).length;
    console.log(`[test-gen:graph] [${agentName}] ENTER, ${condCount} conditions to design, phase=${state.phase}`);

    observer?.onStart?.(agentName);
    observer?.onStep?.(agentName, 0, 'Design test cases');

    try {
      const messages = [
        { role: 'system' as const, content: buildDesignerSystemPrompt(state) },
        { role: 'user' as const, content: buildDesignerUserMessage(state) },
      ];
      console.log(`[test-gen:graph] [${agentName}] Calling LLM with ${skills.length} skills available`);

      const nodeSignal = signal ? mergeSignals(signal, AbortSignal.timeout(timeoutMs)) : AbortSignal.timeout(timeoutMs);
      const { output: validated, usage, toolCallRecords } = await callLLMWithStructuredOutput(
        provider,
        messages,
        skills,
        DesignerOutputSchema,
        { onStep: observer?.onStep, onThinking: observer?.onThinking },
        agentName,
        { signal: nodeSignal, agentName },
      );

      observer?.onStep?.(agentName, 1, 'Apply test techniques');
      const avgScore = validated.draftTestCases.reduce((sum, tc) => sum + tc.selfReview.score, 0) / validated.draftTestCases.length;
      observer?.onStep?.(agentName, 2, `Self-review (avg: ${avgScore.toFixed(1)}/10)`);

      const latencyMs = Date.now() - startTime;
      const draftCount = validated.draftTestCases?.length ?? 0;
      const skillCallCount = toolCallRecords?.length ?? 0;
      console.log(`[test-gen:graph] [${agentName}] EXIT, ${draftCount} draft test cases, avg self-review=${avgScore.toFixed(1)}/10, ${skillCallCount} skill calls, tokens=${usage.input + usage.output}, latency=${latencyMs}ms`);
      if (skillCallCount > 0) {
        console.log(`[test-gen:graph] [${agentName}] Skill calls: ${toolCallRecords!.map(tc => `${tc.name}(${JSON.stringify(tc.input).slice(0, 60)})`).join(', ')}`);
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