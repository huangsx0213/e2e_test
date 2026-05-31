import type { ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions } from './provider.ts';
import { mergeSignals } from './provider.ts';
import { loadSkillContext, type SkillContext } from './skill-loader.ts';
import { TokenTracker } from './token-tracker.ts';
import { getCached, setCache } from './cache.ts';
import { inspectUserInput } from './guard.ts';
import { globalSkillRegistry } from './skill-registry.ts';
import { runReactLoop, type ToolExecutor } from './react-loop.ts';
import type { SerializedReactLoopState } from './react-loop-state.ts';
import type { ToolCallRecord } from './tool-orchestrator.ts';

export interface AgentRole {
  name: string;
  systemPromptTemplate: string;
  requiredSkills: string[];
  inputSchema: ZodType;
  outputSchema: ZodType;
  options?: ChatOptions;
  useProgressiveDisclosure?: boolean;
  allowedTools?: string[];
}

export interface AgentContext {
  provider: AIProvider;
  role: AgentRole;
  skillContext: SkillContext;
  tokenTracker: TokenTracker;
  promptVersion: string;
  modelName: string;
  tokenLimit: number | null;
}

export function createAgentContext(provider: AIProvider, role: AgentRole, opts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
}): AgentContext {
  const useProgressiveDisclosure = role.useProgressiveDisclosure ?? false;

  let skillContext: SkillContext;
  if (useProgressiveDisclosure) {
    const allMetadata = globalSkillRegistry.getAllMetadata();
    skillContext = {
      systemPrompt: allMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n'),
      referenceFiles: [],
      skillContents: {},
      cachedSkillContents: {},
    };
  } else {
    skillContext = loadSkillContext(role.requiredSkills);
  }

  const ctx = {
    provider,
    role,
    skillContext,
    tokenTracker: new TokenTracker(),
    promptVersion: opts?.promptVersion ?? 'unknown',
    modelName: opts?.modelName ?? 'unknown',
    tokenLimit: opts?.tokenLimit ?? null,
  };
  const skillsPromptLen = skillContext.systemPrompt.length;
  const refCount = skillContext.referenceFiles.length;
  console.log(`[agent] ${role.name}: context created, skills=${role.requiredSkills.length}, prompt=${skillsPromptLen}chars, refs=${refCount}, model=${ctx.modelName}, version=${ctx.promptVersion}${ctx.tokenLimit ? `, tokenLimit=${ctx.tokenLimit}` : ''}`);
  return ctx;
}

export class AgentTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = 'AgentTimeoutError'; }
}

export class AgentAbortError extends Error {
  constructor() { super('Agent execution aborted'); this.name = 'AgentAbortError'; }
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

const RETRY_DELAYS = [2000, 4000, 8000];
const DEFAULT_TIMEOUT = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface PreparedAgentRun {
  parsedInput: unknown;
  inputJson: string;
  messages: ChatMessage[];
}

function prepareAgentRun(context: AgentContext, input: unknown): PreparedAgentRun {
  const { role, skillContext } = context;

  console.log(`[agent] ${role.name}: parsing input...`);
  const parsedInput = role.inputSchema.parse(input);
  console.log(`[agent] ${role.name}: input parsed successfully`);

  const inputJson = JSON.stringify(parsedInput, null, 2);

  const guardResult = inspectUserInput(inputJson);
  if (guardResult.flagged) {
    console.warn(`[guard] Input flagged for agent "${role.name}": ${guardResult.matches.join(', ')}`);
  }

  const filledPrompt = fillTemplate(role.systemPromptTemplate, { input: inputJson, skills: skillContext.systemPrompt });
  const messages: ChatMessage[] = [
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];
  const approxInputTokens = Math.round(JSON.stringify(messages).length / 4);
  const skillsLen = skillContext.systemPrompt.length;
  console.log(`[agent] ${role.name}: prompt built, sysPrompt=${filledPrompt.length}chars, skillsProse=${skillsLen}chars, input=${inputJson.length}chars, ~${approxInputTokens} tokens`);

  return { parsedInput, inputJson, messages };
}

export interface AgentRunOptions {
  timeoutMs?: number;
  maxRetries?: number;
  useCache?: boolean;
  signal?: AbortSignal;
  onStep?: (stepIndex: number, stepName: string) => void;
  onThinking?: (text: string) => void;
  useReActLoop?: boolean;
  resumeState?: SerializedReactLoopState | null;
  toolExecutor?: ToolExecutor;
  deps?: { db?: any; toolRegistry?: any };
}

export interface AgentRunResult {
  result: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  latencyMs: number;
  inputPrompt: ChatMessage[];
  rawOutput: string;
  toolHistory?: ToolCallRecord[];
  requestedReview?: { phase: string; data: unknown };
  currentReactLoopState?: SerializedReactLoopState;
}

export async function runAgent(context: AgentContext, input: unknown, options: AgentRunOptions = {}): Promise<AgentRunResult> {
  const { provider, role, skillContext, tokenTracker, promptVersion, modelName } = context;
  const maxRetries = options.maxRetries ?? RETRY_DELAYS.length;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;

  const { parsedInput, inputJson, messages } = prepareAgentRun(context, input);

  if (options.useReActLoop) {
    console.log(`[agent] ${role.name}: entering ReAct Loop mode...`);
    const toolExecutor = options.toolExecutor ?? createDefaultToolExecutor(role.allowedTools);
    const reactResult = await runReactLoop(
      provider,
      skillContext.systemPrompt,
      { role: 'user', content: inputJson },
      toolExecutor,
      globalSkillRegistry,
      {
        maxIterations: 15,
        tokenLimit: context.tokenLimit,
        useCache: options.useCache,
        signal: options.signal,
        promptVersion,
        modelName,
        deps: options.deps,
      },
      options.resumeState,
    );
    let parsedResult: unknown = reactResult.result;
    if (typeof parsedResult === 'string') {
      const extracted = extractJsonFromText(parsedResult);
      if (extracted !== undefined) {
        try {
          parsedResult = role.outputSchema.parse(extracted);
          console.log(`[agent] ${role.name}: ReAct result parsed and validated against outputSchema`);
        } catch (err: any) {
          console.warn(`[agent] ${role.name}: ReAct result schema validation failed (${err.message}), using raw extracted JSON`);
          parsedResult = extracted;
        }
      } else {
        console.warn(`[agent] ${role.name}: ReAct result is string but no JSON found, using raw text`);
      }
    }

    return {
      result: parsedResult,
      tokenUsage: reactResult.tokenUsage,
      latencyMs: reactResult.latencyMs,
      inputPrompt: reactResult.inputPrompt,
      rawOutput: reactResult.rawOutput,
      toolHistory: reactResult.toolHistory,
      requestedReview: reactResult.requestedReview,
      currentReactLoopState: reactResult.currentReactLoopState,
    };
  }

  // Force cache bypass when human feedback is present
  const hasFeedback = parsedInput && typeof parsedInput === 'object' && 'humanFeedback' in parsedInput && !!(parsedInput as any).humanFeedback;
  const useCache = hasFeedback ? false : (options.useCache ?? true);
  if (useCache) {
    console.log(`[agent] ${role.name}: checking cache (version=${promptVersion}, model=${modelName})...`);
    const cached = getCached(parsedInput, promptVersion, modelName);
    if (cached) {
      console.log(`[agent] ${role.name}: cache HIT, returning cached result`);
      return { result: cached, tokenUsage: { input: 0, output: 0, reasoning: 0 }, latencyMs: 0, inputPrompt: [], rawOutput: '', toolHistory: [] };
    }
  } else {
    console.log(`[agent] ${role.name}: cache DISABLED, will invoke LLM directly`);
  }
  console.log(`[agent] ${role.name}: cache MISS${useCache ? '' : ' (disabled)'}, will invoke LLM`);

  let lastError: Error | null = null;
  const startTime = Date.now();
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`[agent] ${role.name}: attempt ${attempt + 1}/${maxRetries} starting...`);
    try {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
      const combinedSignal = options.signal
        ? mergeSignals(options.signal, timeoutController.signal)
        : timeoutController.signal;

      let fullContent = '';
      let usageData: { promptTokens: number; completionTokens: number; reasoningTokens?: number } | undefined;
      let reasoningContent = '';
      let lastEmit = 0;
      const THROTTLE_MS = 80;

      try {
        for await (const chunk of provider.streamChat(messages, { ...role.options, agentName: role.name, responseFormat: 'json_object', signal: combinedSignal })) {
          if (chunk.type === 'reasoning') {
            reasoningContent += chunk.content;
            options.onThinking?.(chunk.content);
          } else if (chunk.type === 'content') {
            fullContent += chunk.content;
            const now = Date.now();
            if (now - lastEmit >= THROTTLE_MS) {
              lastEmit = now;
              options.onThinking?.(fullContent);
            }
          } else if (chunk.type === 'done' && chunk.usage) {
            usageData = chunk.usage;
          }
        }
      } finally {
        clearTimeout(timer);
      }

      if (fullContent) {
        options.onThinking?.(fullContent);
      }

      const responseLen = fullContent.length;
      const reasoningLen = reasoningContent.length;
      console.log(`[agent] ${role.name}: attempt ${attempt + 1} stream complete, content=${responseLen}chars, reasoning=${reasoningLen}chars`);

      if (usageData) {
        tokenTracker.add(usageData);
      }
      const totalTokens = tokenTracker.getTotal().totalTokens;
      if (context.tokenLimit && totalTokens > context.tokenLimit) {
        throw new Error(`Token limit exceeded (${totalTokens} > ${context.tokenLimit}). Run aborted.`);
      }
      console.log(`[agent] ${role.name}: parsing JSON response...`);
      const cleaned = fullContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      console.log(`[agent] ${role.name}: validating against schema...`);
      const validated = role.outputSchema.parse(parsed);
      const tcCount = Array.isArray((validated as any).testConditions) ? (validated as any).testConditions.length
        : Array.isArray((validated as any).draftTestCases) ? (validated as any).draftTestCases.length
        : Array.isArray((validated as any).finalTestCases) ? (validated as any).finalTestCases.length
        : 'N/A';
      console.log(`[agent] ${role.name}: validation PASSED (items=${tcCount})${useCache ? ', caching result' : ', cache disabled'}`);
      if (useCache) setCache(parsedInput, promptVersion, modelName, validated);
      const latencyMs = Date.now() - startTime;
      const tokenUsage = {
        input: usageData?.promptTokens ?? 0,
        output: usageData?.completionTokens ?? 0,
        reasoning: usageData?.reasoningTokens ?? 0,
      };
      console.log(`[agent] ${role.name}: SUCCESS, latency=${latencyMs}ms, tokens=${tokenUsage.input}in/${tokenUsage.output}out/${tokenUsage.reasoning}reason`);
      return { result: validated, tokenUsage, latencyMs, inputPrompt: messages, rawOutput: fullContent, toolHistory: [] };
    } catch (err: any) {
        lastError = err as Error;

        const isPipelineAbort = options.signal?.aborted;
        if (isPipelineAbort) {
          throw new AgentAbortError();
        }

        const isTimeout = err?.name === 'TimeoutError'
          || err?.name === 'AbortError'
          || err?.message?.includes('Timeout')
          || err?.message?.includes('aborted');
        if (isTimeout) {
          throw new AgentTimeoutError(`Agent ${role.name} timed out after ${timeoutMs}ms`);
        }

        const isRateLimit = err?.message?.includes('429') || err?.message?.includes('rate limit');
        const isTransient = !isRateLimit && (
          err?.message?.includes('fetch failed')
          || err?.message?.includes('ECONNRESET')
          || err?.message?.includes('socket hang up')
          || err?.message?.includes('network')
          || err?.type === 'system'
        );
        const isValidationError = !isRateLimit && !isTransient && (
          err instanceof SyntaxError
          || err?.name === 'ZodError'
          || err?.message?.includes('Invalid input')
        );

        if (attempt >= maxRetries - 1) {
          throw new Error(`Agent ${role.name} failed after ${maxRetries} attempts: ${summarizeError(err)}`);
        }

        if (isRateLimit) {
          const delayMs = RETRY_DELAYS[attempt] * 2;
          console.warn(`[agent] ${role.name}: rate limit on attempt ${attempt + 1}, retrying after ${delayMs}ms`);
          await delay(delayMs);
          continue;
        }

        if (isTransient) {
          const delayMs = RETRY_DELAYS[attempt];
          console.warn(`[agent] ${role.name}: transient error on attempt ${attempt + 1}/${maxRetries}: ${lastError.message}, retrying after ${delayMs}ms`);
          await delay(delayMs);
          continue;
        }

        if (isValidationError) {
          const delayMs = RETRY_DELAYS[attempt];
          console.warn(`[agent] ${role.name}: validation error on attempt ${attempt + 1}/${maxRetries}: ${summarizeError(lastError)}, retrying after ${delayMs}ms`);
          await delay(delayMs);
          messages.push({ role: 'assistant', content: '(previous response failed validation)' });
          messages.push({ role: 'user', content: `Your previous response was invalid: ${summarizeError(lastError)}. Re-read the system prompt above which describes the required output fields and their structure. Output the COMPLETE JSON object with ALL required fields — never omit any field.` });
          continue;
        }

        console.error(`[agent] ${role.name}: non-retryable error on attempt ${attempt + 1}: ${lastError.message}`);
        throw err;
      }
  }
  throw new Error(`Agent ${role.name} failed after ${maxRetries} attempts: ${summarizeError(lastError)}`);
}

export async function* streamAgent(context: AgentContext, input: unknown, options?: AgentRunOptions): AsyncGenerator<{ type: 'reasoning' | 'chunk' | 'result'; content: unknown }> {
  const { provider, role, skillContext, tokenTracker, promptVersion, modelName } = context;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  const { parsedInput, inputJson, messages } = prepareAgentRun(context, input);

  console.log(`[agent:stream] ${role.name}: checking cache...`);
  const cached = getCached(parsedInput, promptVersion, modelName);
  if (cached) {
    console.log(`[agent:stream] ${role.name}: cache HIT`);
    yield { type: 'result', content: cached };
    return;
  }
  console.log(`[agent:stream] ${role.name}: cache MISS`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);

  let fullContent = '';
  let usageData: { promptTokens: number; completionTokens: number; reasoningTokens?: number } | undefined;
  let chunkCount = 0;

  try {
    for await (const chunk of provider.streamChat(messages, { ...role.options, agentName: role.name, signal: controller.signal })) {
      if (chunk.type === 'reasoning') {
        yield { type: 'reasoning', content: chunk.content };
      } else if (chunk.type === 'content') {
        fullContent += chunk.content;
        chunkCount++;
        yield { type: 'chunk', content: chunk.content };
      } else if (chunk.type === 'done' && chunk.usage) {
        usageData = chunk.usage;
      }
    }
    console.log(`[agent:stream] ${role.name}: stream complete, ${chunkCount} chunks, ${fullContent.length}chars total`);
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new AgentTimeoutError(`Agent ${role.name} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (usageData) {
    tokenTracker.add(usageData);
  }

  try {
    console.log(`[agent:stream] ${role.name}: parsing and validating response...`);
    const cleaned = fullContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const validated = role.outputSchema.parse(parsed);
    const tcCount = Array.isArray((validated as any).testConditions) ? (validated as any).testConditions.length
      : Array.isArray((validated as any).draftTestCases) ? (validated as any).draftTestCases.length
      : Array.isArray((validated as any).finalTestCases) ? (validated as any).finalTestCases.length
      : 'N/A';
    console.log(`[agent:stream] ${role.name}: validation PASSED (items=${tcCount}), caching`);
    setCache(parsedInput, promptVersion, modelName, validated);
    yield { type: 'result', content: validated };
  } catch (err) {
    console.error(`[agent:stream] ${role.name}: validation FAILED: ${summarizeError(err as Error)}`);
    throw new Error(`Agent output validation failed: ${summarizeError(err as Error)}`);
  }
}

const MAX_ERROR_LENGTH = 500;

function summarizeError(err: Error | undefined | null): string {
  if (!err) return 'unknown error';
  const zodIssues = (err as any).issues;
  if (Array.isArray(zodIssues) && zodIssues.length > 0) {
    const examples = zodIssues.slice(0, 5).map((i: any) => {
      const path = i.path?.join('.') || '(root)';
      if (i.received === 'undefined') return `"${path}" is missing`;
      if (i.expected && i.received) return `"${path}" expected ${i.expected}, got ${i.received}`;
      return `"${path}": ${i.message || 'invalid'}`;
    });
    const rest = zodIssues.length > 5 ? ` (+${zodIssues.length - 5} more)` : '';
    return `${zodIssues.length} field validation error(s): ${examples.join('; ')}${rest}`;
  }
  const msg = err.message || String(err);
  return msg.length > MAX_ERROR_LENGTH ? msg.slice(0, MAX_ERROR_LENGTH) + '...' : msg;
}

function createDefaultToolExecutor(allowedTools?: string[]): ToolExecutor {
  const allTools = [
    {
      name: 'search_skills',
      description: 'Search available skills by name, description, or tags. Returns metadata for matching skills.',
      parameters: {
        type: 'object' as const,
        properties: { query: { type: 'string' as const, description: 'Search query' } },
        required: ['query'],
      },
    },
    {
      name: 'load_skill',
      description: 'Load the full SKILL.md content for a skill by name. Injects instructions into the agent context.',
      parameters: {
        type: 'object' as const,
        properties: { name: { type: 'string' as const, description: 'Skill name to load' } },
        required: ['name'],
      },
    },
    {
      name: 'execute_skill_module',
      description: 'Execute a function from a skill executable module (index.ts). Calls the exported function with provided arguments.',
      parameters: {
        type: 'object' as const,
        properties: {
          skillName: { type: 'string' as const, description: 'Name of the skill whose module to call' },
          functionName: { type: 'string' as const, description: 'Name of the exported function to call' },
          args: { type: 'array' as const, description: 'Array of arguments to pass to the function', items: { type: 'string' as const } },
        },
        required: ['skillName', 'functionName', 'args'],
      },
    },
    {
      name: 'request_review',
      description: 'Request human review of intermediate results. Pauses execution until user provides feedback.',
      parameters: {
        type: 'object' as const,
        properties: {
          phase: { type: 'string' as const, description: 'Label for the review phase' },
          data: { type: 'object' as const, description: 'Data to present for review' },
        },
        required: ['phase', 'data'],
      },
    },
  ];

  const filtered = allowedTools
    ? allTools.filter(t => allowedTools.includes(t.name))
    : allTools;

  const specialToolNames = ['search_skills', 'load_skill', 'execute_skill_module', 'request_review'];

  return {
    executeTool: async (call: import('./provider.ts').ToolCall) => {
      throw new Error(`Unknown tool: ${call.name}`);
    },
    getAgentTools: () => filtered,
    isSpecialTool: (name: string) => specialToolNames.includes(name),
  };
}

function extractJsonFromText(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1]); } catch {}
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try { return JSON.parse(bracketMatch[0]); } catch {}
  }
  return undefined;
}