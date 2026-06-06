import { describe, expect, it, vi } from 'vitest';
import { buildTestGenGraph } from '../graph/graph.ts';

describe('buildTestGenGraph', () => {
  it('compiles a graph with stream and invoke methods', () => {
    const graph = buildTestGenGraph({
      provider: { chat: vi.fn(), streamChat: vi.fn() } as any,
    });
    expect(graph).toBeDefined();
    expect(typeof (graph as any).stream).toBe('function');
    expect(typeof (graph as any).invoke).toBe('function');
  });
});