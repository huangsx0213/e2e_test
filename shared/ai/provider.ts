import type { CircuitBreakerState, ProviderConfig as ExtendedProviderConfig } from './provider-types.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
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

export function createAIProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'azure-openai': return createAzureOpenAIProvider(config);
    case 'nvidia-nim': return createNvidiaProvider(config);
    case 'openrouter': return createOpenRouterProvider(config);
    case 'openai': return createOpenAIProvider(config);
  }
}

// ─── Circuit Breaker ───

const circuitBreakers = new Map<string, CircuitBreakerState>();

function getOrCreateCB(name: string): CircuitBreakerState {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, { failureCount: 0, lastFailureTime: null, isOpen: false, openSince: null });
  }
  return circuitBreakers.get(name)!;
}

export function createAIProviderWithFallback(config: ExtendedProviderConfig): AIProvider {
  const primary = createAIProvider(config as ProviderConfig);
  const cb = getOrCreateCB(`${config.type}:${config.endpoint || config.model || 'primary'}`);
  const failureThreshold = config.circuitBreaker?.failureThreshold ?? 5;
  const resetTimeoutMs = config.circuitBreaker?.resetTimeoutMs ?? 60_000;

  const fallbacks = (config.fallbackConfigs ?? []).map(fc => createAIProvider(fc as ProviderConfig));

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    return tryProvider(primary, fallbacks, 0, cb, failureThreshold, resetTimeoutMs,
      (provider) => provider.chat(messages, options));
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    // streamChat does not support fallback (complex to re-stream)
    yield* primary.streamChat(messages, options);
  }

  return { chat, streamChat };
}

async function tryProvider<T>(
  primary: AIProvider, fallbacks: AIProvider[], currentIndex: number,
  cb: CircuitBreakerState, failureThreshold: number, resetTimeoutMs: number,
  fn: (provider: AIProvider) => Promise<T>,
): Promise<T> {
  // Check if circuit is open
  if (cb.isOpen) {
    const elapsed = Date.now() - (cb.openSince ?? Date.now());
    if (elapsed < resetTimeoutMs) {
      // Try next fallback if available
      if (currentIndex < fallbacks.length) {
        return tryProvider(primary, fallbacks, currentIndex + 1, cb, failureThreshold, resetTimeoutMs, fn);
      }
      throw new Error(`All providers unavailable. Circuit breaker open for ${Math.ceil((resetTimeoutMs - elapsed) / 1000)}s`);
    }
    // Half-open: allow one probe request
    cb.isOpen = false;
  }

  const provider = currentIndex === 0 ? primary : fallbacks[currentIndex - 1];

  try {
    const result = await fn(provider);
    // Success: reset circuit breaker
    cb.failureCount = 0;
    cb.lastFailureTime = null;
    return result;
  } catch (err: any) {
    cb.failureCount++;
    cb.lastFailureTime = Date.now();
    if (cb.failureCount >= failureThreshold) {
      cb.isOpen = true;
      cb.openSince = Date.now();
    }
    // Try next provider
    if (currentIndex < fallbacks.length) {
      return tryProvider(primary, fallbacks, currentIndex + 1, cb, failureThreshold, resetTimeoutMs, fn);
    }
    throw err;
  }
}

function createAzureOpenAIProvider(config: ProviderConfig & { type: 'azure-openai' }): AIProvider {
  const baseUrl = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey },
      body: JSON.stringify({ messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined }),
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`Azure OpenAI error ${response.status}: ${errorText}`); }
    const data = await response.json() as any;
    const msg = data.choices[0].message;
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
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey }, body: JSON.stringify({ messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true, stream_options: { include_usage: true } }) });
    if (!response.ok) throw new Error(`Azure OpenAI stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    let usageData: any = null;
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); if (data.usage) { usageData = data.usage; } else { const delta = data.choices?.[0]?.delta; if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content }; if (delta?.content) yield { type: 'content', content: delta.content }; } } catch {} } } }
    yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
  }
  return { chat, streamChat };
}

function createNvidiaProvider(config: ProviderConfig & { type: 'nvidia-nim' }): AIProvider {
  const baseUrl = `${config.endpoint}/v1/chat/completions`;
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096 }) });
    if (!response.ok) throw new Error(`Nvidia NIM error ${response.status}`);
    const data = await response.json() as any;
    const msg = data.choices[0].message;
    return { content: msg.content, reasoningContent: msg.reasoning_content || undefined, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true, stream_options: { include_usage: true } }) });
    if (!response.ok) throw new Error(`Nvidia NIM stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    let usageData: any = null;
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); if (data.usage) { usageData = data.usage; } else { const delta = data.choices?.[0]?.delta; if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content }; if (delta?.content) yield { type: 'content', content: delta.content }; } } catch {} } } }
    yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
  }
  return { chat, streamChat };
}

function createOpenRouterProvider(config: ProviderConfig & { type: 'openrouter' }): AIProvider {
  const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096 }) });
    if (!response.ok) throw new Error(`OpenRouter error ${response.status}`);
    const data = await response.json() as any;
    const msg = data.choices[0].message;
    return { content: msg.content, reasoningContent: msg.reasoning_content || undefined, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true, stream_options: { include_usage: true } }) });
    if (!response.ok) throw new Error(`OpenRouter stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    let usageData: any = null;
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); if (data.usage) { usageData = data.usage; } else { const delta = data.choices?.[0]?.delta; if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content }; if (delta?.content) yield { type: 'content', content: delta.content }; } } catch {} } } }
    yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
  }
  return { chat, streamChat };
}

function createOpenAIProvider(config: ProviderConfig & { type: 'openai' }): AIProvider {
  const baseUrl = 'https://api.openai.com/v1/chat/completions';
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined }) });
    if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
    const data = await response.json() as any;
    const msg = data.choices[0].message;
    return { content: msg.content, reasoningContent: msg.reasoning_content || undefined, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true, stream_options: { include_usage: true } }) });
    if (!response.ok) throw new Error(`OpenAI stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    let usageData: any = null;
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); if (data.usage) { usageData = data.usage; } else { const delta = data.choices?.[0]?.delta; if (delta?.reasoning_content) yield { type: 'reasoning', content: delta.reasoning_content }; if (delta?.content) yield { type: 'content', content: delta.content }; } } catch {} } } }
    yield { type: 'done', content: '', usage: usageData ? { promptTokens: usageData.prompt_tokens ?? 0, completionTokens: usageData.completion_tokens ?? 0, reasoningTokens: usageData.completion_tokens_details?.reasoning_tokens ?? 0 } : undefined };
  }
  return { chat, streamChat };
}