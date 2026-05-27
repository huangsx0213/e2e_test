import { describe, it, expect, vi } from 'vitest';
import { createTestGenerationPipeline } from '../../ai-test-gen/test-generation.ts';

const mockProvider = { chat: vi.fn().mockResolvedValue({ content: '{}', usage: {} }), streamChat: vi.fn() } as any;
const mockRole = { name: 'test', systemPromptTemplate: '', requiredSkills: [], inputSchema: { parse: (x: any) => x } as any, outputSchema: { parse: (x: any) => x } as any };

function makeRoles() {
  return { testAnalyst: mockRole, testDesigner: mockRole, qualityManager: mockRole };
}

describe('createTestGenerationPipeline', () => {
  it('graph compiles and has invoke method', async () => {
    const graph = await createTestGenerationPipeline(mockProvider, makeRoles());
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  it('registers all 6 pipeline nodes', async () => {
    const graph = await createTestGenerationPipeline(mockProvider, makeRoles());
    const nodeNames = Object.keys(graph.nodes);
    expect(nodeNames).toContain('agent_test_analyst');
    expect(nodeNames).toContain('checkpoint_1');
    expect(nodeNames).toContain('agent_test_designer');
    expect(nodeNames).toContain('checkpoint_2');
    expect(nodeNames).toContain('agent_quality_manager');
    expect(nodeNames).toContain('checkpoint_3');
    expect(nodeNames.length).toBeGreaterThanOrEqual(6);
  });
});
