import { toJSONSchema, type ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions, ToolCall } from '../../../../../shared/ai/provider.ts';
import type { JsonSchema } from '../../../../../shared/ai/tool.ts';
import type { SkillDefinition } from './types';

/**
 * 将 Zod schema 转换为 JSON Schema（用于 tool parameters）
 * 使用 Zod v4 内置的 toJSONSchema
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  return toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * 构建 structured output 工具定义 + tool_choice
 * 强制 LLM 调用 extract_structured_output 函数输出符合 schema 的 JSON
 */
export function buildStructuredOutputTool(outputSchema: ZodType): {
  tools: ChatOptions['tools'];
  toolChoice: ChatOptions['toolChoice'];
} {
  const schema = zodToJsonSchema(outputSchema) as JsonSchema;
  return {
    tools: [{
      name: 'extract_structured_output',
      description: 'Output the final structured result. Call this when you have completed your analysis.',
      parameters: schema,
    }],
    toolChoice: { type: 'function', function: { name: 'extract_structured_output' } },
  };
}

/**
 * 构建 ChatOptions：合并 skills + structured output tool
 */
export function buildChatOptions(
  skills: SkillDefinition[],
  outputSchema: ZodType,
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const { tools: outputTool, toolChoice } = buildStructuredOutputTool(outputSchema);

  const skillTools: ChatOptions['tools'] = skills.map(s => ({
    name: s.name,
    description: s.description,
    parameters: s.parameters as JsonSchema,
  }));

  return {
    tools: [...skillTools, ...outputTool!],
    toolChoice,
    temperature: 0.3,
    responseFormat: 'json_object',
    ...extra,
  };
}

/**
 * 使用 AIProvider.streamChat() 调用 LLM，捕获 reasoning/content 作为 thinking 文本，
 * 处理 tool_calls 循环，最终提取 extract_structured_output 的调用结果并解析
 */
export async function callLLMWithStructuredOutput<T>(
  provider: AIProvider,
  messages: ChatMessage[],
  skills: SkillDefinition[],
  outputSchema: ZodType<T>,
  observer?: { onStep?: (name: string, idx: number, step: string) => void; onThinking?: (name: string, text: string) => void },
  agentName?: string,
  extra?: Partial<ChatOptions>,
): Promise<T> {
  const chatOpts = buildChatOptions(skills, outputSchema, extra);
  const allMessages = [...messages];
  let maxRounds = 5;

  while (maxRounds-- > 0) {
    // 使用 streamChat 捕获 reasoning/content 流
    let thinkingText = '';
    let contentText = '';
    const toolCalls: ToolCall[] = [];
    let currentToolCall: { id: string; name: string; args: string } | null = null;
    let usage: { promptTokens: number; completionTokens: number; reasoningTokens?: number } | undefined;

    for await (const chunk of provider.streamChat(allMessages, chatOpts)) {
      if (chunk.type === 'reasoning' && chunk.content) {
        thinkingText += chunk.content;
        observer?.onThinking?.(agentName ?? '', chunk.content);
      }
      if (chunk.type === 'content' && chunk.content) {
        contentText += chunk.content;
        observer?.onThinking?.(agentName ?? '', chunk.content);
      }
      if (chunk.type === 'tool_call_delta' && chunk.content) {
        // tool_choice 模式下 LLM 通过 tool_call 参数输出，将增量参数实时推送为 thinking
        observer?.onThinking?.(agentName ?? '', chunk.content);
      }
      if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        currentToolCall = { id: chunk.toolCall.id, name: chunk.toolCall.name, args: '' };
      }
      if (chunk.type === 'tool_call_end' && chunk.toolCall) {
        // 如果有累积的 args 字符串但 toolCall.args 是空对象，用累积的
        if (currentToolCall && currentToolCall.args && !chunk.toolCall.args?.hasOwnProperty) {
          try {
            toolCalls.push({ id: chunk.toolCall.id, name: chunk.toolCall.name, args: JSON.parse(currentToolCall.args) });
          } catch {
            toolCalls.push({ id: chunk.toolCall.id, name: chunk.toolCall.name, args: currentToolCall.args });
          }
        } else {
          toolCalls.push(chunk.toolCall);
        }
        currentToolCall = null;
      }
      if (chunk.type === 'done' && chunk.usage) {
        usage = chunk.usage;
      }
    }

    // 如果有 tool_calls，处理它们
    if (toolCalls.length > 0) {
      allMessages.push({
        role: 'assistant',
        content: contentText || '',
        toolCalls: toolCalls.map(tc => ({
          type: 'function' as const,
          function: { name: tc.name, arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args) },
          id: tc.id,
        })),
      });

      for (const tc of toolCalls) {
        if (tc.name === 'extract_structured_output') {
          const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          return outputSchema.parse(args);
        }

        const skill = skills.find(s => s.name === tc.name);
        if (skill) {
          observer?.onStep?.(agentName ?? '', 99, `Skill: ${tc.name}`);
          const result = await executeSkill(skill, tc.args as Record<string, unknown>);
          allMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: tc.id,
          });
        } else {
          allMessages.push({
            role: 'tool',
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
            toolCallId: tc.id,
          });
        }
      }
      continue;
    }

    // 没有 tool_calls，尝试从 content 解析 JSON
    if (contentText) {
      try {
        const parsed = JSON.parse(contentText);
        return outputSchema.parse(parsed);
      } catch {
        const jsonMatch = contentText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          return outputSchema.parse(extracted);
        }
      }
    }

    throw new Error('LLM did not produce structured output or tool calls');
  }

  throw new Error('Max tool call rounds exceeded without structured output');
}

/**
 * 执行一个 Skill 并返回结果
 */
export async function executeSkill(
  skill: SkillDefinition,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    console.log(`[skill] Executing ${skill.name} with args:`, JSON.stringify(args).slice(0, 200));
    const result = await skill.execute(args);
    console.log(`[skill] ${skill.name} completed`);
    return result;
  } catch (err: any) {
    console.error(`[skill] ${skill.name} failed:`, err.message);
    return { error: err.message };
  }
}
