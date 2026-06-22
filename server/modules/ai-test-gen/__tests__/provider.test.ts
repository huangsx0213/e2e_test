import { describe, it, expect, vi, afterAll } from 'vitest';
import { createAIProvider, readResponsesApiSSEStream } from '../infra/provider.ts';

describe('createAIProvider', () => {
  const originalFetch = globalThis.fetch;
  afterAll(() => { globalThis.fetch = originalFetch; });

  it('creates azure-openai provider', () => {
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    expect(provider.chat).toBeDefined();
    expect(provider.streamChat).toBeDefined();
  });

  function mockFetchHeaders(contentType?: string) {
    const headers: Record<string, string> = {};
    if (contentType) headers['content-type'] = contentType;
    const map = new Map(Object.entries(headers));
    return { entries: () => map.entries(), get: (k: string) => map.get(k) ?? null };
  }

  const mockResponseBase = {
    id: 'resp_test',
    object: 'response' as const,
    created_at: 1234567890,
    status: 'completed' as const,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: {},
    temperature: 0.3,
    tool_choice: null,
    tools: [],
    parallel_tool_calls: false,
    model: 'gpt-4o',
  };

  it('azure provider calls correct endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockFetchHeaders('application/json'),
      json: () => Promise.resolve({
        ...mockResponseBase,
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"result":"ok"}' }],
        }],
        usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: {} },
      }),
    }) as any;
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    const response = await provider.chat([{ role: 'user', content: 'hi' }]);
    expect(response.content).toBe('{"result":"ok"}');
    expect(response.usage?.promptTokens).toBe(10);
  });

  it('handles error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: mockFetchHeaders(),
      text: () => Promise.resolve('Rate limited'),
    }) as any;
    const provider = createAIProvider({ type: 'azure-openai', endpoint: 'https://test.openai.azure.com', apiKey: 'test-key', deployment: 'gpt-4o', apiVersion: '2024-02-01' });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('429');
  });

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

  it('does not send response_format for json_schema (not supported by some providers)', async () => {
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
    expect(requestBody.response_format).toBeUndefined();
  });

  it('parses generic responses api tool calls without extra diagnostics', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const encoder = new TextEncoder();
    const chunks = [
      'event: response.output_item.added\n' +
      'data: {"item":{"type":"function_call","call_id":"call-1","name":"example_tool"}}\n\n' +
      'event: response.output_item.done\n' +
      'data: {"item":{"type":"function_call","call_id":"call-1","name":"example_tool","arguments":"{}"}}\n\n' +
      'data: [DONE]\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const emitted: any[] = [];
    for await (const chunk of readResponsesApiSSEStream(reader, decoder)) {
      emitted.push(chunk);
    }

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tool_call_end for example_tool'));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('output_result args summary:'));
    expect(emitted.some((chunk) => chunk.toolCall?.name === 'example_tool' && !chunk.toolCall?.malformed)).toBe(true);
    logSpy.mockRestore();
  });

  it('does not emit extra diagnostics when a generic tool call falls back at stream end', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const encoder = new TextEncoder();
    const chunks = [
      'event: response.output_item.added\n' +
      'data: {"item":{"type":"function_call","call_id":"call-1","name":"example_tool"}}\n\n' +
      'event: response.function_call_arguments.delta\n' +
      'data: {"delta":"{}"}\n\n' +
      'data: [DONE]\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const emitted: any[] = [];
    for await (const chunk of readResponsesApiSSEStream(reader, decoder)) {
      emitted.push(chunk);
    }

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('fallback tool_call_end for example_tool'));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('output_result fallback args summary:'));
    expect(emitted.some((chunk) => chunk.toolCall?.malformed)).toBe(false);
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('marks malformed generic tool call fallback payloads instead of silently returning an empty object', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const encoder = new TextEncoder();
    const chunks = [
      'event: response.output_item.added\n' +
      'data: {"item":{"type":"function_call","call_id":"call-1","name":"example_tool"}}\n\n' +
      'event: response.function_call_arguments.delta\n' +
      'data: {"delta":"{\\\"broken\\\":1"}\n\n' +
      'data: [DONE]\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const emitted: any[] = [];
    for await (const chunk of readResponsesApiSSEStream(reader, decoder)) {
      emitted.push(chunk);
    }

    const malformedChunk = emitted.find((chunk) => chunk.toolCall?.name === 'example_tool' && chunk.toolCall?.malformed);
    expect(malformedChunk.toolCall.malformed.source).toBe('responses_stream_end');
    expect(malformedChunk.toolCall.malformed.rawArgsPreview).toContain('{\"broken\":1');
    warnSpy.mockRestore();
  });

  it('logs when function_call_arguments.delta arrives before an active tool call', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const encoder = new TextEncoder();
    const chunks = [
      'event: response.function_call_arguments.delta\n' +
      'data: {"delta":"{}"}\n\n' +
      'data: [DONE]\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for await (const _chunk of readResponsesApiSSEStream(reader, decoder)) {
      // drain stream
    }

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('function_call_arguments.delta arrived before active tool call'));
    warnSpy.mockRestore();
  });
});
