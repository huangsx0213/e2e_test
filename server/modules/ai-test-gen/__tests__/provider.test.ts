import { describe, it, expect, vi, afterAll } from 'vitest';
import { createAIProvider, createAIProviderWithFallback, readResponsesApiSSEStream } from '../infra/provider.ts';

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

  it('uses text.format instead of response_format for azure responses api structured output', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
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

  it('normalizes plain json schema structured output for openai-compatible streaming requests', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
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
    expect(requestBody.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        type: 'json_schema',
        name: 'test_analyst',
        schema: {
          type: 'object',
          properties: {
            testConditions: {
              type: 'array',
              items: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
          additionalProperties: false,
        },
        strict: true,
      },
    });
  });

  it('falls back for streamChat when the primary provider returns a 500 before streaming starts', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('{"message":"primary failed","type":"Internal Server Error","code":500}'),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
      });
    globalThis.fetch = fetchSpy as any;

    const provider = createAIProviderWithFallback({
      type: 'openai-compatible',
      endpoint: 'https://primary.example/v1',
      apiKey: 'primary-key',
      model: 'gpt-primary',
      fallbackConfigs: [{
        type: 'openai-compatible',
        endpoint: 'https://fallback.example/v1',
        apiKey: 'fallback-key',
        model: 'gpt-fallback',
      }],
    });

    for await (const _chunk of provider.streamChat([{ role: 'user', content: 'hi' }], { agentName: 'quality_manager' })) {
      // drain stream
    }

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('https://primary.example/v1/chat/completions');
    expect(String(fetchSpy.mock.calls[1][0])).toContain('https://fallback.example/v1/chat/completions');
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
