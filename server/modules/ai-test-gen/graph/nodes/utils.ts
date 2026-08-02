import { toJSONSchema, type ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions, ToolCall } from '../../infra/provider.ts';
import type { SkillDefinition } from './types.ts';
import type { StructuredOutputProfile } from '../structured-output/profile.ts';
import { Log } from '../../../../shared/services/logger.ts';
import { jsonrepair } from 'jsonrepair';

/**
 * Recursively traverse the JSON Schema to ensure all object types have strict constraints:
 * - additionalProperties: false
 * - Ensure each nested object has a required array (natively guaranteed by zodToJsonSchema)
 */
function ensureStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;
  // Same Azure-compatible detection as makeSchemaOpenAICompatible below.
  const isObjectSchema =
    schema.type === 'object' ||
    (Array.isArray(schema.type) && (schema.type as unknown[]).includes('object'));
  if (isObjectSchema && typeof schema.properties === 'object' && schema.properties) {
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
 * Convert a Zod schema to a JSON Schema (for tool parameters),
 * automatically injecting strict constraints (additionalProperties: false).
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  return ensureStrictJsonSchema(toJSONSchema(schema) as Record<string, unknown>);
}

/**
 * Make a JSON Schema compatible with OpenAI Structured Outputs / strict mode:
 * 1. Add all properties' keys to the required array
 * 2. For fields newly added to required (originally optional), wrap type as {type: [originalType, "null"]}
 *
 * OpenAI strict mode requires: required must include every key of properties.
 */
export function makeSchemaOpenAICompatible(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema;

  // Azure strict mode: a schema with `type: ["object", "null"]` is still an
  // object schema at heart — we need to recurse into its `properties` even
  // when type has been wrapped to allow null. Detect "object-ness" with
  // either the string form or an array form that includes "object".
  const isObjectSchema =
    schema.type === 'object' ||
    (Array.isArray(schema.type) && (schema.type as unknown[]).includes('object'));

  if (isObjectSchema && typeof schema.properties === 'object' && schema.properties) {
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
 * Convert SkillDefinition[] to ChatOptions.tools format
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
 * Strip fields the builder always overrides (temperature/responseFormat/tools/
 * toolChoice) from `extra`, so per-call overrides never resurrect a value the
 * Phase 1 / Phase 2 options explicitly control.
 */
function stripOptionOverrides(extra?: Partial<ChatOptions>): Partial<ChatOptions> {
  const { temperature: _temperature, responseFormat: _responseFormat, tools: _tools, toolChoice: _toolChoice, ...rest } = extra ?? {};
  return rest;
}

/**
 * Build ChatOptions: Phase 1 thinking + ReAct stage
 * Only expose business tools; final structured output is generated by the subsequent extraction stage.
 */
export function buildThinkingChatOptions(
  skills: SkillDefinition[],
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const allowedExtra = stripOptionOverrides(extra);
  
  // Build tool list: only business skills. Final JSON is generated by the subsequent extraction stage to avoid the thinking stage depending on the model proactively submitting a structured payload.
  const businessTools = skillsToChatTools(skills);
  
  return {
    temperature: 0.5,
    tools: businessTools,
    toolChoice: businessTools && businessTools.length > 0 ? 'auto' : undefined,
    ...allowedExtra,
  };
}

/**
 * Build ChatOptions: Phase 2 extraction stage, using json_schema response_format
 */
export function buildExtractionChatOptions(
  outputProfile: StructuredOutputProfile<unknown>,
  extra?: Partial<ChatOptions>,
): ChatOptions {
  const allowedExtra = stripOptionOverrides(extra);
  return {
    jsonSchema: outputProfile.toolSchema,
    temperature: 0,
    ...allowedExtra,
  };
}

/**
 * Build the Phase 2 extraction prompt, including schema constraints
 */
export function buildExtractionPrompt(outputProfile: StructuredOutputProfile<unknown>): string {
  const schema = outputProfile.toolSchema;
  const hints = outputProfile.extractionHints;
  const hintsSection = hints ? `\n\nAdditional constraints (JSON Schema cannot express these — follow strictly):\n${hints}` : '';
  return `Based on the analysis above, output a single JSON object matching this schema. Do NOT include any text before or after the JSON.

Schema:
${JSON.stringify(schema, null, 2)}${hintsSection}`;
}

/**
 * Extract a JSON object from text. By priority:
 *   1. The entire content is JSON
 *   2. Extract the last complete JSON object from mixed text
 */
/**
 * Use jsonrepair to fix common LLM JSON syntax errors:
 * - missing/extra quotes, single quotes instead of double
 * - missing/trailing commas
 * - unclosed braces/brackets (truncated output)
 * - comments (// and block comments)
 * - Python/JS literals (None, True, False -> null, true, false)
 * - concatenated JSON fragments
 * Returns null if repair is not possible.
 */
function tryRepairJson(text: string): string | null {
  try { return jsonrepair(text); } catch { return null; }
}

function tryExtractJson(content: string): unknown | null {
  // 1. Try extracting from ```json fences first (most reliable)
  const fencePattern = /```(?:json)\s*\n([\s\S]*?)```/g;
  const fenceBlocks: string[] = [];
  let fenceMatch;
  while ((fenceMatch = fencePattern.exec(content)) !== null) {
    fenceBlocks.push(fenceMatch[1].trim());
  }
  for (let i = fenceBlocks.length - 1; i >= 0; i--) {
    const raw = fenceBlocks[i];
    try { return JSON.parse(raw); } catch { /* try repair */ }
    const repaired = tryRepairJson(raw);
    if (repaired !== null) try { return JSON.parse(repaired); } catch { /* try next */ }
  }

  // 2. Strip fences and try parsing whole content
  const stripped = content.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '');
  const candidates = [stripped.trim(), content.trim()];
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* try repair */ }
    const repaired = tryRepairJson(c);
    if (repaired !== null) try { return JSON.parse(repaired); } catch { /* try next */ }
  }

  // 2.5. Handle truncated JSON (missing closing fence/braces — LLM hit max
  // output tokens). Extract from the first '{' to end of stripped content and
  // try jsonrepair, which auto-closes missing brackets/braces.
  const firstBrace = stripped.indexOf('{');
  if (firstBrace !== -1) {
    const repaired = tryRepairJson(stripped.slice(firstBrace));
    if (repaired !== null) try { return JSON.parse(repaired); } catch { /* continue */ }
  }

  // 3. Fall back to brace matching
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
    if (depth !== 0) {
      // Truncated JSON (unbalanced braces) — try jsonrepair on the tail
      const repaired = tryRepairJson(content.slice(openIdx));
      if (repaired !== null) try { return JSON.parse(repaired); } catch { /* try next */ }
      searchFrom = openIdx + 1;
    }
  }

  for (let i = jsonBlocks.length - 1; i >= 0; i--) {
    const raw = jsonBlocks[i];
    try { return JSON.parse(raw); } catch { /* try repair */ }
    const repaired = tryRepairJson(raw);
    if (repaired !== null) try { return JSON.parse(repaired); } catch { /* try next */ }
  }

  return null;
}

// ============================================================
// ReAct Loop
// ============================================================

const MAX_REACT_ROUNDS = 15;

// E3: Truncate large tool results to avoid context bloat
const MAX_TOOL_RESULT_CHARS = 6000;
function truncateToolResult(content: string): string {
  if (!content || typeof content !== 'string') return '';
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;
  return content.slice(0, MAX_TOOL_RESULT_CHARS) + `\n...(truncated, ${content.length} chars total)`;
}

function extractedValueSummary(value: unknown): { type: string; keys: string[]; draftTestCases: string } {
  const keys = value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>) : [];
  const draftTestCases = (value as any)?.draftTestCases ? typeof (value as any).draftTestCases : 'missing';
  return { type: typeof value, keys, draftTestCases };
}

/**
 * Consume an extraction-stage stream (Phase 1.5 nudge / Phase 2 retry loop),
 * accumulating content and token usage.
 */
async function consumeExtractionStream(
  provider: AIProvider,
  messages: ChatMessage[],
  options: ChatOptions,
  observer: { onThinking?: (name: string, text: string, type: 'reasoning' | 'content', phase: 'react' | 'extraction') => void },
  name: string,
  usage: { input: number; output: number; reasoning: number },
): Promise<string> {
  let content = '';
  for await (const chunk of provider.streamChat(messages, options)) {
    if (chunk.type === 'content' && chunk.content) {
      content += chunk.content;
      observer?.onThinking?.(name, chunk.content, 'content', 'extraction');
    }
    if (chunk.type === 'done' && chunk.usage) {
      usage.input += (chunk.usage.promptTokens || 0);
      usage.output += (chunk.usage.completionTokens || 0);
      usage.reasoning += (chunk.usage.reasoningTokens || 0);
    }
  }
  return content;
}

interface ReActResult {
  contentText: string;
  thinkingText: string;
  toolCallRecords: Array<{ name: string; input: unknown; output: unknown }>;
  usage: { input: number; output: number; reasoning: number };
  conversationMessages: ChatMessage[];
}

/**
 * Execute the ReAct loop: LLM thinks → call tool → observe result → continue thinking
 * At most MAX_REACT_ROUNDS rounds; exit when there are no tool_calls
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
  const log = Log.for(`react:${agentName}`);
  log.info(`ReAct loop start ── ${skills.length} skills: ${skills.map(s => s.name).join(', ')}`);
  const allMessages: ChatMessage[] = [...messages];
  let contentText = '';
  let thinkingText = '';
  const toolCallRecords: ReActResult['toolCallRecords'] = [];
  let capturedUsage = { input: 0, output: 0, reasoning: 0 };
  let totalRounds = 0;

  observer?.onStep?.(agentName, 0, 'Phase 1: Analysis started');

  for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
    totalRounds = round + 1;
    // Stream call to LLM (with tools)
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
          existing.args = chunk.toolCall.args; // The last delta contains the complete args
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

    // E1: Early termination check — if the same skill is called for 3 consecutive rounds, force terminate
    if (toolCallRecords.length >= 3) {
      const recentCalls = toolCallRecords.slice(-3);
      const uniqueRecent = new Set(recentCalls.map(r => r.name));
      if (uniqueRecent.size === 1) {
        log.info(`Early termination: stuck repeating skill "${recentCalls[0].name}"`);
        break;
      }
    }

    if (pendingToolCalls.length === 0) {
      log.info(`Round ${round + 1}: no tool calls, exiting loop`);
      break;
    }

    log.info(`Round ${round + 1}: ${pendingToolCalls.length} tool calls: ${pendingToolCalls.map(tc => tc.name).join(', ')}`);

    // Filter out empty-named tool calls (hallucinated by some providers)
    const namedToolCalls = pendingToolCalls.filter(tc => tc.name);
    const skippedCount = pendingToolCalls.length - namedToolCalls.length;
    if (skippedCount > 0) log.warn(`Skipped ${skippedCount} tool call(s) with empty name`);

    if (namedToolCalls.length === 0) {
      log.info(`No named tool calls, exiting loop`);
      break;
    }

    // Execute tool calls
    const toolResults: ChatMessage[] = [];
    const criticalTools = new Set(['requirement_detail_query', 'istqb_guide', 'requirement_graph_query', 'flow_detail_query']);
    
    for (const tc of namedToolCalls) {
      const skill = skillMap.get(tc.name);
      if (!skill) {
        log.warn(`Unknown tool call: ${tc.name}`);
        toolResults.push({ role: 'tool', content: JSON.stringify({ error: `Unknown tool: "${tc.name}". You can only call the tools explicitly provided to you. Do NOT invent or call any tool that is not in the available tool list. Continue your analysis in plain text and let the automatic extraction step produce the final structured output.` }, null, 2), toolCallId: tc.id });
        continue;
      }

      const skillStart = Date.now();
      try {
        const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
        const result = await skill.func(args as Record<string, unknown>);
        const latencyMs = Date.now() - skillStart;
        log.kv(`${tc.name}`, `completed (${latencyMs}ms)`);
        toolCallRecords.push({ name: tc.name, input: args, output: result });
        toolResults.push({ role: 'tool', content: truncateToolResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2)), toolCallId: tc.id });
        observer?.onStep?.(agentName, round + 1, `Called ${tc.name} (${latencyMs}ms)`);
      } catch (err: any) {
        const latencyMs = Date.now() - skillStart;
        log.error(`Skill ${tc.name} FAILED (${latencyMs}ms): ${err.message}`);
        
        // Critical Tool Failure - Abort immediately instead of letting the LLM hallucinate
        if (criticalTools.has(tc.name)) {
          log.error(`CRITICAL TOOL FAILURE: ${tc.name} failed. Aborting ReAct loop to prevent hallucination.`);
          throw new Error(`Critical tool execution failed: [${tc.name}] ${err.message}. Aborting to prevent context hallucination.`);
        }

        toolCallRecords.push({ name: tc.name, input: tc.args, output: { error: err.message } });
        toolResults.push({ role: 'tool', content: JSON.stringify({ error: err.message }, null, 2), toolCallId: tc.id });
      }
    }

    // Append assistant message (with tool_calls) + tool results
    allMessages.push({
      role: 'assistant',
      content: roundContent || null as any,
      toolCalls: namedToolCalls.map((tc) => ({
        type: 'function' as const,
        function: { name: tc.name, arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args) },
        id: tc.id,
      })),
    });

    allMessages.push(...toolResults);
  }

  const toolCallCount = toolCallRecords.length;
  observer?.onStep?.(agentName, 1, toolCallCount > 0
    ? `Phase 1: Analysis completed (${totalRounds} rounds, ${toolCallCount} tools)`
    : `Phase 1: Analysis completed (${totalRounds} rounds)`);

  return { contentText, thinkingText, toolCallRecords, usage: capturedUsage, conversationMessages: allMessages };
}

// ============================================================
// Main Entry: callLLMWithStructuredOutput
// ============================================================

/**
 * Call the LLM using a two-phase strategy:
 *   Phase 1: ReAct Loop — thinking + tool calls (if skills exist)
 *   Phase 2: Extraction — if Phase 1 does not produce valid JSON, make a second call to extract the structured output
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

  const llmLog = Log.for(`llm:${name}`);

  let phase1FailReason = 'no contentText';

  if (contentText) {
    const extracted = tryExtractJson(contentText);
    if (extracted) {
      if (outputProfile.shouldAttemptPhase1Extraction && !outputProfile.shouldAttemptPhase1Extraction(extracted)) {
        const { type: extractedType, keys } = extractedValueSummary(extracted);
        phase1FailReason = `unexpected wrapper (type=${extractedType}, keys=[${keys.join(',')}])`;
        llmLog.info(`Phase 1 JSON skipped ── ${phase1FailReason}`);
      } else {
      try {
        const normalized = outputProfile.normalize(extracted);
        const result = outputProfile.parse(normalized);
        llmLog.success('Phase 1 JSON valid ── skipping Phase 2');
        observer?.onStep?.(name, 2, 'Phase 1: Extraction direct success');
        return { output: result, usage: capturedUsage, toolCallRecords };
      } catch (parseErr: any) {
        const { type: extractedType, keys, draftTestCases: draftType } = extractedValueSummary(extracted);
        // Log the FULL validation error (not truncated) as an independent entry
        const fullError = outputProfile.formatValidationError(parseErr);
        phase1FailReason = `schema parse failed: ${fullError.split('\n')[0]}`;
        const errorBlock = [
          `Phase 1 JSON found but schema parse failed`,
          `  agent: ${name}`,
          `  extracted: type=${extractedType}, keys=[${keys.join(',')}], draftTestCases=${draftType}`,
          `  validation errors:`,
          ...fullError.split('\n').map(l => `    ${l}`),
        ].join('\n');
        llmLog.warn(errorBlock);
      }
      }
    } else {
      phase1FailReason = 'no JSON block found in contentText';
    }

  }

  // Phase 1.5: Nudge — if the LLM exited the ReAct loop without producing JSON,
  // send a follow-up in the SAME conversation (with full tool-result context)
  // asking it to output the final JSON. Phase 2 strips the conversation, losing
  // tool results — the nudge preserves them. Only triggers when no JSON was
  // found at all (not for schema-validation failures, which need Phase 2's
  // error-feedback loop).
  if (phase1FailReason === 'no JSON block found in contentText' && conversationMessages.length > 2) {
    llmLog.info('Phase 1.5: nudging LLM to output final JSON (full conversation context)');
    observer?.onStep?.(name, 2, 'Phase 1.5: Nudge for JSON output');

    const nudgeMessages: ChatMessage[] = [
      ...conversationMessages,
      { role: 'user' as const, content: buildExtractionPrompt(outputProfile) },
    ];

    const nudgeContent = await consumeExtractionStream(
      provider,
      nudgeMessages,
      buildExtractionChatOptions(outputProfile, extra),
      { onThinking: observer?.onThinking },
      name,
      capturedUsage,
    );

    if (nudgeContent) {
      const nudgeExtracted = tryExtractJson(nudgeContent);
      if (nudgeExtracted) {
        if (!outputProfile.shouldAttemptPhase1Extraction || outputProfile.shouldAttemptPhase1Extraction(nudgeExtracted)) {
          try {
            const normalized = outputProfile.normalize(nudgeExtracted);
            const result = outputProfile.parse(normalized);
            llmLog.success('Phase 1.5 JSON valid ── skipping Phase 2');
            observer?.onStep?.(name, 2, 'Phase 1.5: Nudge extraction success');
            return { output: result, usage: capturedUsage, toolCallRecords };
          } catch (parseErr: any) {
            const fullError = outputProfile.formatValidationError(parseErr);
            phase1FailReason = `Phase 1.5 schema parse failed: ${fullError.split('\n')[0]}`;
            llmLog.warn(`Phase 1.5 JSON found but schema parse failed:\n${fullError}`);
          }
        } else {
          const { keys } = extractedValueSummary(nudgeExtracted);
          llmLog.warn(`Phase 1.5 nudge produced unexpected wrapper (keys=[${keys.join(',')}])`);
        }
      } else {
        const preview = nudgeContent.length > 200 ? `${nudgeContent.slice(0, 200)}...` : nudgeContent;
        llmLog.warn(`Phase 1.5 nudge produced no parseable JSON ── length=${nudgeContent.length} ── preview: "${preview}"`);
      }
    } else {
      llmLog.warn('Phase 1.5 nudge produced no content');
    }
  }

  llmLog.info(`Phase 1 JSON invalid ── entering Phase 2 (schema extraction) ── reason: ${phase1FailReason}`);

  observer?.onStep?.(name, 2, 'Phase 2: Extracting structured output');

  // Phase 2: only send system + user + synthesized contentText + extraction prompt.
  // Skip all ReAct tool calls/results — contentText already synthesizes the findings
  // from tool calls. This avoids re-sending potentially large tool result payloads
  // (e.g., istqb_guide ~7k tokens, requirement_graph_query ~2k tokens per call).
  // Fallback: if contentText is too short (LLM put analysis in tool results, not content),
  // include the full conversation to preserve context.
  const PHASE2_MIN_CONTENT_LENGTH = 100;
  const useFullConversation = !contentText || contentText.length < PHASE2_MIN_CONTENT_LENGTH;

  let extractionMessages: ChatMessage[];
  if (useFullConversation) {
    llmLog.info(`Phase 2: contentText too short (${contentText.length} chars), using full conversation`);
    extractionMessages = [
      ...conversationMessages,
      { role: 'assistant' as const, content: contentText || '(analysis completed in earlier messages)' },
      { role: 'user' as const, content: buildExtractionPrompt(outputProfile) },
    ];
  } else {
    llmLog.info(`Phase 2: using condensed messages (system + user + contentText only), skipping ${conversationMessages.length - messages.length} ReAct messages`);
    extractionMessages = [
      ...messages,
      { role: 'assistant' as const, content: contentText },
      { role: 'user' as const, content: buildExtractionPrompt(outputProfile) },
    ];
  }

  const MAX_PHASE2_RETRIES = 3;
  let lastError: Error | null = null;
  const baseMessagesLength = extractionMessages.length;
  let lastErrorFeedback: ChatMessage[] | null = null;

  let lastExtractContent = '';

  for (let attempt = 1; attempt <= MAX_PHASE2_RETRIES; attempt++) {
    // Reset to base messages, then re-attach the most recent error feedback so
    // the LLM can self-correct on the next attempt (without unbounded token
    // growth from accumulating feedback across all retries).
    extractionMessages.splice(baseMessagesLength);
    if (lastErrorFeedback) {
      extractionMessages.push(...lastErrorFeedback);
    }

    if ((extra as any)?.signal?.aborted) {
      llmLog.error(`Phase 2 aborted on attempt ${attempt}`);
      throw lastError || new Error('Aborted');
    }

    llmLog.info(`Phase 2 attempt ${attempt}/${MAX_PHASE2_RETRIES}`);
    observer?.onStep?.(name, 2, `Phase 2: Attempt ${attempt}/${MAX_PHASE2_RETRIES}`);
    const extractContent = await consumeExtractionStream(
      provider,
      extractionMessages,
      buildExtractionChatOptions(outputProfile, extra),
      { onThinking: observer?.onThinking },
      name,
      capturedUsage,
    );

    if (extractContent) {
      // Schema-constrained output should produce valid JSON, but still try parse with fallback
      const parsed = tryExtractJson(extractContent) ?? (() => {
        try { return JSON.parse(extractContent); } catch { return null; }
      })();

      if (parsed) {
        try {
          const result = outputProfile.parse(outputProfile.normalize(parsed));
          llmLog.success(`Phase 2 extraction successful on attempt ${attempt}`);
          observer?.onStep?.(name, 3, 'Phase 2: Extraction successful');
          return { output: result, usage: capturedUsage, toolCallRecords };
        } catch (schemaErr: any) {
          // Log the FULL validation error (not truncated) as an independent entry
          const fullError = outputProfile.formatValidationError(schemaErr);
          const errorBlock = [
            `Phase 2 schema validation failed on attempt ${attempt}`,
            `  agent: ${name}`,
            `  validation errors:`,
            ...fullError.split('\n').map(l => `    ${l}`),
          ].join('\n');
          llmLog.warn(errorBlock);
          // Attach the raw LLM content to the error so scope.ts can persist it
          // to error_raw_response for offline debugging.
          (schemaErr as any).rawResponse = extractContent;
          lastError = schemaErr;

          lastErrorFeedback = [
            { role: 'assistant', content: extractContent },
            { role: 'user', content: `Your JSON was valid, but schema validation failed: ${outputProfile.formatValidationError(schemaErr)} Please fix these errors and output the corrected JSON matching the schema exactly.` },
          ];
        }
      } else {
        const preview = extractContent.length > 500 ? `${extractContent.slice(0, 500)}...` : extractContent;
        llmLog.warn(`Phase 2 produced unparseable content on attempt ${attempt} ── length=${extractContent.length} ── content preview: "${preview}"`);
        lastExtractContent = extractContent;
        lastError = new Error('Unparseable content');
        // Persist the raw content for offline debugging.
        (lastError as any).rawResponse = extractContent;

        lastErrorFeedback = [
          { role: 'assistant', content: extractContent },
          { role: 'user', content: 'The output was not valid JSON. Common issues: missing commas between properties, unquoted property names (use "key" not key), trailing commas before ] or }, or unclosed braces/brackets. Output a single valid JSON object matching the schema with no extra text.' },
        ];
      }
    } else {
      llmLog.warn(`Phase 2 produced no content on attempt ${attempt}`);
      lastError = new Error('No content produced');

      lastErrorFeedback = [
        { role: 'assistant', content: '(no output)' },
        { role: 'user', content: 'No content was generated. Please ensure you output a single valid JSON object matching the schema.' },
      ];
    }
  }

  if (lastExtractContent) {
    llmLog.error(`Last Phase 2 content (full):\n${lastExtractContent}`);
  }
  llmLog.error(`FAILED to extract structured output after ${MAX_PHASE2_RETRIES} attempts`);
  observer?.onStep?.(name, 3, 'Phase 2: Extraction failed');
  throw lastError || new Error('Failed to extract structured output from LLM response');
}
