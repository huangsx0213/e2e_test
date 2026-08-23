import { beforeEach, describe, expect, it, vi } from 'vitest';

const nodeOptions = vi.hoisted(() => ({
  preparation: [] as any[],
  analyst: [] as any[],
  designer: [] as any[],
  quality: [] as any[],
}));

vi.mock('../graph/nodes/preparation.ts', () => ({
  makePreparationNode: vi.fn((options: any) => {
    nodeOptions.preparation.push(options);
    return async () => ({});
  }),
}));
vi.mock('../graph/nodes/analyst.ts', () => ({
  makeAnalystNode: vi.fn((options: any) => {
    nodeOptions.analyst.push(options);
    return async () => ({});
  }),
}));
vi.mock('../graph/nodes/designer.ts', () => ({
  makeDesignerNode: vi.fn((options: any) => {
    nodeOptions.designer.push(options);
    return async () => ({});
  }),
}));
vi.mock('../graph/nodes/quality.ts', () => ({
  makeQualityNode: vi.fn((options: any) => {
    nodeOptions.quality.push(options);
    return async () => ({});
  }),
}));

import { buildTestGenGraph } from '../graph/graph.ts';

describe('buildTestGenGraph', () => {
  beforeEach(() => {
    nodeOptions.preparation.length = 0;
    nodeOptions.analyst.length = 0;
    nodeOptions.designer.length = 0;
    nodeOptions.quality.length = 0;
  });

  it('compiles a graph with stream and invoke methods', () => {
    const graph = buildTestGenGraph({
      provider: { chat: vi.fn(), streamChat: vi.fn() } as any,
    });
    expect(graph).toBeDefined();
    expect(typeof (graph as any).stream).toBe('function');
    expect(typeof (graph as any).invoke).toBe('function');
  });

  it('holds HTML runtime in node closures without adding it to graph state', () => {
    const htmlKnowledge = { reference: { knowledgeSetId: 'set-1' } } as any;

    buildTestGenGraph({
      provider: { chat: vi.fn(), streamChat: vi.fn() } as any,
      htmlKnowledge,
    });

    expect(nodeOptions.preparation.at(-1)?.htmlKnowledge).toBe(htmlKnowledge);
    expect(nodeOptions.analyst.at(-1)?.htmlKnowledge).toBe(htmlKnowledge);
    expect(nodeOptions.designer.at(-1)?.htmlKnowledge).toBe(htmlKnowledge);
    expect(nodeOptions.quality.at(-1)?.htmlKnowledge).toBe(htmlKnowledge);
  });
});
