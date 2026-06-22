import OpenAI, { APIError } from 'openai';
import { Log } from '../../../shared/services/logger.ts';

export type ProviderConfig =
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string }
  | { type: 'openai-compatible'; endpoint?: string; apiKey: string; model: string };

export interface ToolCall {
  name: string;
  args: unknown;
  id: string;
  malformed?: {
    source: 'responses_output_item_done' | 'responses_stream_end';
    rawArgsLength: number;
    rawArgsPreview: string;
    parseError: string;
  };
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  not?: JsonSchema;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  format?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ type: 'function'; function: { name: string; arguments: string }; id: string }>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  agentName?: string;
  tools?: Array<{
    name: string;
    description: string;
    strict?: boolean;
    parameters: JsonSchema;
  }>;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

function formatToolsForApi(tools: ChatOptions['tools']): Array<{ type: 'function'; function: { name: string; description: string; strict: boolean; parameters: JsonSchema } }> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      strict: t.strict ?? false,
      parameters: t.parameters,
    },
  }));
}

export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}

export interface StreamChunk {
  type: 'reasoning' | 'content' | 'done' | 'error' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: unknown;
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
  /**
   * Native finish reason from the provider. Normalized to 'length' when output
   * was truncated (Chat Completions finish_reason='length'; Responses API
   * incomplete_details.reason='max_output_tokens'). Surfaced on the 'done' chunk
   * so callers can distinguish truncation failures from schema failures.
   */
  finishReason?: string;
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
}

function sanitizeSchemaName(value: string | undefined): string {
  const cleaned = String(value || 'structured_output')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'structured_output';
}

function normalizeStructuredOutputSchema(
  jsonSchema: Record<string, unknown>,
  nameHint?: string,
): Record<string, unknown> {
  if (
    jsonSchema?.type === 'json_schema'
    && typeof jsonSchema.schema === 'object'
    && jsonSchema.schema
  ) {
    return {
      ...jsonSchema,
      name: jsonSchema.name || sanitizeSchemaName(nameHint),
      strict: jsonSchema.strict ?? true,
    };
  }

  return {
    name: sanitizeSchemaName(nameHint),
    schema: jsonSchema,
    strict: true,
  };
}

function buildMalformedToolCall(
  toolCall: { id: string; name: string },
  rawArgs: string,
  error: unknown,
  source: 'responses_output_item_done' | 'responses_stream_end',
): ToolCall {
  return {
    id: toolCall.id,
    name: toolCall.name,
    args: {},
    malformed: {
      source,
      rawArgsLength: rawArgs.length,
      rawArgsPreview: rawArgs.slice(0, 200),
      parseError: String(error),
    },
  };
}

export function mergeSignals(signal1?: AbortSignal, signal2?: AbortSignal): AbortSignal | undefined {
  if (!signal1 && !signal2) return undefined;
  if (!signal1) return signal2;
  if (!signal2) return signal1;
  const controller = new AbortController();
  const abort = () => {
    if (controller.signal.aborted) return;
    const reason = signal1.aborted ? signal1.reason : signal2.reason;
    controller.abort(reason);
  };
  signal1.addEventListener('abort', abort);
  signal2.addEventListener('abort', abort);
  if (signal1.aborted || signal2.aborted) abort();
  return controller.signal;
}

function formatSdkError(err: unknown, providerName: string, agentTag: string, extra?: string): Error {
  if (err instanceof APIError) {
    return new Error(`Provider ${providerName} error ${err.status}${agentTag}: ${err.message}${extra ? ` ${extra}` : ''}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function createAIProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'azure-openai': return createAzureOpenAIProvider(config);
    case 'openai-compatible': return createOpenAICompatibleProvider(config);
  }
}

// ─── Provider Factories ───

function createAzureOpenAIProvider(config: ProviderConfig & { type: 'azure-openai' }): AIProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: `${config.endpoint.replace(/\/+$/, '')}/openai`,
    defaultQuery: { 'api-version': config.apiVersion },
    defaultHeaders: { 'api-key': config.apiKey },
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
  });

  function buildInput(messages: ChatMessage[]): unknown[] {
    const input: unknown[] = [];
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls) {
        if (m.content) input.push({ role: 'assistant', content: m.content });
        for (const tc of m.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments),
          });
        }
      } else if (m.role === 'tool' && m.toolCallId) {
        input.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content || ' ' });
      } else {
        input.push({ role: m.role, content: m.content || '' });
      }
    }
    return input;
  }

  function buildTextConfig(options?: ChatOptions): Record<string, unknown> | undefined {
    if (options?.jsonSchema) {
      return { format: { type: 'json_schema' as const, ...normalizeStructuredOutputSchema(options.jsonSchema, options?.agentName) } };
    }
    if (options?.responseFormat === 'json_object') {
      return { format: { type: 'json_object' } };
    }
    return undefined;
  }

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const input = buildInput(messages);
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    Log.for('provider').info(`[azure-sdk] POST${agentTag} input=${input.length} items`);

    const fetchStart = Date.now();
    let response: Awaited<ReturnType<typeof client.responses.create>>;
    try {
      response = await client.responses.create({
      model: config.deployment,
      input: input as any,
      temperature: options?.temperature ?? 0.3,
      max_output_tokens: options?.maxTokens ?? 65536,
      text: buildTextConfig(options) as any,
      ...(() => {
        if (!options?.tools?.length) return {};
        return {
          tools: options.tools.map(t => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            strict: t.strict ?? false,
            parameters: t.parameters as any,
          })),
        };
      })(),
    });
    } catch (err) {
      Log.for('provider').error(`[azure-sdk] request failed${agentTag}: model=${config.deployment} input=${input.length} items temperature=${options?.temperature ?? 0.3} max_tokens=${options?.maxTokens ?? 65536} tools=${options?.tools?.length ?? 0}`);
      throw formatSdkError(err, 'azure', agentTag, `endpoint=${config.endpoint} model=${config.deployment}`);
    }

    const latency = Date.now() - fetchStart;
    const content = response.output_text ?? '';
    const reasoners = response.output?.filter((o): o is { type: 'reasoning'; [key: string]: unknown } => o.type === 'reasoning') ?? [];
    const reasoningContent = reasoners.map((r: any) => r.summary || '').filter(Boolean).join('\n') || undefined;
    const toolCalls = response.output
      ?.filter((o): o is { type: 'function_call'; name: string; arguments: string; call_id: string } => o.type === 'function_call')
      .map((o) => ({
        name: o.name,
        args: JSON.parse(o.arguments),
        id: o.call_id,
      }));

    const formatted = formatContent(content);
    Log.for('provider').info(`[azure-sdk] ${latency}ms${agentTag}:${formatted}  usage: ${response.usage?.input_tokens ?? '?'}in/${response.usage?.output_tokens ?? '?'}out`);

    return {
      content,
      reasoningContent,
      toolCalls,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const input = buildInput(messages);
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    Log.for('provider').info(`[azure-sdk] POST${agentTag} input=${input.length} items`);

    let stream: Awaited<ReturnType<typeof client.responses.create>>;
    try {
      stream = await client.responses.create({
      model: config.deployment,
      input: input as any,
      temperature: options?.temperature ?? 0.3,
      max_output_tokens: options?.maxTokens ?? 65536,
      stream: true,
      text: buildTextConfig(options) as any,
      ...(() => {
        if (!options?.tools?.length) return {};
        return {
          tools: options.tools.map(t => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            strict: t.strict ?? false,
            parameters: t.parameters as any,
          })),
        };
      })(),
    });
    } catch (err) {
      Log.for('provider').error(`[azure-sdk] stream request failed${agentTag}: model=${config.deployment} input=${input.length} items temperature=${options?.temperature ?? 0.3} max_tokens=${options?.maxTokens ?? 65536} tools=${options?.tools?.length ?? 0}`);
      throw formatSdkError(err, 'azure', agentTag, `endpoint=${config.endpoint} model=${config.deployment}`);
    }

    let currentToolCall: { id: string; name: string; args: string } | null = null;
    let finishReason: string | undefined;
    let usageData: any;
    const abortHandler = () => { if (stream.controller) stream.controller.abort(); };
    signal.addEventListener('abort', abortHandler);

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            yield { type: 'content', content: event.delta };
            break;
          case 'response.reasoning_summary_text.delta':
          case 'response.reasoning_text.delta':
            yield { type: 'reasoning', content: event.delta };
            break;
          case 'response.function_call_arguments.delta':
            if (currentToolCall) {
              currentToolCall.args += event.delta;
              yield { type: 'tool_call_delta', content: event.delta, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            }
            break;
          case 'response.output_item.added':
            if (event.item?.type === 'function_call') {
              if (currentToolCall) {
                try {
                  yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
                } catch { /* finalize on next event */ }
              }
              currentToolCall = { id: (event.item as any).call_id || event.item.id, name: (event.item as any).name, args: '' };
              yield { type: 'tool_call_start', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            }
            break;
          case 'response.output_item.done':
            if (event.item?.type === 'function_call' && currentToolCall) {
              const finalArgs = (event.item as any).arguments || currentToolCall.args;
              try {
                yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(finalArgs) } };
              } catch (e) {
                yield { type: 'tool_call_end', content: '', toolCall: buildMalformedToolCall(currentToolCall, finalArgs, e, 'responses_output_item_done') };
              }
              currentToolCall = null;
            }
            break;
          case 'response.completed':
            if (event.response?.usage) usageData = event.response.usage;
            if (event.response?.status === 'incomplete' && (event.response as any)?.incomplete_details?.reason === 'max_output_tokens') {
              finishReason = 'length';
            }
            break;
        }
      }
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }

    if (currentToolCall) {
      try {
        yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
      } catch (error) {
        yield { type: 'tool_call_end', content: '', toolCall: buildMalformedToolCall(currentToolCall, currentToolCall.args, error, 'responses_stream_end') };
      }
    }

    if (finishReason === 'length') {
      Log.for('provider').warn(`[azure-sdk] Responses API stream truncated by max_output_tokens. Output may be incomplete.`);
    }

    yield {
      type: 'done',
      content: '',
      finishReason,
      usage: usageData ? {
        promptTokens: usageData.input_tokens ?? 0,
        completionTokens: usageData.output_tokens ?? 0,
        reasoningTokens: usageData.output_tokens_details?.reasoning_tokens ?? 0,
      } : undefined,
    };
  }

  return { chat, streamChat };
}

function createOpenAICompatibleProvider(config: ProviderConfig & { type: 'openai-compatible' }): AIProvider {
  const raw = (config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
  const baseUrl = raw.endsWith('/v1') ? raw : `${raw}/v1`;

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
  });

  function serializeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
      if (m.role === 'assistant' && m.toolCalls) {
        return {
          role: 'assistant',
          content: m.content ?? null,
          tool_calls: m.toolCalls,
        };
      }
      if (m.role === 'tool' && m.toolCallId) {
        return {
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.toolCallId,
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  function buildTools(options?: ChatOptions) {
    const t = formatToolsForApi(options?.tools);
    return t ? { tools: t as any, tool_choice: options?.toolChoice } : {};
  }

  function buildResponseFormat(options?: ChatOptions) {
    if (options?.responseFormat === 'json_object') {
      return { type: 'json_object' as const };
    }
    return undefined;
  }

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    Log.for('provider').info(`[openai-compat-sdk] POST${agentTag} messages=${messages.length}`);
    const fetchStart = Date.now();

    let completion: Awaited<ReturnType<typeof client.chat.completions.create>>;
    try {
      completion = await client.chat.completions.create({
      model: config.model!,
      messages: serializeMessages(messages),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 65536,
      response_format: buildResponseFormat(options),
      ...buildTools(options),
    });
    } catch (err) {
      Log.for('provider').error(`[openai-compat-sdk] request failed${agentTag}: model=${config.model} endpoint=${config.endpoint || 'default'} messages=${messages.length} temperature=${options?.temperature ?? 0.3} max_tokens=${options?.maxTokens ?? 65536} tools=${options?.tools?.length ?? 0}`);
      throw formatSdkError(err, 'openai-compat', agentTag, `endpoint=${config.endpoint || 'default'} model=${config.model}`);
    }

    const latency = Date.now() - fetchStart;
    const msg = completion.choices[0]?.message;
    const content = msg?.content ?? '';
    const toolCalls = msg?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments),
      id: tc.id,
    }));

    const formatted = formatContent(content);
    Log.for('provider').info(`[openai-compat-sdk] ${latency}ms${agentTag}:${formatted}  usage: ${completion.usage?.prompt_tokens ?? '?'}in/${completion.usage?.completion_tokens ?? '?'}out`);

    return {
      content,
      reasoningContent: (msg as any)?.reasoning_content || (msg as any)?.reasoning || undefined,
      toolCalls,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        reasoningTokens: completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    Log.for('provider').info(`[openai-compat-sdk] POST${agentTag} messages=${messages.length}`);

    let stream: Awaited<ReturnType<typeof client.chat.completions.create>>;
    try {
      stream = await client.chat.completions.create({
      model: config.model!,
      messages: serializeMessages(messages),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 65536,
      stream: true,
      stream_options: { include_usage: true },
      response_format: buildResponseFormat(options),
      ...buildTools(options),
    });
    } catch (err) {
      Log.for('provider').error(`[openai-compat-sdk] stream request failed${agentTag}: model=${config.model} endpoint=${config.endpoint || 'default'} messages=${messages.length} temperature=${options?.temperature ?? 0.3} max_tokens=${options?.maxTokens ?? 65536} tools=${options?.tools?.length ?? 0}`);
      throw formatSdkError(err, 'openai-compat', agentTag, `endpoint=${config.endpoint || 'default'} model=${config.model}`);
    }

    let currentToolCall: { id: string; name: string; args: string } | null = null;
    let finishReason: string | undefined;
    let usageData: any;

    for await (const chunk of stream) {
      if (chunk.usage) usageData = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      const chunkFinishReason = chunk.choices?.[0]?.finish_reason;
      if (chunkFinishReason) finishReason = chunkFinishReason;

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            if (currentToolCall) {
              try {
                yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
              } catch { /* finalize on next event */ }
            }
            currentToolCall = { id: tc.id, name: tc.function?.name ?? '', args: '' };
            yield { type: 'tool_call_start', content: '', toolCall: { id: tc.id, name: tc.function?.name ?? '', args: {} } };
            if (tc.function?.arguments) {
              currentToolCall.args += tc.function.arguments;
              yield { type: 'tool_call_delta', content: tc.function.arguments, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            }
          } else if (currentToolCall) {
            if (tc.function?.name) {
              currentToolCall.name = tc.function.name;
            }
            if (tc.function?.arguments !== undefined) {
              currentToolCall.args += tc.function.arguments;
              yield { type: 'tool_call_delta', content: tc.function.arguments, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            }
          }
        }
      }

      const reasoningText = (delta as any)?.reasoning_content || (delta as any)?.reasoning;
      if (reasoningText) yield { type: 'reasoning', content: reasoningText };

      if (delta?.content) yield { type: 'content', content: delta.content };
    }

    if (currentToolCall) {
      try {
        yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
      } catch {
        yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
      }
    }

    if (finishReason === 'length') {
      Log.for('provider').warn(`[openai-compat-sdk] Chat Completions stream truncated (finish_reason='length').`);
    }

    yield {
      type: 'done',
      content: '',
      finishReason,
      usage: usageData ? {
        promptTokens: usageData.prompt_tokens ?? 0,
        completionTokens: usageData.completion_tokens ?? 0,
        reasoningTokens: (usageData as any)?.completion_tokens_details?.reasoning_tokens ?? 0,
      } : undefined,
    };
  }

  return { chat, streamChat };
}

function formatContent(content: string | null | undefined): string {
  if (!content) return ' (empty)';
  try {
    const parsed = JSON.parse(content);
    return '\n' + JSON.stringify(parsed, null, 2);
  } catch {
    return ' ' + content;
  }
}

const FETCH_TIMEOUT_MS = 900_000;
const FETCH_RETRY_COUNT = 2;
const FETCH_RETRY_DELAY_MS = 2000;

const TRANSIENT_ERRORS = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

async function fetchWithRetry(url: string, init: RequestInit, retries = FETCH_RETRY_COUNT, attempt = 0): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err: any) {
    const code = err.cause?.code || err.code || '';
    if (retries > 0 && TRANSIENT_ERRORS.has(code)) {
      const delay = FETCH_RETRY_DELAY_MS * Math.pow(2, attempt);
      Log.for('fetch').warn(`${code} for ${url}, retrying in ${delay}ms (${retries} left)...`);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, init, retries - 1, attempt + 1);
    }
    throw err;
  }
}

async function parseChatResponse(response: Response, providerName: string, fetchStart: number, agentTag: string): Promise<ChatResponse> {
  const plog = Log.for('provider');
  plog.info(`response ${response.status} in ${Date.now() - fetchStart}ms${agentTag}`);
  if (!response.ok) {
    const errorText = await response.text();
    plog.error(`error body${agentTag}: ${errorText}`);
    const errorPrefix = providerName === 'azure' ? 'Azure OpenAI error'
      : providerName === 'openai-compat' ? 'OpenAI Compatible error'
      : 'Provider error';
    throw new Error(`${errorPrefix} ${response.status}: ${errorText}`);
  }
  const data = await response.json() as any;
  const msg = data.choices[0].message;
  const toolCalls = msg.tool_calls?.map((tc: any) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
    id: tc.id,
  }));
  const formatted = formatContent(msg.content);
  plog.info(`result${agentTag}:${formatted}  usage: ${data.usage?.prompt_tokens ?? '?'}in/${data.usage?.completion_tokens ?? '?'}out`);
  return {
    content: msg.content ?? '',
    reasoningContent: msg.reasoning_content || msg.reasoning || (msg.reasoning_details?.map((rd: any) => rd.text || rd.summary || '').filter(Boolean).join('\n')) || undefined,
    toolCalls,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  };
}

async function* readSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder): AsyncGenerator<StreamChunk> {
  let buffer = '';
  let usageData: any = null;
  let currentToolCall: { id: string; name: string; args: string } | null = null;
  let finishReason: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.usage) {
            usageData = data.usage;
          }
          // Capture finish_reason from any chunk that carries it (typically the last).
          const chunkFinishReason = data.choices?.[0]?.finish_reason;
          if (chunkFinishReason) {
            finishReason = chunkFinishReason;
          }
          const delta = data.choices?.[0]?.delta;
          if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  if (currentToolCall) {
                    try {
                      yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
                    } catch {
                      yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
                    }
                  }
                  currentToolCall = { id: tc.id, name: tc.function.name, args: '' };
                  yield { type: 'tool_call_start', content: '', toolCall: { id: tc.id, name: tc.function.name, args: {} } };
                  // Some providers send full arguments in the first chunk
                  if (tc.function?.arguments) {
                    currentToolCall.args += tc.function.arguments;
                    yield { type: 'tool_call_delta', content: tc.function.arguments, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
                  }
                } else if (tc.function?.arguments) {
                  if (currentToolCall) {
                    currentToolCall.args += tc.function.arguments;
                    yield { type: 'tool_call_delta', content: tc.function.arguments, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
                  }
                }
              }
            }
            // Reasoning content: multiple field names across providers
            // - DeepSeek: delta.reasoning_content
            // - Azure OpenAI GPT-5: delta.reasoning
            // - Some providers: delta.reasoning_details[] with type "reasoning.text" or "reasoning.summary"
            const reasoningText = delta?.reasoning_content || delta?.reasoning;
            if (reasoningText) yield { type: 'reasoning', content: reasoningText };
            if (delta?.reasoning_details) {
              for (const rd of delta.reasoning_details) {
                if (rd.type === 'reasoning.text' && rd.text) yield { type: 'reasoning', content: rd.text };
                if (rd.type === 'reasoning.summary' && rd.summary) yield { type: 'reasoning', content: rd.summary };
              }
            }
            if (delta?.content) yield { type: 'content', content: delta.content };
        } catch {}
      }
    }
  }
  if (currentToolCall) {
    try {
      yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
    } catch {
      yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
    }
  }
  // Surface truncation: Chat Completions reports finish_reason='length' when the
  // response was cut off at max_tokens. This is the most common cause of malformed
  // JSON in structured-output extraction, so make it visible to callers.
  if (finishReason === 'length') {
    Log.for('provider').warn(`Chat Completions stream truncated by max_tokens (finish_reason='length'). Output may be incomplete — JSON parsing may fail downstream.`);
  }
  yield { type: 'done', content: '', finishReason, usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
}

/** Read SSE stream from the Responses API (Azure OpenAI GPT-5 reasoning models) */
export async function* readResponsesApiSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder): AsyncGenerator<StreamChunk> {
  let buffer = '';
  let usageData: any = null;
  let currentToolCall: { id: string; name: string; args: string } | null = null;
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));

          // Capture usage from response.completed
          if (data.response?.usage) {
            usageData = data.response.usage;
          }
          // Detect truncation: Responses API marks an incomplete response with
          // status 'incomplete' and incomplete_details.reason='max_output_tokens'.
          // response.incomplete and response.completed both carry data.response.
          if (
            !finishReason &&
            data.response?.status === 'incomplete' &&
            data.response?.incomplete_details?.reason === 'max_output_tokens'
          ) {
            finishReason = 'length';
          }

          // Reasoning summary text delta
          if (eventType === 'response.reasoning_summary_text.delta' && data.delta) {
            yield { type: 'reasoning', content: data.delta };
          }
          // Reasoning text delta (full chain-of-thought, if available)
          if ((eventType === 'response.reasoning_text.delta' || eventType === 'response.reasoning.delta') && data.delta) {
            yield { type: 'reasoning', content: data.delta };
          }

          // Output text delta (the actual response content)
          if (eventType === 'response.output_text.delta' && data.delta) {
            yield { type: 'content', content: data.delta };
          }

          // Function call arguments delta
          if (eventType === 'response.function_call_arguments.delta' && data.delta) {
            if (currentToolCall) {
              currentToolCall.args += data.delta;
              yield { type: 'tool_call_delta', content: data.delta, toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            } else {
              Log.for('provider').warn(`function_call_arguments.delta arrived before active tool call: deltaLen=${String(data.delta).length}`);
            }
          }

          // Function call started
          if (eventType === 'response.output_item.added') {
            const item = data.item;
            if (item?.type === 'function_call') {
              // Finalize previous tool call if any
              if (currentToolCall) {
                try {
                  yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: JSON.parse(currentToolCall.args) } };
                } catch {
                  yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
                }
              }
              currentToolCall = { id: item.call_id || item.id, name: item.name, args: '' };
              Log.for('provider').info(`tool_call_start for ${currentToolCall.name}: id=${currentToolCall.id}`);
              yield { type: 'tool_call_start', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: {} } };
            }
          }

          // Function call completed
          if (eventType === 'response.output_item.done') {
            const item = data.item;
            if (item?.type === 'function_call' && currentToolCall) {
              const finalArgs = item.arguments || currentToolCall.args;
              Log.for('provider').info(`tool_call_end for ${currentToolCall.name}: accumulated=${currentToolCall.args.length}chars, item.arguments=${item.arguments ? 'present' : 'missing'}`);
              try {
                const parsedArgs = JSON.parse(finalArgs);
                yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: parsedArgs } };
              } catch (e) {
                Log.for('provider').warn(`Failed to parse tool call args for ${currentToolCall.name}: ${finalArgs.slice(0, 200)}, error: ${e}`);
                yield { type: 'tool_call_end', content: '', toolCall: buildMalformedToolCall(currentToolCall, finalArgs, e, 'responses_output_item_done') };
              }
              currentToolCall = null;
            }
          }
        } catch (error) {
          if (eventType.startsWith('response.function_call') || eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
            Log.for('provider').warn(`Failed to process SSE event ${eventType}: ${String(error).slice(0, 300)}`);
          }
        }
        eventType = '';
      } else if (line.trim() === '') {
        eventType = '';
      }
    }
  }

  if (currentToolCall) {
    Log.for('provider').warn(`fallback tool_call_end for ${currentToolCall.name}: accumulated=${currentToolCall.args.length}chars, preview=${currentToolCall.args.slice(0, 200)}`);
    try {
      const parsedArgs = JSON.parse(currentToolCall.args);
      yield { type: 'tool_call_end', content: '', toolCall: { id: currentToolCall.id, name: currentToolCall.name, args: parsedArgs } };
    } catch (error) {
      yield { type: 'tool_call_end', content: '', toolCall: buildMalformedToolCall(currentToolCall, currentToolCall.args, error, 'responses_stream_end') };
    }
  }
  // Surface truncation: Responses API sets incomplete_details.reason='max_output_tokens'
  // when output was cut off. This is the most common cause of malformed JSON in
  // structured-output extraction, so make it visible to callers.
  if (finishReason === 'length') {
    Log.for('provider').warn(`Responses API stream truncated by max_output_tokens (incomplete_details.reason='max_output_tokens'). Output may be incomplete — JSON parsing may fail downstream.`);
  }
  yield {
    type: 'done',
    content: '',
    finishReason,
    usage: usageData ? {
      promptTokens: usageData.input_tokens ?? 0,
      completionTokens: usageData.output_tokens ?? 0,
      reasoningTokens: usageData.output_tokens_details?.reasoning_tokens ?? 0,
    } : undefined,
  };
}
