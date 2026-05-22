import type { ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions } from './provider.ts';
import { loadSkillContext, type SkillContext } from './skill-loader.ts';
import { TokenTracker } from './token-tracker.ts';

export interface AgentRole {
  name: string;
  systemPromptTemplate: string;
  requiredSkills: string[];
  inputSchema: ZodType;
  outputSchema: ZodType;
  options?: ChatOptions;
}

export interface AgentContext {
  provider: AIProvider;
  role: AgentRole;
  skillContext: SkillContext;
  tokenTracker: TokenTracker;
}

export function createAgentContext(provider: AIProvider, role: AgentRole): AgentContext {
  return { provider, role, skillContext: loadSkillContext(role.requiredSkills), tokenTracker: new TokenTracker() };
}

export class AgentTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = 'AgentTimeoutError'; }
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

const RETRY_DELAYS = [2000, 4000, 8000];
const DEFAULT_TIMEOUT = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface AgentRunOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export async function runAgent(context: AgentContext, input: unknown, options: AgentRunOptions = {}): Promise<unknown> {
  const { provider, role, skillContext, tokenTracker } = context;
  const maxRetries = options.maxRetries ?? RETRY_DELAYS.length;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;

  const parsedInput = role.inputSchema.parse(input);
  const inputJson = JSON.stringify(parsedInput, null, 2);
  const filledPrompt = fillTemplate(role.systemPromptTemplate, { input: inputJson, skills: skillContext.systemPrompt });
  const messages: ChatMessage[] = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);

      let response;
      try {
        response = await provider.chat(messages, { ...role.options, responseFormat: 'json_object' });
      } finally {
        clearTimeout(timer);
      }

      if (response.usage) {
        tokenTracker.add(response.usage);
      }
      const parsed = JSON.parse(response.content);
      return role.outputSchema.parse(parsed);
    } catch (err: any) {
      lastError = err as Error;

      if (err?.name === 'TimeoutError' || err?.message?.includes('Timeout')) {
        throw new AgentTimeoutError(`Agent ${role.name} timed out after ${timeoutMs}ms`);
      }

      const isRateLimit = err?.message?.includes('429') || err?.message?.includes('rate limit');

      if (attempt < maxRetries - 1) {
        const waitMs = isRateLimit ? RETRY_DELAYS[attempt] * 2 : RETRY_DELAYS[attempt];
        await delay(waitMs);

        messages.push({ role: 'assistant', content: '(previous response failed validation)' });
        messages.push({ role: 'user', content: `Your previous response was invalid: ${lastError.message}. Please fix and re-output as valid JSON.` });
      }
    }
  }
  throw new Error(`Agent ${role.name} failed after ${maxRetries} attempts: ${lastError?.message}`);
}

export async function* streamAgent(context: AgentContext, input: unknown): AsyncGenerator<{ type: 'chunk' | 'result'; content: unknown }> {
  const { provider, role, skillContext } = context;
  const parsedInput = role.inputSchema.parse(input);
  const inputJson = JSON.stringify(parsedInput, null, 2);
  const filledPrompt = fillTemplate(role.systemPromptTemplate, { input: inputJson, skills: skillContext.systemPrompt });
  const messages: ChatMessage[] = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];
  let fullContent = '';
  for await (const chunk of provider.streamChat(messages, { ...role.options })) {
    fullContent += chunk;
    yield { type: 'chunk', content: chunk };
  }
  try {
    const parsed = JSON.parse(fullContent);
    const validated = role.outputSchema.parse(parsed);
    yield { type: 'result', content: validated };
  } catch (err) {
    throw new Error(`Agent output validation failed: ${(err as Error).message}`);
  }
}