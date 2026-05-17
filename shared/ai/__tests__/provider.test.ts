import { describe, it, expect, vi, afterAll } from 'vitest';
import { createAIProvider } from '../provider.ts';

describe('createAIProvider', () => {
  const originalFetch = globalThis.fetch;
  afterAll(() => { globalThis.fetch = originalFetch; });

  it('creates azure-openai provider', () => {
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    expect(provider.chat).toBeDefined();
    expect(provider.streamChat).toBeDefined();
  });

  it('azure provider calls correct endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '{"result":"ok"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }) as any;
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    const response = await provider.chat([{ role: 'user', content: 'hi' }]);
    expect(response.content).toBe('{"result":"ok"}');
    expect(response.usage?.promptTokens).toBe(10);
  });

  it('handles error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve('Rate limited') }) as any;
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('429');
  });
});