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
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
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
    return { content: data.choices[0].message.content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey }, body: JSON.stringify({ messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true }) });
    if (!response.ok) throw new Error(`Azure OpenAI stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); const content = data.choices?.[0]?.delta?.content; if (content) yield content; } catch {} } } }
  }
  return { chat, streamChat };
}

function createNvidiaProvider(config: ProviderConfig & { type: 'nvidia-nim' }): AIProvider {
  const baseUrl = `${config.endpoint}/v1/chat/completions`;
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096 }) });
    if (!response.ok) throw new Error(`Nvidia NIM error ${response.status}`);
    const data = await response.json() as any; return { content: data.choices[0].message.content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true }) });
    if (!response.ok) throw new Error(`Nvidia NIM stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); const content = data.choices?.[0]?.delta?.content; if (content) yield content; } catch {} } } }
  }
  return { chat, streamChat };
}

function createOpenRouterProvider(config: ProviderConfig & { type: 'openrouter' }): AIProvider {
  const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096 }) });
    if (!response.ok) throw new Error(`OpenRouter error ${response.status}`);
    const data = await response.json() as any; return { content: data.choices[0].message.content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true }) });
    if (!response.ok) throw new Error(`OpenRouter stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); const content = data.choices?.[0]?.delta?.content; if (content) yield content; } catch {} } } }
  }
  return { chat, streamChat };
}

function createOpenAIProvider(config: ProviderConfig & { type: 'openai' }): AIProvider {
  const baseUrl = 'https://api.openai.com/v1/chat/completions';
  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined }) });
    if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
    const data = await response.json() as any; return { content: data.choices[0].message.content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 } };
  }
  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: options?.temperature ?? 0.3, max_tokens: options?.maxTokens ?? 4096, stream: true }) });
    if (!response.ok) throw new Error(`OpenAI stream error ${response.status}`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (line.startsWith('data: ') && line !== 'data: [DONE]') { try { const data = JSON.parse(line.slice(6)); const content = data.choices?.[0]?.delta?.content; if (content) yield content; } catch {} } } }
  }
  return { chat, streamChat };
}