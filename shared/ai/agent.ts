import type { ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions } from './provider.ts';
import { loadSkillContext, type SkillContext } from './skill-loader.ts';

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
}

export function createAgentContext(provider: AIProvider, role: AgentRole): AgentContext {
  return { provider, role, skillContext: loadSkillContext(role.requiredSkills) };
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

export async function runAgent(context: AgentContext, input: unknown): Promise<unknown> {
  const { provider, role, skillContext } = context;
  const parsedInput = role.inputSchema.parse(input);
  const inputJson = JSON.stringify(parsedInput, null, 2);
  const filledPrompt = fillTemplate(role.systemPromptTemplate, { input: inputJson, skills: skillContext.systemPrompt });
  const messages: ChatMessage[] = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await provider.chat(messages, { ...role.options, responseFormat: 'json_object' });
      const parsed = JSON.parse(response.content);
      return role.outputSchema.parse(parsed);
    } catch (err) {
      lastError = err as Error;
      if (attempt === 0) {
        messages.push({ role: 'assistant', content: '(previous response failed validation)' });
        messages.push({ role: 'user', content: `Your previous response was invalid: ${lastError.message}. Please fix and re-output as valid JSON.` });
      }
    }
  }
  throw new Error(`Agent failed after 2 attempts: ${lastError?.message}`);
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