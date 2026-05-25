import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createAgentContext, runAgent, AgentTimeoutError, type AgentRole } from '../agent.ts';
import type { AIProvider, StreamChunk } from '../provider.ts';
import { invalidateCache } from '../cache.ts';

const testRole: AgentRole = {
  name: 'test', systemPromptTemplate: 'You are a test agent. Input: {{input}}',
  requiredSkills: [], inputSchema: z.object({ text: z.string() }), outputSchema: z.object({ result: z.string() }),
};

async function* makeStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const c of chunks) yield c;
}

function createMockProvider(responseContent: string): AIProvider {
  const streamChat = vi.fn().mockImplementation(async function*() {
    yield { type: 'content' as const, content: responseContent };
    yield { type: 'done' as const, content: '', usage: { promptTokens: 10, completionTokens: 5 } };
  });
  return { chat: vi.fn(), streamChat } as any;
}

describe('runAgent', () => {
  beforeEach(() => {
    invalidateCache();
  });
  it('calls provider and returns validated output', async () => {
    const provider = createMockProvider('{"result":"hello"}');
    const context = createAgentContext(provider, testRole);
    const result = await runAgent(context, { text: 'test input' });
    expect(result.result).toEqual({ result: 'hello' });
  });

  it('retries once on validation failure', async () => {
    const streamChat = vi.fn()
      .mockImplementationOnce(async function*() {
        yield { type: 'content' as const, content: '{"wrong":"field"}' };
        yield { type: 'done' as const, content: '' };
      })
      .mockImplementationOnce(async function*() {
        yield { type: 'content' as const, content: '{"result":"corrected"}' };
        yield { type: 'done' as const, content: '', usage: { promptTokens: 5, completionTokens: 3 } };
      });
    const provider = { chat: vi.fn(), streamChat } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    const result = await runAgent(context, { text: 'test input' });
    expect(result.result).toEqual({ result: 'corrected' });
    expect(provider.streamChat).toHaveBeenCalledTimes(2);
  });

  it('throws after 2 failed attempts', async () => {
    const streamChat = vi.fn().mockImplementation(async function*() {
      yield { type: 'content' as const, content: 'invalid json {{{' };
      yield { type: 'done' as const, content: '' };
    });
    const provider = { chat: vi.fn(), streamChat } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' })).rejects.toThrow();
  });

  it('throws AgentTimeoutError on abort error without retrying', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    const streamChat = vi.fn().mockImplementation(async function*() {
      throw abortError;
    });
    const provider = { chat: vi.fn(), streamChat } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' }, { timeoutMs: 5000 })).rejects.toThrow(AgentTimeoutError);
    expect(provider.streamChat).toHaveBeenCalledTimes(1);
  });

  it('throws AgentTimeoutError on TimeoutError without retrying', async () => {
    const timeoutError = new DOMException('Timeout', 'TimeoutError');
    const streamChat = vi.fn().mockImplementation(async function*() {
      throw timeoutError;
    });
    const provider = { chat: vi.fn(), streamChat } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' }, { timeoutMs: 5000 })).rejects.toThrow(AgentTimeoutError);
    expect(provider.streamChat).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-validation errors', async () => {
    const networkError = new Error('Network error');
    const streamChat = vi.fn().mockImplementation(async function*() {
      throw networkError;
    });
    const provider = { chat: vi.fn(), streamChat } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' })).rejects.toThrow('Network error');
    expect(provider.streamChat).toHaveBeenCalledTimes(1);
  });
});