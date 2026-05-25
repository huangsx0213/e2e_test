import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createAgentContext, runAgent, AgentTimeoutError, type AgentRole } from '../agent.ts';
import type { AIProvider } from '../provider.ts';
import { invalidateCache } from '../cache.ts';

const testRole: AgentRole = {
  name: 'test', systemPromptTemplate: 'You are a test agent. Input: {{input}}',
  requiredSkills: [], inputSchema: z.object({ text: z.string() }), outputSchema: z.object({ result: z.string() }),
};

function createMockProvider(responseContent: string): AIProvider {
  return { chat: vi.fn().mockResolvedValue({ content: responseContent, usage: { promptTokens: 10, completionTokens: 5 } }), streamChat: vi.fn() } as any;
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
    const provider = { chat: vi.fn().mockResolvedValueOnce({ content: '{"wrong":"field"}', usage: {} }).mockResolvedValueOnce({ content: '{"result":"corrected"}', usage: {} }), streamChat: vi.fn() } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    const result = await runAgent(context, { text: 'test input' });
    expect(result.result).toEqual({ result: 'corrected' });
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('throws after 2 failed attempts', async () => {
    const provider = { chat: vi.fn().mockResolvedValue({ content: 'invalid json {{{', usage: {} }), streamChat: vi.fn() } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' })).rejects.toThrow();
  });

  it('throws AgentTimeoutError on abort error without retrying', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    const provider = { chat: vi.fn().mockRejectedValue(abortError), streamChat: vi.fn() } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' }, { timeoutMs: 5000 })).rejects.toThrow(AgentTimeoutError);
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('throws AgentTimeoutError on TimeoutError without retrying', async () => {
    const timeoutError = new DOMException('Timeout', 'TimeoutError');
    const provider = { chat: vi.fn().mockRejectedValue(timeoutError), streamChat: vi.fn() } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' }, { timeoutMs: 5000 })).rejects.toThrow(AgentTimeoutError);
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-validation errors', async () => {
    const networkError = new Error('Network error');
    const provider = { chat: vi.fn().mockRejectedValue(networkError), streamChat: vi.fn() } as unknown as AIProvider;
    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' })).rejects.toThrow('Network error');
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });
});