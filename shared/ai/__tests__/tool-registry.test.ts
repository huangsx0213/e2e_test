import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../tool-registry.ts';
import type { ToolDef, ToolResult } from '../tool.ts';

function createMockTool(name: string, version: string = 'v1'): ToolDef {
  return {
    name,
    description: `Mock tool ${name}`,
    inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
    version,
    kind: 'function',
    execute: vi.fn().mockResolvedValue({ success: true, data: { output: 'ok' }, metadata: { toolName: name, latencyMs: 0, tokenUsage: { input: 0, output: 0, reasoning: 0 } } }),
  };
}

describe('ToolRegistry', () => {
  it('register and resolve', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('test-tool');
    registry.register(tool);
    expect(registry.resolve('test-tool')).toBe(tool);
    expect(registry.resolve('nonexistent')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('test-tool');
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow('Tool "test-tool" already registered');
  });

  it('unregister removes tool', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('test-tool'));
    expect(registry.resolve('test-tool')).toBeDefined();
    registry.unregister('test-tool');
    expect(registry.resolve('test-tool')).toBeUndefined();
  });

  it('list returns all registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('tool-a'));
    registry.register(createMockTool('tool-b'));
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map(t => t.name)).toContain('tool-a');
    expect(list.map(t => t.name)).toContain('tool-b');
  });

  it('has returns correct boolean', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('test-tool'));
    expect(registry.has('test-tool')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('toOpenAIFunctions returns correct format', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('greet', 'v1'));
    const functions = registry.toOpenAIFunctions();
    expect(functions).toHaveLength(1);
    expect(functions[0]).toEqual({
      type: 'function',
      function: {
        name: 'greet',
        description: 'Mock tool greet',
        parameters: { type: 'object', properties: { input: { type: 'string' } } },
      },
    });
  });

  it('computeVersion returns consistent hash', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('tool-a', 'v1'));
    registry.register(createMockTool('tool-b', 'v2'));
    const version1 = registry.computeVersion();
    const version2 = registry.computeVersion();
    expect(version1).toBe(version2);
    expect(version1).toMatch(/^v[a-f0-9]+$/);
  });

  it('computeVersion changes when tool version changes', () => {
    const registry1 = new ToolRegistry();
    registry1.register(createMockTool('tool-a', 'v1'));
    const version1 = registry1.computeVersion();

    const registry2 = new ToolRegistry();
    registry2.register(createMockTool('tool-a', 'v2'));
    const version2 = registry2.computeVersion();

    expect(version1).not.toBe(version2);
  });

  it('computeVersion is order-independent', () => {
    const registry1 = new ToolRegistry();
    registry1.register(createMockTool('tool-a', 'v1'));
    registry1.register(createMockTool('tool-b', 'v2'));

    const registry2 = new ToolRegistry();
    registry2.register(createMockTool('tool-b', 'v2'));
    registry2.register(createMockTool('tool-a', 'v1'));

    expect(registry1.computeVersion()).toBe(registry2.computeVersion());
  });
});
