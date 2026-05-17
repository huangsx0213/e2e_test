import { describe, it, expect, vi } from 'vitest';
import { createNlPipeline } from '../pipeline.ts';

describe('createNlPipeline', () => {
  it('graph compiles with SqliteSaver', async () => {
    const mockProvider = { chat: vi.fn().mockResolvedValue({ content: '{}', usage: {} }), streamChat: vi.fn() } as any;
    const mockRole = { name: 'test', systemPromptTemplate: '', requiredSkills: [], inputSchema: { parse: (x: any) => x } as any, outputSchema: { parse: (x: any) => x } as any };
    const graph = await createNlPipeline(mockProvider, { testAnalyst: mockRole, testDesigner: mockRole, qualityManager: mockRole });
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });
});