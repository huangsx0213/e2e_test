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
 * 构建 ChatOptions：仅包含 skills（不含 extract_structured_output）
 * 用于第一阶段：让 LLM 自由输出思考内容
 */
export function buildThinkingChatOptions(
  skills: SkillDefinition[],
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const skillTools: ChatOptions['tools'] = skills.map(s => ({
    name: s.name,
    description: s.description,
    parameters: s.parameters as JsonSchema,
  }));

  return {
    tools: skillTools.length > 0 ? skillTools : undefined,
    toolChoice: skillTools.length > 0 ? 'auto' : undefined,
    temperature: 0.3,
    maxTokens: 8192,
    ...extra,
  };
}

/**
 * 构建 ChatOptions：用于第二阶段提取结构化输出
 * 使用 response_format: json_object 代替 forced tool_choice，
 * 因为 Nvidia NIM 等部分 provider 不支持 tool_choice: { type: 'function', ... }
 */
export function buildExtractionChatOptions(
  outputSchema: ZodType,
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const { temperature: _ignored, responseFormat: _ignoredFormat, ...allowedExtra } = extra ?? {};
  return {
    responseFormat: 'json_object',
    temperature: 0.1,
    maxTokens: 16384,
    ...allowedExtra,
  };
}

/**
 * 构建 Phase 2 的提取 prompt，包含 schema 约束
 */
export function buildExtractionPrompt(outputSchema: ZodType): string {
  const schema = zodToJsonSchema(outputSchema);
  return `Based on the analysis above, output a single JSON object matching this schema. Do NOT include any text before or after the JSON.

Schema:
${JSON.stringify(schema, null, 2)}`;
}

/**
 * 使用 AIProvider.streamChat() 调用 LLM，采用两阶段策略：
 *   Phase 1: 不带 extract_structured_output 工具，让模型自由输出思考内容（流式推送）
 *   Phase 2: 将思考内容作为上下文，用 forced tool_choice 提取结构化输出
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
  const allMessages = [...messages];

  // ── Phase 1: Thinking ──
  // 不带 extract_structured_output 工具，让模型自由输出思考内容
  const thinkingOpts = buildThinkingChatOptions(skills, extra);
  let thinkingText = '';
  let contentText = '';
  let maxRounds = 5;

  while (maxRounds-- > 0 && !extra?.signal?.aborted) {
    const toolCalls: ToolCall[] = [];
    let currentToolCall: { id: string; name: string; args: string } | null = null;
    contentText = '';

    for await (const chunk of provider.streamChat(allMessages, thinkingOpts)) {
      if (chunk.type === 'reasoning' && chunk.content) {
        thinkingText += chunk.content;
        observer?.onThinking?.(agentName ?? '', chunk.content);
      }
      if (chunk.type === 'content' && chunk.content) {
        contentText += chunk.content;
        observer?.onThinking?.(agentName ?? '', chunk.content);
      }
      if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        currentToolCall = { id: chunk.toolCall.id, name: chunk.toolCall.name, args: '' };
      }
      if (chunk.type === 'tool_call_delta' && chunk.content && currentToolCall) {
        currentToolCall.args += chunk.content;
      }
      if (chunk.type === 'tool_call_end' && chunk.toolCall) {
        if (currentToolCall && currentToolCall.args) {
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
    }

    // 处理 skill tool calls
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
      continue; // 继续循环处理 skill 调用结果
    }

    // 没有 tool_calls，Phase 1 完成
    break;
  }

  // 将 Phase 1 的分析文本加入消息历史，供 Phase 2 extraction 使用
  if (contentText) {
    allMessages.push({ role: 'assistant' as const, content: contentText });
  }

  // ── Phase 2: Extraction ──
  // 将思考内容作为上下文，用 forced tool_choice 提取结构化输出
  if (!contentText && !thinkingText) {
    throw new Error('LLM produced no content in thinking phase');
  }

  // 尝试从 content 中直接解析 JSON（模型可能在分析后直接输出了 JSON）
  if (contentText) {
    // 1. 整个 content 就是 JSON
    try {
      const parsed = JSON.parse(contentText);
      return outputSchema.parse(parsed);
    } catch {}

    // 2. 从混合内容中提取 JSON（分析文本 + JSON）
    // 查找最后一个顶级 JSON 对象（以 { 开头，} 结尾，且能通过 JSON.parse）
    const jsonBlocks: string[] = [];
    let searchFrom = 0;
    while (searchFrom < contentText.length) {
      const openIdx = contentText.indexOf('{', searchFrom);
      if (openIdx === -1) break;
      // 找到匹配的 }
      let depth = 0;
      let inStr = false;
      let escape = false;
      for (let i = openIdx; i < contentText.length; i++) {
        const ch = contentText[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inStr) { escape = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            jsonBlocks.push(contentText.slice(openIdx, i + 1));
            searchFrom = i + 1;
            break;
          }
        }
      }
      if (depth !== 0) { searchFrom = openIdx + 1; }
    }

    // 从最后一个 JSON 块开始尝试解析（因为模型在分析后输出 JSON）
    for (let i = jsonBlocks.length - 1; i >= 0; i--) {
      try {
        const extracted = JSON.parse(jsonBlocks[i]);
        return outputSchema.parse(extracted);
      } catch {}
    }

    // Mistral/NVIDIA NIM 可能在 content 中输出 [TOOL_CALLS] 格式
    const toolCallsMatch = contentText.match(/\[TOOL_CALLS\]\s*(\[[\s\S]*\])/);
    if (toolCallsMatch) {
      try {
        const calls = JSON.parse(toolCallsMatch[1]);
        const extractCall = calls.find((c: any) => c.name === 'extract_structured_output');
        if (extractCall?.arguments) {
          const args = typeof extractCall.arguments === 'string' ? JSON.parse(extractCall.arguments) : extractCall.arguments;
          return outputSchema.parse(args);
        }
      } catch {}
    }
  }

  // Phase 1 的 content 不是有效 JSON，需要 Phase 2 提取
  // 使用 response_format: json_object 让模型直接输出 JSON（兼容所有 provider）
  const extractionOpts = buildExtractionChatOptions(outputSchema, extra);
  const extractionMessages = [
    ...allMessages,
    {
      role: 'user' as const,
      content: buildExtractionPrompt(outputSchema),
    },
  ];

  let extractContent = '';

  for await (const chunk of provider.streamChat(extractionMessages, extractionOpts)) {
    if (chunk.type === 'content' && chunk.content) {
      extractContent += chunk.content;
      observer?.onThinking?.(agentName ?? '', chunk.content);
    }
  }

  // 从 Phase 2 的 content 中解析 JSON
  if (extractContent) {
    try {
      const parsed = JSON.parse(extractContent);
      return outputSchema.parse(parsed);
    } catch {}

    // 尝试提取 JSON 块
    const jsonMatch = extractContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        return outputSchema.parse(extracted);
      } catch {}
    }
  }

  throw new Error('Failed to extract structured output from LLM response');
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
