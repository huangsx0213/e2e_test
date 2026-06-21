import { toJSONSchema, type ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions, ToolCall } from '../../infra/provider.ts';
import type { SkillDefinition } from './types.ts';
import type { StructuredOutputProfile } from '../structured-output/profile.ts';

/**
 * 递归遍历 JSON Schema，确保所有 object 类型都有 strict 约束：
 * - additionalProperties: false
 * - 确保每个嵌套 object 都有 required 数组（由 zodToJsonSchema 原生保证）
 */
function ensureStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.type === 'object' && typeof schema.properties === 'object' && schema.properties) {
    schema.additionalProperties = false;
    for (const key of Object.keys(schema.properties as Record<string, unknown>)) {
      const val = (schema.properties as Record<string, unknown>)[key];
      if (val && typeof val === 'object') {
        (schema.properties as Record<string, unknown>)[key] = ensureStrictJsonSchema(val as Record<string, unknown>);
      }
    }
  }
  if (schema.items && typeof schema.items === 'object') {
    schema.items = ensureStrictJsonSchema(schema.items as Record<string, unknown>);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    schema.additionalProperties = ensureStrictJsonSchema(schema.additionalProperties as Record<string, unknown>);
  }
  return schema;
}

/**
 * 将 Zod schema 转换为 JSON Schema（用于 tool parameters），
 * 自动注入 strict 约束（additionalProperties: false）。
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  return ensureStrictJsonSchema(toJSONSchema(schema) as Record<string, unknown>);
}

/**
 * 对 JSON Schema 做 OpenAI Structured Outputs / strict mode 的兼容处理：
 * 1. 把所有 properties 的 key 都加入 required 数组
 * 2. 对新增到 required 的字段（原为 optional），type 包装为 {type: [原type, "null"]}
 *
 * OpenAI strict mode 要求: required 必须包含 properties 的每一个 key。
 */
export function makeSchemaOpenAICompatible(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;

  if (schema.type === 'object' && typeof schema.properties === 'object' && schema.properties) {
    const propKeys = Object.keys(schema.properties as Record<string, unknown>);
    const requiredSet = new Set<string>(
      Array.isArray(schema.required) ? (schema.required as string[]) : []
    );

    for (const key of propKeys) {
      if (!requiredSet.has(key)) {
        // This property was optional in Zod — add null acceptance
        const prop = (schema.properties as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
        if (prop && typeof prop === 'object') {
          // Handle z.any() / type-less properties (e.g. changeLog[].from)
          if (!prop.type && !prop.anyOf && !prop.oneOf && !prop.$ref) {
            prop.type = ['string', 'null'];
          } else if (typeof prop.type === 'string') {
            prop.type = [prop.type, 'null'];
          } else if (Array.isArray(prop.type) && !prop.type.includes('null')) {
            prop.type.push('null');
          }
          // anyOf/oneOf: each branch needs null too
          for (const combinator of ['anyOf', 'oneOf'] as const) {
            if (Array.isArray(prop[combinator])) {
              (prop[combinator] as Record<string, unknown>[]).push({ type: 'null' });
            }
          }
        }
        requiredSet.add(key);
      }
    }

    schema.required = Array.from(requiredSet);

    // Recurse into properties
    for (const key of propKeys) {
      const val = (schema.properties as Record<string, unknown>)[key];
      if (val && typeof val === 'object') {
        (schema.properties as Record<string, unknown>)[key] = makeSchemaOpenAICompatible(val as Record<string, unknown>);
      }
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    schema.items = makeSchemaOpenAICompatible(schema.items as Record<string, unknown>);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    schema.additionalProperties = makeSchemaOpenAICompatible(schema.additionalProperties as Record<string, unknown>);
  }

  return schema;
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
 * 仅暴露业务工具；最终结构化输出统一由后续提取阶段生成。
 */
export function buildThinkingChatOptions(
  skills: SkillDefinition[],
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const { temperature: _ignored, responseFormat: _ignoredFormat, tools: _ignoredTools, toolChoice: _ignoredChoice, ...allowedExtra } = extra ?? {};
  
  // 构建工具列表：仅业务 skills。最终 JSON 由后续提取阶段统一生成，避免思考阶段依赖模型主动提交结构化 payload。
  const businessTools = skillsToChatTools(skills);
  
  return {
    temperature: 0.3,
    maxTokens: 32768,
    tools: businessTools,
    toolChoice: businessTools && businessTools.length > 0 ? 'auto' : undefined,
    ...allowedExtra,
  };
}

/**
 * 构建 ChatOptions：Phase 2 提取阶段，使用 json_schema response_format
 */
export function buildExtractionChatOptions(
  outputProfile: StructuredOutputProfile<unknown>,
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const { temperature: _ignored, responseFormat: _ignoredFormat, tools: _ignoredTools, toolChoice: _ignoredChoice, ...allowedExtra } = extra ?? {};
  return {
    jsonSchema: outputProfile.toolSchema,
    temperature: 0,
    maxTokens: 32768,
    ...allowedExtra,
  };
}

/**
 * 构建 Phase 2 的提取 prompt，包含 schema 约束
 */
export function buildExtractionPrompt(outputProfile: StructuredOutputProfile<unknown>): string {
  const schema = outputProfile.toolSchema;
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
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = content.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '');

  try { return JSON.parse(stripped.trim()); } catch { /* continue */ }
  try { return JSON.parse(content.trim()); } catch { /* continue */ }

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
  conversationMessages: ChatMessage[];
}

/**
 * 执行 ReAct 循环：LLM 思考 → 调用 tool → 观察结果 → 继续思考
 * 最多 MAX_REACT_ROUNDS 轮，无 tool_calls 时退出
 */
async function runAgentReActLoop(
  provider: AIProvider,
  messages: ChatMessage[],
  skills: SkillDefinition[],
  outputProfile: StructuredOutputProfile<unknown>,
  observer: { onStep?: (name: string, idx: number, step: string) => void; onThinking?: (name: string, text: string, type: 'reasoning' | 'content', phase: 'react' | 'extraction') => void },
  agentName: string,
  extra: Partial<ChatOptions> | undefined,
): Promise<ReActResult> {
  const skillMap = new Map(skills.map((s) => [s.name, s]));
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

    for await (const chunk of provider.streamChat(allMessages, buildThinkingChatOptions(skills, extra))) {
      if (chunk.type === 'reasoning' && chunk.content) {
        roundThinking += chunk.content;
        observer?.onThinking?.(agentName, chunk.content, 'reasoning', 'react');
      }
      if (chunk.type === 'content' && chunk.content) {
        roundContent += chunk.content;
        observer?.onThinking?.(agentName, chunk.content, 'content', 'react');
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
          existing.malformed = chunk.toolCall.malformed;
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

    // 执行其他 tool calls
    const toolResults: ChatMessage[] = [];
    for (const tc of pendingToolCalls) {
      const skill = skillMap.get(tc.name);
      if (!skill) {
        console.warn(`[react:${agentName}] Unknown tool call: ${tc.name}`);
        toolResults.push({ role: 'tool', content: JSON.stringify({ error: `Unknown tool: "${tc.name}". You can only call the tools explicitly provided to you. Do NOT invent or call any tool that is not in the available tool list. Continue your analysis in plain text and let the automatic extraction step produce the final structured output.` }), toolCallId: tc.id });
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

  return { contentText, thinkingText, toolCallRecords, usage: capturedUsage, conversationMessages: allMessages };
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
  outputProfile: StructuredOutputProfile<T>,
  observer?: { onStep?: (name: string, idx: number, step: string) => void; onThinking?: (name: string, text: string, type: 'reasoning' | 'content', phase: 'react' | 'extraction') => void },
  agentName?: string,
  extra?: Partial<ChatOptions>,
): Promise<{ output: T; usage: { input: number; output: number; reasoning: number }; toolCallRecords?: Array<{ name: string; input: unknown; output: unknown }> }> {
  const name = agentName ?? '';

  // ── Phase 1: ReAct Loop ──
  const reactResult = await runAgentReActLoop(
    provider,
    messages,
    skills,
    outputProfile,
    { onStep: observer?.onStep, onThinking: observer?.onThinking },
    name,
    extra,
  );

  const { contentText, thinkingText, toolCallRecords, usage: capturedUsage, conversationMessages } = reactResult;

  if (!contentText && !thinkingText) {
    throw new Error('LLM produced no content in thinking phase');
  }

  // 尝试从 Phase 1 content 直接提取 JSON
  if (contentText) {
    const extracted = tryExtractJson(contentText);
    if (extracted) {
      if (outputProfile.shouldAttemptPhase1Extraction && !outputProfile.shouldAttemptPhase1Extraction(extracted)) {
        const extractedType = typeof extracted;
        const keys = extracted && typeof extracted === 'object' ? Object.keys(extracted as Record<string, unknown>) : [];
        console.log(`[llm:${name}] Phase 1 extracted JSON did not match expected top-level wrapper, skipping to Phase 2`);
        console.log(`[llm:${name}] Extracted structure: type=${extractedType}, keys=[${keys.join(',')}]`);
      } else {
      try {
        const normalized = outputProfile.normalize(extracted);
        const result = outputProfile.parse(normalized);
        console.log(`[llm:${name}] Phase 1 produced valid JSON, skipping Phase 2`);
        return { output: result, usage: capturedUsage, toolCallRecords };
      } catch (parseErr: any) {
        const extractedType = typeof extracted;
        const keys = extracted && typeof extracted === 'object' ? Object.keys(extracted as Record<string, unknown>) : [];
        const draftType = (extracted as any)?.draftTestCases ? typeof (extracted as any).draftTestCases : 'missing';
        console.warn(`[llm:${name}] Phase 1 found JSON but schema parse failed: ${parseErr.message?.slice(0, 200)}`);
        console.warn(`[llm:${name}] Extracted structure: type=${extractedType}, keys=[${keys.join(',')}], draftTestCases type=${draftType}`);
      }
      }
    }

  }

  // ── Phase 2: Schema-guided Extraction ──
  // Use the ReAct conversation history plus schema-constrained output to produce
  // a deterministic JSON payload after the free-form analysis phase.
  console.log(`[llm:${name}] Phase 1 did not produce valid JSON, entering Phase 2 (schema-guided extraction)`);

  let extractionMessages: ChatMessage[] = [
    ...conversationMessages,
    // Include the final assistant content from the ReAct stage so Phase 2 sees the latest analysis.
    { role: 'assistant' as const, content: contentText || '(analysis completed in earlier messages)' },
    { role: 'user' as const, content: buildExtractionPrompt(outputProfile) },
  ];

  const MAX_PHASE2_RETRIES = 3;
  let lastError: Error | null = null;
  const baseMessagesLength = extractionMessages.length;

  for (let attempt = 1; attempt <= MAX_PHASE2_RETRIES; attempt++) {
    // Reset to base messages to avoid token growth across retries
    if (extractionMessages.length > baseMessagesLength) {
      extractionMessages.splice(baseMessagesLength);
    }

    // Skip retry if aborted
    if ((extra as any)?.signal?.aborted) {
      console.error(`[llm:${name}] Phase 2 aborted on attempt ${attempt}`);
      throw lastError || new Error('Aborted');
    }

    console.log(`[llm:${name}] Phase 2 attempt ${attempt}/${MAX_PHASE2_RETRIES}`);
    let extractContent = '';
    
    for await (const chunk of provider.streamChat(extractionMessages, buildExtractionChatOptions(outputProfile, extra))) {
      if (chunk.type === 'content' && chunk.content) {
        extractContent += chunk.content;
        observer?.onThinking?.(name, chunk.content, 'content', 'extraction');
      }
      if (chunk.type === 'done' && chunk.usage) {
        capturedUsage.input += (chunk.usage.promptTokens || 0);
        capturedUsage.output += (chunk.usage.completionTokens || 0);
        capturedUsage.reasoning += (chunk.usage.reasoningTokens || 0);
      }
    }

    if (extractContent) {
      // Schema-constrained output should produce valid JSON, but still try parse with fallback
      const parsed = tryExtractJson(extractContent) ?? (() => {
        try { return JSON.parse(extractContent); } catch { return null; }
      })();

      if (parsed) {
        try {
          const result = outputProfile.parse(outputProfile.normalize(parsed));
          console.log(`[llm:${name}] Phase 2 extraction successful on attempt ${attempt}`);
          return { output: result, usage: capturedUsage, toolCallRecords };
        } catch (schemaErr: any) {
          console.warn(`[llm:${name}] Phase 2 schema validation failed on attempt ${attempt}: ${schemaErr.message?.slice(0, 200)}`);
          lastError = schemaErr;
          
          // Provide feedback to the model for the next attempt
          extractionMessages.push({ role: 'assistant', content: extractContent });
          extractionMessages.push({ 
            role: 'user', 
            content: `Your JSON was valid, but schema validation failed: ${outputProfile.formatValidationError(schemaErr)} Please fix these errors and output the corrected JSON matching the schema exactly.`
          });
        }
      } else {
        console.warn(`[llm:${name}] Phase 2 schema-guided extraction produced unparseable content on attempt ${attempt}`);
        lastError = new Error('Unparseable content');
        
        extractionMessages.push({ role: 'assistant', content: extractContent });
        extractionMessages.push({ 
          role: 'user', 
          content: 'The output was not valid JSON. Please output a single valid JSON object matching the required schema. Do NOT include any markdown formatting or extra text.'
        });
      }
    } else {
      console.warn(`[llm:${name}] Phase 2 produced no content at all on attempt ${attempt}`);
      lastError = new Error('No content produced');
      
      extractionMessages.push({ role: 'assistant', content: '(no output)' });
      extractionMessages.push({ 
        role: 'user', 
        content: 'No content was generated. Please ensure you output a single valid JSON object matching the schema.'
      });
    }
  }

  console.error(`[llm:${name}] FAILED to extract structured output from LLM response after ${MAX_PHASE2_RETRIES} attempts`);
  throw lastError || new Error('Failed to extract structured output from LLM response');
}
