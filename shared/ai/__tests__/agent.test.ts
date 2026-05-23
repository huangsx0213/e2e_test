import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createAgentContext, runAgent, type AgentRole } from '../agent.ts';
import type { AIProvider } from '../provider.ts';

const testRole: AgentRole = {
  name: 'test', systemPromptTemplate: 'You are a test agent. Input: {{input}}',
  requiredSkills: [], inputSchema: z.object({ text: z.string() }), outputSchema: z.object({ result: z.string() }),
};

function createMockProvider(responseContent: string): AIProvider {
  return { chat: vi.fn().mockResolvedValue({ content: responseContent, usage: { promptTokens: 10, completionTokens: 5 } }), streamChat: vi.fn() } as any;
}

describe('runAgent', () => {
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
});