import { describe, it, expect, vi, afterAll } from 'vitest';
import { createAIProvider } from '../infra/provider.ts';

describe('createAIProvider', () => {
  const originalFetch = globalThis.fetch;
  afterAll(() => { globalThis.fetch = originalFetch; });

  it('creates azure-openai provider', () => {
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    expect(provider.streamChat).toBeDefined();
  });

  function mockFetchHeaders(contentType?: string) {
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    const map = new Map(Object.entries(headers));
    return { entries: () => map.entries(), get: (k: string) => map.get(k) ?? null };
  }

  it('uses text.format instead of response_format for azure responses api structured output', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockFetchHeaders(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    });
    globalThis.fetch = fetchSpy as any;

    const provider = createAIProvider({
      type: 'azure-openai',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-key',
      deployment: 'gpt-5.4-mini',
      apiVersion: '2024-02-01',
    });

    for await (const _chunk of provider.streamChat(
      [{ role: 'user', content: 'hi' }],
      {
        agentName: 'test_designer',
        jsonSchema: {
          type: 'json_schema',
          name: 'designer_output',
          schema: { type: 'object', properties: {}, additionalProperties: false },
          strict: true,
        },
      } as any,
    )) {
      // drain stream
    }

    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(requestBody.text.format).toEqual({
      type: 'json_schema',
      name: 'designer_output',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    });
    expect(requestBody.response_format).toBeUndefined();
  });

  it('uses json_object response_format for structured output on OpenAI-compatible providers', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockFetchHeaders(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
    });
    globalThis.fetch = fetchSpy as any;

    const provider = createAIProvider({
      type: 'openai-compatible',
      endpoint: 'https://example.test/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
    });

    for await (const _chunk of provider.streamChat(
      [{ role: 'user', content: 'hi' }],
      {
        agentName: 'test_analyst',
        jsonSchema: {
          type: 'object',
          properties: {
            testConditions: {
              type: 'array',
              items: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
          additionalProperties: false,
        },
      } as any,
    )) {
      // drain stream
    }

    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
  });

});
