import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AgentTool, FunctionTool, resolveToolErrorCode, type ToolDef, type ToolResult } from '../tool.ts';
import type { AgentRole } from '../agent.ts';
import type { AIProvider, StreamChunk } from '../provider.ts';
import { useCacheStore, invalidateCache } from '../cache.ts';

const testRole: AgentRole = {
  name: 'test-tool',
  systemPromptTemplate: 'You are a test tool. Input: {{input}}',
  requiredSkills: [],
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ result: z.string() }),
};

function createMockProvider(responseContent: string): AIProvider {
  const streamChat = vi.fn().mockImplementation(async function*() {
    yield { type: 'content' as const, content: responseContent };
    yield { type: 'done' as const, content: '', usage: { promptTokens: 10, completionTokens: 5 } };
  });
  return { chat: vi.fn(), streamChat, getModelName: () => 'test-model', getProviderType: () => 'test' } as any;
}

describe('AgentTool', () => {
  beforeEach(() => {
    const storeMap: Record<string, { output: string }> = {};
    useCacheStore({
      getCache: vi.fn((key: string) => storeMap[key] ?? undefined),
      setCache: vi.fn((key: string, _ih: string, _pv: string, _m: string, output: string) => {
        storeMap[key] = { output };
      }),
      invalidateByPromptVersion: vi.fn(),
      invalidateAll: vi.fn(() => {
        for (const k of Object.keys(storeMap)) delete storeMap[k];
      }),
    });
    invalidateCache();
  });

  it('has correct name and kind', () => {
    const provider = createMockProvider('{"result":"ok"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    expect(tool.name).toBe('test_tool');
    expect(tool.kind).toBe('agent');
  });

  it('has description extracted from system prompt', () => {
    const provider = createMockProvider('{"result":"ok"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    expect(tool.description).toContain('test tool');
  });

  it('has inputSchema as valid JSON Schema', () => {
    const provider = createMockProvider('{"result":"ok"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.properties).toHaveProperty('text');
  });

  it('has outputSchema as valid JSON Schema', () => {
    const provider = createMockProvider('{"result":"ok"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    expect(tool.outputSchema.type).toBe('object');
    expect(tool.outputSchema.properties).toHaveProperty('result');
  });

  it('execute returns success on valid response', async () => {
    const provider = createMockProvider('{"result":"hello"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    const result = await tool.execute({ text: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ result: 'hello' });
      expect(result.metadata.toolName).toBe('test_tool');
      expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('execute returns error on provider failure', async () => {
    const provider = {
      streamChat: vi.fn().mockImplementation(async function*() {
        throw new Error('Network error');
      }),
    } as unknown as AIProvider;
    const tool = new AgentTool(testRole, () => provider, () => 'v1', () => 'test-model');
    const result = await tool.execute({ text: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as any).error.message).toContain('Network error');
    }
  });

  it('version returns prompt version', () => {
    const provider = createMockProvider('{"result":"ok"}');
    const tool = new AgentTool(testRole, () => provider, () => 'v123', () => 'test-model');
    expect(tool.version).toBe('v123');
  });
});

describe('FunctionTool', () => {
  it('has correct properties', () => {
    const tool = new FunctionTool(
      'greet',
      'Greet a user',
      { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      { type: 'object', properties: { message: { type: 'string' } } },
      'v1',
      async (input: { name: string }) => ({ message: `Hello, ${input.name}!` }),
    );
    expect(tool.name).toBe('greet');
    expect(tool.kind).toBe('function');
    expect(tool.description).toBe('Greet a user');
  });

  it('execute returns success', async () => {
    const tool = new FunctionTool(
      'greet',
      'Greet a user',
      { type: 'object', properties: { name: { type: 'string' } } },
      { type: 'object', properties: { message: { type: 'string' } } },
      'v1',
      async (input: { name: string }) => ({ message: `Hello, ${input.name}!` }),
    );
    const result = await tool.execute({ name: 'World' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ message: 'Hello, World!' });
      expect(result.metadata.toolName).toBe('greet');
    }
  });

  it('execute returns error on handler failure', async () => {
    const tool = new FunctionTool(
      'fail',
      'Always fails',
      { type: 'object' },
      { type: 'object' },
      'v1',
      async () => { throw new Error('Handler error'); },
    );
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as any).error.code).toBe('UNKNOWN');
      expect((result as any).error.message).toContain('Handler error');
    }
  });
});

describe('resolveToolErrorCode', () => {
  it('returns TIMEOUT for timeout errors', () => {
    expect(resolveToolErrorCode({ name: 'TimeoutError' })).toBe('TIMEOUT');
    expect(resolveToolErrorCode({ message: 'timed out after 30s' })).toBe('TIMEOUT');
  });

  it('returns ABORTED for abort errors', () => {
    expect(resolveToolErrorCode({ name: 'AbortError' })).toBe('ABORTED');
    expect(resolveToolErrorCode({ message: 'operation aborted' })).toBe('ABORTED');
  });

  it('returns VALIDATION_ERROR for Zod errors', () => {
    expect(resolveToolErrorCode({ name: 'ZodError', issues: [] })).toBe('VALIDATION_ERROR');
  });

  it('returns PROVIDER_ERROR for rate limit and network errors', () => {
    expect(resolveToolErrorCode({ message: '429 rate limit' })).toBe('PROVIDER_ERROR');
    expect(resolveToolErrorCode({ message: 'fetch failed' })).toBe('PROVIDER_ERROR');
  });

  it('returns UNKNOWN for other errors', () => {
    expect(resolveToolErrorCode(new Error('something went wrong'))).toBe('UNKNOWN');
    expect(resolveToolErrorCode(null)).toBe('UNKNOWN');
  });
});
