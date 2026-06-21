import { Log } from '../../../shared/services/logger.ts';

export interface ExtendedProviderConfig {
  type: 'azure-openai' | 'openai-compatible';
  endpoint?: string;
  apiKey: string;
  deployment?: string;
  apiVersion?: string;
  model?: string;
  fallbackConfigs?: ExtendedProviderConfig[];
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}

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
    type: 'json_schema',
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

export type ProviderConfig =
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string }
  | { type: 'openai-compatible'; endpoint?: string; apiKey: string; model: string };

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

// ─── Logger ───

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const consoleLogger: Logger = {
  info: (msg) => Log.raw(msg),
  warn: (msg) => Log.raw(`⚠ ${msg}`),
  error: (msg) => Log.raw(`✖ ${msg}`),
};

// ─── Circuit Breaker ───

export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private isOpen = false;
  private openSince: number | null = null;

  constructor(
    private failureThreshold: number,
    private resetTimeoutMs: number,
  ) {}

  try(): boolean {
    if (this.isOpen) {
      const elapsed = Date.now() - (this.openSince ?? Date.now());
      if (elapsed < this.resetTimeoutMs) return false;
      this.isOpen = false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  recordFailure(): boolean {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.isOpen = true;
      this.openSince = Date.now();
      return true;
    }
    return false;
  }

  get state(): { isOpen: boolean; failureCount: number; openSince: number | null } {
    return { isOpen: this.isOpen, failureCount: this.failureCount, openSince: this.openSince };
  }
}

// ─── Provider Strategy ───

interface ProviderStrategy {
  name: string;
  buildUrl(): string;
  buildHeaders(): Record<string, string>;
  buildBody(messages: unknown[], options?: ChatOptions, stream?: boolean): Record<string, unknown>;
}

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
        content: m.content ?? '',
        tool_call_id: m.toolCallId,
      };
    }
    return { role: m.role, content: m.content };
  });
}

function createProviderFromStrategy(strategy: ProviderStrategy, logger?: Logger): AIProvider {
  const mergeHeaders = (providerHeaders: Record<string, string>): Record<string, string> => ({
    'User-Agent': 'e2e-test/1.0',
    ...providerHeaders,
  });
  const formatFetchError = (providerName: string, fetchErr: any, agentTag: string, url: string, bodyJson?: string): Error => {
    const cause = fetchErr.cause;
    const causeMsg = cause ? ` (cause: ${cause.code || cause.message || cause})` : '';
    const sizeInfo = bodyJson ? ` body=${(bodyJson.length / 1024).toFixed(1)}KB` : '';
    return new Error(`Provider ${providerName} fetch failed${agentTag}: ${fetchErr.message}${causeMsg} url=${url}${sizeInfo}`);
  };

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    const l = logger ?? consoleLogger;
    const url = strategy.buildUrl();
    l.info(`[provider:${strategy.name}] POST${agentTag} ${url} messages=${messages.length}`);
    const fetchStart = Date.now();
    let response: Response;
    try {
      const reqBody = JSON.stringify(strategy.buildBody(serializeMessages(messages), options));
      response = await fetchWithRetry(url, {
        method: 'POST',
        headers: mergeHeaders(strategy.buildHeaders()),
        body: reqBody,
        signal,
      });
    } catch (fetchErr: any) {
      throw formatFetchError(strategy.name, fetchErr, agentTag, url);
    }
    return parseChatResponse(response, strategy.name, fetchStart, agentTag);
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    const l = logger ?? consoleLogger;
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    const url = strategy.buildUrl();
    const bodyJson = JSON.stringify({ ...strategy.buildBody(serializeMessages(messages), options, true), stream: true, stream_options: { include_usage: true } });
    let response: Response;
    try {
      response = await fetchWithRetry(url, {
        method: 'POST',
        headers: mergeHeaders(strategy.buildHeaders()),
        body: bodyJson,
        signal,
      });
    } catch (fetchErr: any) {
      throw formatFetchError(strategy.name, fetchErr, agentTag, url, bodyJson);
    }
    if (!response.ok) {
      const errorText = await response.text();
      l.error(`[provider:${strategy.name}] stream error body: ${errorText}`);
      const errorPrefix = strategy.name === 'azure' ? 'Azure OpenAI'
      : strategy.name === 'openai-compat' ? 'OpenAI Compatible'
      : 'Provider';
      throw new Error(`${errorPrefix} stream error ${response.status}: ${errorText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    yield* readSSEStream(reader, decoder);
  }

  return { chat, streamChat };
}

export function createAIProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'azure-openai': return createAzureOpenAIProvider(config);
    case 'openai-compatible': return createOpenAICompatibleProvider(config);
  }
}

// ─── Provider Factories ───

function createAzureOpenAIProvider(config: ProviderConfig & { type: 'azure-openai' }): AIProvider {
  const chatStrategy: ProviderStrategy = {
    name: 'azure',
    buildUrl: () => `${config.endpoint.replace(/\/+$/, '')}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`,
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'api-key': config.apiKey }),
    buildBody: (messages, options?) => ({
      messages,
      temperature: options?.temperature ?? 0.3,
      max_completion_tokens: options?.maxTokens ?? 4096,
      response_format: options?.jsonSchema
        ? { type: 'json_schema' as const, json_schema: normalizeStructuredOutputSchema(options.jsonSchema, options?.agentName) }
        : options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      ...(() => { const t = formatToolsForApi(options?.tools); return t ? { tools: t, tool_choice: options?.toolChoice } : {}; })(),
    }),
  };

  const baseProvider = createProviderFromStrategy(chatStrategy);

  // Override streamChat to use Responses API for reasoning summary support
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    const url = `${config.endpoint.replace(/\/+$/, '')}/openai/v1/responses`;
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    Log.for('provider').info(`POST${agentTag} ${url} messages=${messages.length}`);

    // Build Responses API input from ChatMessage[]
    // Responses API uses separate items: function_call, function_call_output (not nested tool_calls)
    const input: unknown[] = [];
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls) {
        // Assistant message content (if any)
        if (m.content) {
          input.push({ role: 'assistant', content: m.content });
        }
        // Each tool call becomes a separate function_call item
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

    const body: Record<string, unknown> = {
      model: config.deployment,
      input,
      reasoning: { effort: 'medium', summary: 'auto' },
      max_output_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };
    if (options?.jsonSchema) {
      body.text = {
        format: normalizeStructuredOutputSchema(options.jsonSchema, options?.agentName),
      };
    } else if (options?.responseFormat === 'json_object') {
      body.text = { format: { type: 'json_object' } };
    }
    if (options?.tools && options.tools.length > 0) {
      // Responses API tools format: { type: "function", name, description, parameters } (flat, not nested)
      body.tools = options.tools.map(t => ({
        type: 'function' as const,
        name: t.name,
        description: t.description,
        strict: t.strict ?? false,
        parameters: t.parameters,
      }));
    }

    let response: Response;
    const bodyJson = JSON.stringify(body);
    try {
      response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey, 'User-Agent': 'e2e-test/1.0' },
        body: bodyJson,
        signal,
      });
    } catch (fetchErr: any) {
      const cause = fetchErr.cause;
      const causeMsg = cause ? ` (cause: ${cause.code || cause.message || cause})` : '';
      Log.for('provider').error(`fetch failed${agentTag}: ${fetchErr.message}${causeMsg}, body=${(bodyJson.length / 1024).toFixed(1)}KB, input=${input.length}`);
      throw new Error(`Azure OpenAI fetch failed${agentTag}: ${fetchErr.message}${causeMsg} url=${url} body=${(bodyJson.length / 1024).toFixed(1)}KB input=${input.length}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      Log.for('provider').error(`stream error body: ${errorText}`);
      throw new Error(`Azure OpenAI Responses API stream error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    yield* readResponsesApiSSEStream(reader, decoder);
  }

  return { chat: baseProvider.chat, streamChat };
}

function createOpenAICompatibleProvider(config: ProviderConfig & { type: 'openai-compatible' }): AIProvider {
  // Normalize endpoint: ensure it ends with /v1/chat/completions
  const raw = (config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
  const baseUrl = raw.endsWith('/v1') ? raw : `${raw}/v1`;
  const chatUrl = `${baseUrl}/chat/completions`;

  return createProviderFromStrategy({
    name: 'openai-compat',
    buildUrl: () => chatUrl,
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}`, 'User-Agent': 'e2e-test/1.0' }),
    buildBody: (messages, options?) => ({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 8192,
      response_format: options?.jsonSchema
        ? { type: 'json_schema' as const, json_schema: normalizeStructuredOutputSchema(options.jsonSchema, options?.agentName) }
        : options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      ...(() => { const t = formatToolsForApi(options?.tools); return t ? { tools: t, tool_choice: options?.toolChoice } : {}; })(),
    } as any),
  });
}

export function createAIProviderWithFallback(config: ExtendedProviderConfig): AIProvider {
  const primary = createAIProvider(config as ProviderConfig);
  const cb = new CircuitBreaker(
    config.circuitBreaker?.failureThreshold ?? 5,
    config.circuitBreaker?.resetTimeoutMs ?? 60_000,
  );
  const fallbacks = (config.fallbackConfigs ?? []).map(fc => createAIProvider(fc as ProviderConfig));

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return tryProvider(primary, fallbacks, 0, cb, (provider) => provider.chat(messages, options));
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    yield* tryStreamProvider(primary, fallbacks, 0, cb, (provider) => provider.streamChat(messages, options));
  }

  return { chat, streamChat };
}

async function tryProvider<T>(
  primary: AIProvider, fallbacks: AIProvider[], currentIndex: number,
  cb: CircuitBreaker,
  fn: (provider: AIProvider) => Promise<T>,
): Promise<T> {
  if (!cb.try()) {
    if (currentIndex < fallbacks.length) {
      return tryProvider(primary, fallbacks, currentIndex + 1, cb, fn);
    }
    throw new Error('All providers unavailable. Circuit breaker is open');
  }

  const provider = currentIndex === 0 ? primary : fallbacks[currentIndex - 1];
  try {
    const result = await fn(provider);
    cb.recordSuccess();
    return result;
  } catch (err: any) {
    cb.recordFailure();
    if (currentIndex < fallbacks.length) {
      return tryProvider(primary, fallbacks, currentIndex + 1, cb, fn);
    }
    throw err;
  }
}

async function* tryStreamProvider(
  primary: AIProvider,
  fallbacks: AIProvider[],
  currentIndex: number,
  cb: CircuitBreaker,
  fn: (provider: AIProvider) => AsyncGenerator<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  if (!cb.try()) {
    if (currentIndex < fallbacks.length) {
      yield* tryStreamProvider(primary, fallbacks, currentIndex + 1, cb, fn);
      return;
    }
    throw new Error('All providers unavailable. Circuit breaker is open');
  }

  const provider = currentIndex === 0 ? primary : fallbacks[currentIndex - 1];
  let yieldedAnyChunk = false;

  try {
    for await (const chunk of fn(provider)) {
      yieldedAnyChunk = true;
      yield chunk;
    }
    cb.recordSuccess();
  } catch (err: any) {
    cb.recordFailure();
    if (!yieldedAnyChunk && currentIndex < fallbacks.length) {
      yield* tryStreamProvider(primary, fallbacks, currentIndex + 1, cb, fn);
      return;
    }
    throw err;
  }
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
  yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
}

/** Read SSE stream from the Responses API (Azure OpenAI GPT-5 reasoning models) */
export async function* readResponsesApiSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder): AsyncGenerator<StreamChunk> {
  let buffer = '';
  let usageData: any = null;
  let currentToolCall: { id: string; name: string; args: string } | null = null;

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

  yield {
    type: 'done',
    content: '',
    usage: usageData ? {
      promptTokens: usageData.input_tokens ?? 0,
      completionTokens: usageData.output_tokens ?? 0,
      reasoningTokens: usageData.output_tokens_details?.reasoning_tokens ?? 0,
    } : undefined,
  };
}
