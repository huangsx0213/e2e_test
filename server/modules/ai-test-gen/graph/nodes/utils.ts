import { toJSONSchema, type ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions, ToolCall } from '../../infra/provider.ts';
import type { SkillDefinition } from './types.ts';

/**
 * 将 Zod schema 转换为 JSON Schema（用于 tool parameters）
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  return toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * 将 SkillDefinition[] 转换为 ChatOptions.tools 格式
 */
export function skillsToChatTools(skills: SkillDefinition[]): ChatOptions['tools'] {
  if (!skills || skills.length === 0) return undefined;
  return skills.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: zodToJsonSchema(s.schema) as any,
  }));
}

/**
 * 构建 ChatOptions：Phase 1 思考 + ReAct 阶段
 */
export function buildThinkingChatOptions(tools: ChatOptions['tools'], extra?: Partial<ChatOptions>): ChatOptions {
  return {
    temperature: 0.3,
    maxTokens: 8192,
    tools,
    toolChoice: tools && tools.length > 0 ? 'auto' : undefined,
    ...extra,
  };
}

/**
 * 构建 ChatOptions：Phase 2 提取阶段，使用 response_format
 */
export function buildExtractionChatOptions(
  outputSchema: ZodType,
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const { temperature: _ignored, responseFormat: _ignoredFormat, tools: _ignoredTools, toolChoice: _ignoredChoice, ...allowedExtra } = extra ?? {};
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
 * 从文本中提取 JSON 对象。按优先级：
 *   1. 整个 content 就是 JSON
 *   2. 从混合文本中提取最后一个完整 JSON 对象
 */
function tryExtractJson(content: string): unknown | null {
  try { return JSON.parse(content); } catch { /* continue */ }

  const jsonBlocks: string[] = [];
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const openIdx = content.indexOf('{', searchFrom);
    if (openIdx === -1) break;
    let depth = 0, inStr = false, escape = false;
    for (let i = openIdx; i < content.length; i++) {
      const ch = content[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { jsonBlocks.push(content.slice(openIdx, i + 1)); searchFrom = i + 1; break; } }
    }
    if (depth !== 0) { searchFrom = openIdx + 1; }
  }

  for (let i = jsonBlocks.length - 1; i >= 0; i--) {
    try { return JSON.parse(jsonBlocks[i]); } catch { /* continue */ }
  }

  return null;
}

// ============================================================
// ReAct Loop
// ============================================================

const MAX_REACT_ROUNDS = 15;

interface ReActResult {
  contentText: string;
  thinkingText: string;
  toolCallRecords: Array<{ name: string; input: unknown; output: unknown }>;
  usage: { input: number; output: number; reasoning: number };
}

/**
 * 执行 ReAct 循环：LLM 思考 → 调用 tool → 观察结果 → 继续思考
 * 最多 MAX_REACT_ROUNDS 轮，无 tool_calls 时退出
 */
async function runAgentReActLoop(
  provider: AIProvider,
  messages: ChatMessage[],
  skills: SkillDefinition[],
  observer: { onStep?: (name: string, idx: number, step: string) => void; onThinking?: (name: string, text: string) => void },
  agentName: string,
  extra: Partial<ChatOptions> | undefined,
): Promise<ReActResult> {
  const skillMap = new Map(skills.map((s) => [s.name, s]));
  const tools = skillsToChatTools(skills);
  console.log(`[react:${agentName}] Starting ReAct loop with ${skills.length} skills: ${skills.map(s => s.name).join(', ')}`);
  const allMessages: ChatMessage[] = [...messages];
  let contentText = '';
  let thinkingText = '';
  const toolCallRecords: ReActResult['toolCallRecords'] = [];
  let capturedUsage = { input: 0, output: 0, reasoning: 0 };

  for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
    // 流式调用 LLM（带 tools）
    let roundContent = '';
    let roundThinking = '';
    const pendingToolCalls: ToolCall[] = [];

    for await (const chunk of provider.streamChat(allMessages, buildThinkingChatOptions(tools, extra))) {
      if (chunk.type === 'reasoning' && chunk.content) {
        roundThinking += chunk.content;
        observer?.onThinking?.(agentName, chunk.content);
      }
      if (chunk.type === 'content' && chunk.content) {
        roundContent += chunk.content;
        observer?.onThinking?.(agentName, chunk.content);
      }
      if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        pendingToolCalls.push(chunk.toolCall);
      }
      if (chunk.type === 'tool_call_delta' && chunk.toolCall) {
        const existing = pendingToolCalls.find((tc) => tc.id === chunk.toolCall!.id);
        if (existing) {
          existing.args = chunk.toolCall.args; // 最后一个 delta 包含完整 args
        } else {
          pendingToolCalls.push(chunk.toolCall);
        }
      }
      if (chunk.type === 'tool_call_end' && chunk.toolCall) {
        const existing = pendingToolCalls.find((tc) => tc.id === chunk.toolCall!.id);
        if (existing) {
          existing.args = chunk.toolCall.args;
        }
      }
      if (chunk.type === 'done' && chunk.usage) {
        capturedUsage = {
          input: capturedUsage.input + (chunk.usage.promptTokens || 0),
          output: capturedUsage.output + (chunk.usage.completionTokens || 0),
          reasoning: capturedUsage.reasoning + (chunk.usage.reasoningTokens || 0),
        };
      }
    }

    contentText += roundContent;
    thinkingText += roundThinking;

    // 无 tool_calls → 推理完成
    if (pendingToolCalls.length === 0) {
      console.log(`[react:${agentName}] Round ${round + 1}: no tool calls, exiting loop`);
      break;
    }

    console.log(`[react:${agentName}] Round ${round + 1}: ${pendingToolCalls.length} tool calls: ${pendingToolCalls.map(tc => tc.name).join(', ')}`);

    // 执行 tool calls
    const toolResults: ChatMessage[] = [];
    for (const tc of pendingToolCalls) {
      const skill = skillMap.get(tc.name);
      if (!skill) {
        console.warn(`[react:${agentName}] Unknown tool call: ${tc.name}`);
        toolResults.push({ role: 'tool', content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }), toolCallId: tc.id });
        continue;
      }

      const skillStart = Date.now();
      try {
        const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
        console.log(`[react:${agentName}] Calling skill: ${tc.name}(${JSON.stringify(args).slice(0, 100)})`);
        const result = await skill.func(args as Record<string, unknown>);
        const latencyMs = Date.now() - skillStart;
        console.log(`[react:${agentName}] Skill ${tc.name} completed (${latencyMs}ms)`);
        toolCallRecords.push({ name: tc.name, input: args, output: result });
        toolResults.push({ role: 'tool', content: typeof result === 'string' ? result : JSON.stringify(result), toolCallId: tc.id });
        observer?.onStep?.(agentName, round + 1, `Called ${tc.name} (${latencyMs}ms)`);
      } catch (err: any) {
        const latencyMs = Date.now() - skillStart;
        console.error(`[react:${agentName}] Skill ${tc.name} FAILED (${latencyMs}ms): ${err.message}`);
        toolCallRecords.push({ name: tc.name, input: tc.args, output: { error: err.message } });
        toolResults.push({ role: 'tool', content: JSON.stringify({ error: err.message }), toolCallId: tc.id });
      }
    }

    // 追加 assistant message (with tool_calls) + tool results
    allMessages.push({
      role: 'assistant',
      content: roundContent || null as any,
      toolCalls: pendingToolCalls.map((tc) => ({
        type: 'function' as const,
        function: { name: tc.name, arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args) },
        id: tc.id,
      })),
    });
    allMessages.push(...toolResults);
  }

  return { contentText, thinkingText, toolCallRecords, usage: capturedUsage };
}

// ============================================================
// Main Entry: callLLMWithStructuredOutput
// ============================================================

/**
 * 调用 LLM，采用两阶段策略：
 *   Phase 1: ReAct Loop — 思考 + tool 调用（如有 skills）
 *   Phase 2: Extraction — 如 Phase 1 未产出有效 JSON，则二次调用提取结构化输出
 */
export async function callLLMWithStructuredOutput<T>(
  provider: AIProvider,
  messages: ChatMessage[],
  skills: SkillDefinition[],
  outputSchema: ZodType<T>,
  observer?: { onStep?: (name: string, idx: number, step: string) => void; onThinking?: (name: string, text: string) => void },
  agentName?: string,
  extra?: Partial<ChatOptions>,
): Promise<{ output: T; usage: { input: number; output: number; reasoning: number }; toolCallRecords?: Array<{ name: string; input: unknown; output: unknown }> }> {
  const name = agentName ?? '';

  // ── Phase 1: ReAct Loop ──
  const reactResult = await runAgentReActLoop(
    provider,
    messages,
    skills,
    { onStep: observer?.onStep, onThinking: observer?.onThinking },
    name,
    extra,
  );

  const { contentText, thinkingText, toolCallRecords, usage: capturedUsage } = reactResult;

  if (!contentText && !thinkingText) {
    throw new Error('LLM produced no content in thinking phase');
  }

  // 尝试从 Phase 1 content 直接提取 JSON
  if (contentText) {
    const extracted = tryExtractJson(contentText);
    if (extracted) {
      try {
        const result = outputSchema.parse(extracted);
        console.log(`[llm:${name}] Phase 1 produced valid JSON, skipping Phase 2`);
        return { output: result, usage: capturedUsage, toolCallRecords };
      } catch (parseErr: any) {
        console.warn(`[llm:${name}] Phase 1 found JSON but schema parse failed: ${parseErr.message?.slice(0, 120)}`);
      }
    }

    // 兼容 Mistral/NVIDIA NIM 的 [TOOL_CALLS] 格式
    const toolCallsMatch = contentText.match(/\[TOOL_CALLS\]\s*(\[[\s\S]*\])/);
    if (toolCallsMatch) {
      try {
        const calls = JSON.parse(toolCallsMatch[1]);
        const extractCall = calls.find((c: any) => c.name === 'extract_structured_output');
        if (extractCall?.arguments) {
          const args = typeof extractCall.arguments === 'string' ? JSON.parse(extractCall.arguments) : extractCall.arguments;
          console.log(`[llm:${name}] Phase 1 produced [TOOL_CALLS] format, extracted structured output`);
          return { output: outputSchema.parse(args), usage: capturedUsage, toolCallRecords };
        }
      } catch (parseErr: any) {
        console.warn(`[llm:${name}] Phase 1 [TOOL_CALLS] found but parse failed: ${parseErr.message?.slice(0, 120)}`);
      }
    }
  }

  // ── Phase 2: Extraction ──
  console.log(`[llm:${name}] Phase 1 did not produce valid JSON, entering Phase 2 (extraction)`);
  const extractionMessages = [
    ...messages,
    { role: 'assistant' as const, content: contentText },
    { role: 'user' as const, content: buildExtractionPrompt(outputSchema) },
  ];

  let extractContent = '';
  for await (const chunk of provider.streamChat(extractionMessages, buildExtractionChatOptions(outputSchema, extra))) {
    if (chunk.type === 'content' && chunk.content) {
      extractContent += chunk.content;
      observer?.onThinking?.(name, chunk.content);
    }
    if (chunk.type === 'done' && chunk.usage) {
      capturedUsage.input += (chunk.usage.promptTokens || 0);
      capturedUsage.output += (chunk.usage.completionTokens || 0);
      capturedUsage.reasoning += (chunk.usage.reasoningTokens || 0);
    }
  }

  if (extractContent) {
    try {
      const parsed = JSON.parse(extractContent);
      console.log(`[llm:${name}] Phase 2 extraction successful`);
      return { output: outputSchema.parse(parsed), usage: capturedUsage, toolCallRecords };
    } catch (parseErr: any) {
      const jsonMatch = extractContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log(`[llm:${name}] Phase 2 extraction successful (via regex fallback)`);
          return { output: outputSchema.parse(parsed), usage: capturedUsage, toolCallRecords };
        } catch (schemaErr: any) {
          console.error(`[llm:${name}] Phase 2 regex JSON found but schema parse failed: ${schemaErr.message?.slice(0, 200)}`);
        }
      } else {
        console.error(`[llm:${name}] Phase 2 no JSON object found in extraction response`);
      }
      console.error(`[llm:${name}] Phase 2 raw content preview (first 300 chars): ${extractContent.slice(0, 300)}`);
      console.error(`[llm:${name}] Phase 1 content preview (first 300 chars): ${contentText.slice(0, 300)}`);
    }
  } else {
    console.error(`[llm:${name}] Phase 2 produced no content at all`);
  }

  console.error(`[llm:${name}] FAILED to extract structured output from LLM response`);
  throw new Error('Failed to extract structured output from LLM response');
}
