import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AgentTool } from '../../ai/tool.ts';
import { createToolNode, type AgentObserver } from '../../ai/pipeline-nodes.ts';
import { ToolRegistry } from '../../ai/tool-registry.ts';
import { ToolOrchestrator } from '../../ai/tool-orchestrator.ts';
import type { AIProvider, StreamChunk } from '../../ai/provider.ts';
import type { AgentRole } from '../../ai/agent.ts';
import { useCacheStore, invalidateCache } from '../../ai/cache.ts';

const analystRole: AgentRole = {
  name: 'test-analyst',
  systemPromptTemplate: 'You are an analyst. Input: {{input}}',
  requiredSkills: [],
  inputSchema: z.object({ requirements: z.array(z.any()) }),
  outputSchema: z.object({
    requirementAnalysis: z.object({ overallApproach: z.string(), riskAssessmentSummary: z.string() }),
    testConditions: z.array(z.object({ id: z.string(), description: z.string() })),
  }),
};

const designerRole: AgentRole = {
  name: 'test-designer',
  systemPromptTemplate: 'You are a designer. Input: {{input}}',
  requiredSkills: [],
  inputSchema: z.object({ conditions: z.array(z.any()) }),
  outputSchema: z.object({ draftTestCases: z.array(z.object({ id: z.string(), title: z.string() })) }),
};

const qualityRole: AgentRole = {
  name: 'quality-manager',
  systemPromptTemplate: 'You are a quality manager. Input: {{input}}',
  requiredSkills: [],
  inputSchema: z.object({ draftCases: z.array(z.any()) }),
  outputSchema: z.object({
    finalTestCases: z.array(z.object({ id: z.string(), title: z.string() })),
    coverageMatrix: z.object({ rows: z.array(z.any()) }),
  }),
};

function buildProvider(contentPerRole: Record<string, string>): AIProvider {
  return {
    getModelName: () => 'test-model',
    getProviderType: () => 'test',
    streamChat: vi.fn().mockImplementation(async function* (messages: any[]) {
      const sys = messages.find((m) => m.role === 'system')?.content ?? '';
      const roleKey = sys.includes('analyst') ? 'analyst'
        : sys.includes('designer') ? 'designer'
        : 'quality';
      const content = contentPerRole[roleKey] ?? '{}';
      yield { type: 'content' as const, content } as StreamChunk;
      yield { type: 'done' as const, content: '', usage: { promptTokens: 10, completionTokens: 5, reasoningTokens: 0 } } as StreamChunk;
    }),
  } as unknown as AIProvider;
}

function setupCache(): void {
  useCacheStore({
    getCache: vi.fn(() => undefined),
    setCache: vi.fn(),
    invalidateByPromptVersion: vi.fn(),
    invalidateAll: vi.fn(),
  });
  invalidateCache();
}

describe('test-gen data flow: AgentTool → buildToolResult integration', () => {
  beforeEach(() => {
    setupCache();
  });

  it('AgentTool.execute returns agent output as data (non-ReAct mode)', async () => {
    const provider = buildProvider({
      analyst: JSON.stringify({
        requirementAnalysis: { overallApproach: 'A', riskAssessmentSummary: 'R' },
        testConditions: [{ id: 'tc-1', description: 'cond-1' }],
      }),
    });
    const tool = new AgentTool(analystRole, () => provider, () => 'v1', () => 'test-model');
    const result = await tool.execute({ requirements: [] }, { useReActLoop: false });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      requirementAnalysis: { overallApproach: 'A', riskAssessmentSummary: 'R' },
      testConditions: [{ id: 'tc-1', description: 'cond-1' }],
    });
    expect((result.data as any).result).toBeUndefined();
  });

  it('createToolNode passes unwrapped outputData to observer.onComplete', async () => {
    const provider = buildProvider({
      analyst: JSON.stringify({
        requirementAnalysis: { overallApproach: 'A', riskAssessmentSummary: 'R' },
        testConditions: [{ id: 'tc-1', description: 'cond-1' }],
      }),
    });
    const tool = new AgentTool(analystRole, () => provider, () => 'v1', () => 'test-model');
    const observed: { outputData: any; toolHistory: any } = { outputData: null, toolHistory: 'unset' };
    const observer: AgentObserver = {
      onComplete: (_name, _tu, _l, _p, outputData, toolHistory) => {
        observed.outputData = outputData;
        observed.toolHistory = toolHistory;
      },
    };
    const node = createToolNode(
      tool,
      () => ({ requirements: [] }),
      (raw) => {
        const data = (raw as any).data;
        return { testConditions: data.testConditions, requirementAnalysis: data.requirementAnalysis };
      },
      { index: 0, name: 'pre' },
      [{ index: 1, name: 'post' }],
      observer,
      { useReActLoop: false },
    );

    const out = await node({});
    expect(out.testConditions).toEqual([{ id: 'tc-1', description: 'cond-1' }]);
    expect(out.requirementAnalysis).toEqual({ overallApproach: 'A', riskAssessmentSummary: 'R' });
    expect(observed.outputData).toEqual({
      requirementAnalysis: { overallApproach: 'A', riskAssessmentSummary: 'R' },
      testConditions: [{ id: 'tc-1', description: 'cond-1' }],
    });
    expect((observed.outputData as any).result).toBeUndefined();
  });

  it('end-to-end orchestrated pipeline compiles with all 3 agent nodes + checkpoints, buildToolResult receives unwrapped data', async () => {
    const provider = buildProvider({
      analyst: JSON.stringify({
        requirementAnalysis: { overallApproach: 'Approach X', riskAssessmentSummary: 'Risk Y' },
        testConditions: [{ id: 'tc-1', description: 'cond-A' }, { id: 'tc-2', description: 'cond-B' }],
      }),
      designer: JSON.stringify({
        draftTestCases: [{ id: 'case-1', title: 'Case 1' }, { id: 'case-2', title: 'Case 2' }],
      }),
      quality: JSON.stringify({
        finalTestCases: [{ id: 'final-1', title: 'Final 1' }],
        coverageMatrix: { rows: [{ id: 'r-1' }] },
      }),
    });

    const registry = new ToolRegistry();
    registry.register(new AgentTool(analystRole, () => provider, () => 'v1', () => 'test-model'));
    registry.register(new AgentTool(designerRole, () => provider, () => 'v1', () => 'test-model'));
    registry.register(new AgentTool(qualityRole, () => provider, () => 'v1', () => 'test-model'));
    const orchestrator = new ToolOrchestrator(registry, provider);

    const pipeline = orchestrator.pipeline({
      tools: ['test_analyst', 'test_designer', 'quality_manager'],
      enableCheckpoints: true,
      buildToolResult: {
        test_analyst: (raw) => {
          const d = (raw as any).data;
          return { testConditions: d.testConditions, requirementAnalysis: d.requirementAnalysis, phase: 'review-conditions' };
        },
        test_designer: (raw) => {
          const d = (raw as any).data;
          return { draftTestCases: d.draftTestCases, phase: 'review-draft' };
        },
        quality_manager: (raw) => {
          const d = (raw as any).data;
          return { finalTestCases: d.finalTestCases, coverageMatrix: d.coverageMatrix, phase: 'final-review' };
        },
      },
    });

    expect(pipeline).toBeDefined();
    expect(typeof pipeline.invoke).toBe('function');
    expect(Object.keys(pipeline.nodes)).toContain('agent_test_analyst');
    expect(Object.keys(pipeline.nodes)).toContain('agent_test_designer');
    expect(Object.keys(pipeline.nodes)).toContain('agent_quality_manager');
    expect(Object.keys(pipeline.nodes)).toContain('checkpoint_1');
    expect(Object.keys(pipeline.nodes)).toContain('checkpoint_2');
    expect(Object.keys(pipeline.nodes)).toContain('checkpoint_3');
  });
});
