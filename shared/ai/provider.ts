import type { ProviderConfig as ExtendedProviderConfig } from './provider-types.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  signal?: AbortSignal;
  agentName?: string;
}

export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}

export interface StreamChunk {
  type: 'reasoning' | 'content' | 'done' | 'error';
  content: string;
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
}

export interface ExtendedChatResponse extends ChatResponse {
  reasoningContent?: string;
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}

export type ProviderConfig =
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string }
  | { type: 'nvidia-nim'; endpoint: string; apiKey: string; model: string }
  | { type: 'openrouter'; apiKey: string; model: string }
  | { type: 'openai'; apiKey: string; model: string };

function mergeSignals(signal1?: AbortSignal, signal2?: AbortSignal): AbortSignal | undefined {
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
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
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
  buildBody(messages: ChatMessage[], options?: ChatOptions, stream?: boolean): Record<string, unknown>;
}

function createProviderFromStrategy(strategy: ProviderStrategy, logger?: Logger): AIProvider {
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    const agentTag = options?.agentName ? ` agent=${options.agentName}` : '';
    const l = logger ?? consoleLogger;
    l.info(`[provider:${strategy.name}] POST${agentTag} ${strategy.buildUrl()} messages=${messages.length}`);
    const fetchStart = Date.now();
    const response = await fetch(strategy.buildUrl(), {
      method: 'POST',
      headers: strategy.buildHeaders(),
      body: JSON.stringify(strategy.buildBody(messages, options)),
      signal,
    });
    return parseChatResponse(response, strategy.name, fetchStart, agentTag);
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const signal = mergeSignals(options?.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS));
    const l = logger ?? consoleLogger;
    const body = { ...strategy.buildBody(messages, options, true), stream: true, stream_options: { include_usage: true } };
    const response = await fetch(strategy.buildUrl(), {
      method: 'POST',
      headers: strategy.buildHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      l.error(`[provider:${strategy.name}] stream error body: ${errorText}`);
      const errorPrefix = strategy.name === 'azure' ? 'Azure OpenAI'
        : strategy.name === 'nvidia' ? 'Nvidia NIM'
        : strategy.name === 'openrouter' ? 'OpenRouter'
        : 'OpenAI';
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
    case 'nvidia-nim': return createNvidiaProvider(config);
    case 'openrouter': return createOpenRouterProvider(config);
    case 'openai': return createOpenAIProvider(config);
  }
}

// ─── Provider Factories ───

function createAzureOpenAIProvider(config: ProviderConfig & { type: 'azure-openai' }): AIProvider {
  return createProviderFromStrategy({
    name: 'azure',
    buildUrl: () => `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`,
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'api-key': config.apiKey }),
    buildBody: (messages, options?) => ({
      messages,
      temperature: options?.temperature ?? 0.3,
      max_completion_tokens: options?.maxTokens ?? 128000,
      response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
    }),
  });
}

function createNvidiaProvider(config: ProviderConfig & { type: 'nvidia-nim' }): AIProvider {
  return createProviderFromStrategy({
    name: 'nvidia',
    buildUrl: () => `${config.endpoint}/v1/chat/completions`,
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }),
    buildBody: (messages, options?) => ({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 131072,
    }),
  });
}

function createOpenRouterProvider(config: ProviderConfig & { type: 'openrouter' }): AIProvider {
  return createProviderFromStrategy({
    name: 'openrouter',
    buildUrl: () => 'https://openrouter.ai/api/v1/chat/completions',
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }),
    buildBody: (messages, options?) => ({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 131072,
    }),
  });
}

function createOpenAIProvider(config: ProviderConfig & { type: 'openai' }): AIProvider {
  return createProviderFromStrategy({
    name: 'openai',
    buildUrl: () => 'https://api.openai.com/v1/chat/completions',
    buildHeaders: () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }),
    buildBody: (messages, options?) => ({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 131072,
      response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
    }),
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
    yield* primary.streamChat(messages, options);
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

function formatContent(content: string | null | undefined): string {
  if (!content) return ' (empty)';
  try {
    const parsed = JSON.parse(content);
    return '\n' + JSON.stringify(parsed, null, 2);
  } catch {
    return ' ' + content;
  }
}

const FETCH_TIMEOUT_MS = 600_000;

async function parseChatResponse(response: Response, providerName: string, fetchStart: number, agentTag: string): Promise<ChatResponse> {
  console.log(`[provider:${providerName}] response ${response.status} in ${Date.now() - fetchStart}ms${agentTag}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[provider:${providerName}] error body${agentTag}: ${errorText}`);
    const errorPrefix = providerName === 'azure' ? 'Azure OpenAI error'
      : providerName === 'nvidia' ? 'Nvidia NIM error'
      : providerName === 'openrouter' ? 'OpenRouter error'
      : 'OpenAI error';
    throw new Error(`${errorPrefix} ${response.status}: ${errorText}`);
  }
  const data = await response.json() as any;
  const msg = data.choices[0].message;
  const formatted = formatContent(msg.content);
  console.log(`[provider:${providerName}] result${agentTag}:${formatted}\n       usage: ${data.usage?.prompt_tokens ?? '?'}in/${data.usage?.completion_tokens ?? '?'}out`);
  return {
    content: msg.content,
    reasoningContent: msg.reasoning_content || undefined,
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
          } else {
            const delta = data.choices?.[0]?.delta;
            if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content };
            if (delta?.content) yield { type: 'content', content: delta.content };
          }
        } catch {}
      }
    }
  }
  yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
}
