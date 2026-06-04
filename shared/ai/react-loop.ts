import type { ReactLoopState, SerializedReactLoopState } from './react-loop-state.ts';
import type { AIProvider, ChatMessage, ToolCall, ChatOptions } from './provider.ts';
import type { ToolCallRecord } from './tool-orchestrator.ts';
import type { SkillRegistry } from './skill-registry.ts';
import type { JsonSchema } from './tool.ts';
import { getCached, setCache } from './cache.ts';

export interface ReactLoopOptions {
  maxIterations?: number;
  tokenLimit?: number | null;
  useCache?: boolean;
  signal?: AbortSignal;
  promptVersion?: string;
  modelName?: string;
  deps?: { db?: any; toolRegistry?: any };
}

export interface ReactLoopResult {
  result: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  latencyMs: number;
  inputPrompt: ChatMessage[];
  rawOutput: string;
  toolHistory: ToolCallRecord[];
  currentReactLoopState?: SerializedReactLoopState;
}

export interface ToolExecutor {
  executeTool(call: ToolCall): Promise<unknown>;
  getAgentTools(): Array<{ name: string; description: string; parameters: JsonSchema }>;
  isSpecialTool(name: string): boolean;
}

export async function runReactLoop(
  provider: AIProvider,
  systemPrompt: string,
  userInput: ChatMessage,
  toolExecutor: ToolExecutor,
  skillRegistry: SkillRegistry,
  options: ReactLoopOptions = {},
  resumeState?: SerializedReactLoopState | null
): Promise<ReactLoopResult> {
  const maxIter = options.maxIterations ?? 15;
  const startTime = Date.now();
  const metadataPrompt = skillRegistry.getAllMetadata().length > 0
    ? `\n\nAvailable skills:\n${
        skillRegistry.getAllMetadata().map(s => `- ${s.name}: ${s.description}`).join('\n')
      }`
    : '';
  const fullSystemPrompt = `${systemPrompt}${metadataPrompt}`;

  const state: ReactLoopState = resumeState
    ? {
        messages: [
          { role: 'system', content: fullSystemPrompt } as ChatMessage,
          { role: 'user', content: 'Resuming from previous state.' } as ChatMessage,
        ],
        loadedSkills: new Set<string>(),
        iteration: resumeState.iteration,
        toolHistory: [...resumeState.toolHistory],
        totalTokenUsage: { ...resumeState.totalTokenUsage },
      }
    : {
        messages: [{ role: 'system', content: fullSystemPrompt } as ChatMessage, userInput],
        loadedSkills: new Set<string>(),
        iteration: 0,
        toolHistory: [],
        totalTokenUsage: { input: 0, output: 0, reasoning: 0 },
      };

  const initialPrompt = [...state.messages];

  const shouldCache = options.useCache !== false && options.promptVersion && options.modelName && !resumeState;
  if (shouldCache) {
    const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
    const cached = getCached(cacheInput, options.promptVersion, options.modelName);
    if (cached) return cached as ReactLoopResult;
  }

  for (state.iteration = resumeState?.iteration ?? 0; state.iteration < maxIter; state.iteration++) {
    const chatOptions: ChatOptions = {
      tools: toolExecutor.getAgentTools(),
      signal: options.signal,
    };

    const response = await provider.chat(state.messages, chatOptions);

    if (response.usage) {
      state.totalTokenUsage.input += response.usage.promptTokens ?? 0;
      state.totalTokenUsage.output += response.usage.completionTokens ?? 0;
      state.totalTokenUsage.reasoning += response.usage.reasoningTokens ?? 0;
    }
    const totalTokens = state.totalTokenUsage.input + state.totalTokenUsage.output;
    if (options.tokenLimit && totalTokens > options.tokenLimit) {
      throw new Error(`Token limit exceeded (${totalTokens} > ${options.tokenLimit}).`);
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      state.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls.map(tc => ({
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          id: tc.id,
        })),
      });

      for (const call of response.toolCalls) {
        if (toolExecutor.isSpecialTool(call.name)) {
          if (call.name === 'load_skill') {
            const args = call.args as { name: string };
            const content = await skillRegistry.loadContent(args.name);
            state.messages.push({
              role: 'tool',
              content: `[Skill Loaded: ${args.name}]\n${content}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.loadedSkills.add(args.name);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: `Skill loaded: ${args.name}` } as any,
              stepIndex: state.iteration,
            });
          } else if (call.name === 'search_skills') {
            const args = call.args as { query: string };
            const results = skillRegistry.search(args.query);
            state.messages.push({
              role: 'tool',
              content: `Search results for "${args.query}":\n${JSON.stringify(results)}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: results } as any,
              stepIndex: state.iteration,
            });
          } else if (call.name === 'execute_skill_module') {
            const args = call.args as { skillName: string; functionName: string; args: unknown[] };
            try {
              const mod = await skillRegistry.loadModule(args.skillName);
              let fnResult: unknown;
              if (mod.createService) {
                const service = mod.createService(options.deps ?? {});
                if (typeof service[args.functionName] === 'function') {
                  fnResult = await service[args.functionName](...(args.args ?? []));
                } else if (typeof mod[args.functionName] === 'function') {
                  fnResult = await mod[args.functionName](...(args.args ?? []));
                } else {
                  throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
                }
              } else if (typeof mod[args.functionName] === 'function') {
                fnResult = await mod[args.functionName](...(args.args ?? []));
              } else {
                throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
              }
              state.messages.push({
                role: 'tool',
                content: `Module result for ${args.skillName}.${args.functionName}: ${JSON.stringify(fnResult)}`,
                toolCallId: call.id,
              } as ChatMessage);
              state.toolHistory.push({
                toolName: call.name,
                input: call.args,
                result: { success: true, data: fnResult } as any,
                stepIndex: state.iteration,
              });
            } catch (err: any) {
              state.messages.push({
                role: 'tool',
                content: `Module error: ${err.message}`,
                toolCallId: call.id,
              } as ChatMessage);
              state.toolHistory.push({
                toolName: call.name,
                input: call.args,
                result: { success: false, error: err.message } as any,
                stepIndex: state.iteration,
              });
            }
          }
        } else {
          try {
            const result = await toolExecutor.executeTool(call);
            state.messages.push({
              role: 'tool',
              content: `Tool result for ${call.name}: ${JSON.stringify(result)}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: result } as any,
              stepIndex: state.iteration,
            });
          } catch (err: any) {
            state.messages.push({
              role: 'tool',
              content: `Tool ${call.name} failed: ${err.message}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: false, error: err.message } as any,
              stepIndex: state.iteration,
            });
          }
        }
      }
    } else {
      // Check if the response is valid JSON — if not, ask the LLM to fix it
      const content = response.content ?? '';
      const trimmed = content.trim();
      const isJson = (trimmed.startsWith('{') || trimmed.startsWith('['));

      if (!isJson && state.iteration < maxIter - 1) {
        // LLM produced non-JSON text — push a correction message and retry
        state.messages.push({
          role: 'assistant',
          content: content,
        } as ChatMessage);
        state.messages.push({
          role: 'user',
          content: 'Your response must be a single valid JSON object. No markdown, no explanations, no code blocks — just raw JSON matching the output schema. Return ONLY the JSON object now.',
        } as ChatMessage);
        continue;
      }

      const result: ReactLoopResult = {
        result: content,
        tokenUsage: { ...state.totalTokenUsage },
        latencyMs: Date.now() - startTime,
        inputPrompt: initialPrompt,
        rawOutput: content,
        toolHistory: [...state.toolHistory],
      };
      if (shouldCache && options.promptVersion && options.modelName) {
        const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
        setCache(cacheInput, options.promptVersion, options.modelName, result);
      }
      return result;
    }
  }

  const lastContent = state.messages.filter(m => m.role === 'assistant').pop()?.content ?? '';
  const result: ReactLoopResult = {
    result: lastContent,
    tokenUsage: { ...state.totalTokenUsage },
    latencyMs: Date.now() - startTime,
    inputPrompt: initialPrompt,
    rawOutput: lastContent,
    toolHistory: [...state.toolHistory],
  };
  if (shouldCache && options.promptVersion && options.modelName) {
    const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
    setCache(cacheInput, options.promptVersion, options.modelName, result);
  }
  return result;
}

export interface StreamReactLoopOptions extends ReactLoopOptions {
  onThinking?: (text: string) => void;
  onStep?: (stepIndex: number, stepName: string) => void;
}

export async function streamReactLoop(
  provider: AIProvider,
  systemPrompt: string,
  userInput: ChatMessage,
  toolExecutor: ToolExecutor,
  skillRegistry: SkillRegistry,
  options: StreamReactLoopOptions = {},
  resumeState?: SerializedReactLoopState | null
): Promise<ReactLoopResult> {
  const maxIter = options.maxIterations ?? 15;
  const startTime = Date.now();
  const onThinking = options.onThinking;
  const metadataPrompt = skillRegistry.getAllMetadata().length > 0
    ? `\n\nAvailable skills:\n${
        skillRegistry.getAllMetadata().map(s => `- ${s.name}: ${s.description}`).join('\n')
      }`
    : '';
  const fullSystemPrompt = `${systemPrompt}${metadataPrompt}`;

  const state: ReactLoopState = resumeState
    ? {
        messages: [
          { role: 'system', content: fullSystemPrompt } as ChatMessage,
          { role: 'user', content: 'Resuming from previous state.' } as ChatMessage,
        ],
        loadedSkills: new Set<string>(),
        iteration: resumeState.iteration,
        toolHistory: [...resumeState.toolHistory],
        totalTokenUsage: { ...resumeState.totalTokenUsage },
      }
    : {
        messages: [{ role: 'system', content: fullSystemPrompt } as ChatMessage, userInput],
        loadedSkills: new Set<string>(),
        iteration: 0,
        toolHistory: [],
        totalTokenUsage: { input: 0, output: 0, reasoning: 0 },
      };

  const initialPrompt = [...state.messages];

  const shouldCache = options.useCache !== false && options.promptVersion && options.modelName && !resumeState;
  if (shouldCache) {
    const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
    const cached = getCached(cacheInput, options.promptVersion, options.modelName);
    if (cached) return cached as ReactLoopResult;
  }

  for (state.iteration = resumeState?.iteration ?? 0; state.iteration < maxIter; state.iteration++) {
    const chatOptions: ChatOptions = {
      tools: toolExecutor.getAgentTools(),
      signal: options.signal,
    };

    let responseContent = '';
    let responseToolCalls: ToolCall[] = [];
    let usageData: { promptTokens: number; completionTokens: number; reasoningTokens?: number } | undefined;

    for await (const chunk of provider.streamChat(state.messages, chatOptions)) {
      if (chunk.type === 'reasoning') {
        onThinking?.(chunk.content ?? '');
      } else if (chunk.type === 'content') {
        responseContent += chunk.content ?? '';
        onThinking?.(chunk.content ?? '');
      } else if (chunk.type === 'tool_call_start' && chunk.toolCall) {
        onThinking?.(`[Calling tool: ${chunk.toolCall.name}]`);
      } else if (chunk.type === 'tool_call_end' && chunk.toolCall) {
        responseToolCalls.push(chunk.toolCall);
        onThinking?.(`[Tool result: ${JSON.stringify(chunk.toolCall.args).slice(0, 200)}]`);
      } else if (chunk.type === 'done' && chunk.usage) {
        usageData = chunk.usage;
      }
    }

    if (usageData) {
      state.totalTokenUsage.input += usageData.promptTokens ?? 0;
      state.totalTokenUsage.output += usageData.completionTokens ?? 0;
      state.totalTokenUsage.reasoning += usageData.reasoningTokens ?? 0;
    }
    const totalTokens = state.totalTokenUsage.input + state.totalTokenUsage.output;
    if (options.tokenLimit && totalTokens > options.tokenLimit) {
      throw new Error(`Token limit exceeded (${totalTokens} > ${options.tokenLimit}).`);
    }

    if (responseToolCalls.length > 0) {
      state.messages.push({
        role: 'assistant',
        content: responseContent,
        toolCalls: responseToolCalls.map((tc: any) => ({
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          id: tc.id,
        })),
      });

      for (const call of responseToolCalls) {
        if (toolExecutor.isSpecialTool(call.name)) {
          if (call.name === 'load_skill') {
            const args = call.args as { name: string };
            onThinking?.(`\n📂 Loading skill: ${args.name}...`);
            const content = await skillRegistry.loadContent(args.name);
            onThinking?.(` Loaded ${args.name} (${content.length} chars)`);
            state.messages.push({
              role: 'tool',
              content: `[Skill Loaded: ${args.name}]\n${content}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.loadedSkills.add(args.name);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: `Skill loaded: ${args.name}` } as any,
              stepIndex: state.iteration,
            });
          } else if (call.name === 'search_skills') {
            const args = call.args as { query: string };
            onThinking?.(`\n🔍 Searching skills: "${args.query}"...`);
            const results = skillRegistry.search(args.query);
            onThinking?.(` Found ${results.length} match(es)`);
            state.messages.push({
              role: 'tool',
              content: `Search results for "${args.query}":\n${JSON.stringify(results)}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: results } as any,
              stepIndex: state.iteration,
            });
          } else if (call.name === 'execute_skill_module') {
            const args = call.args as { skillName: string; functionName: string; args: unknown[] };
            onThinking?.(`\n⚙️ Executing ${args.skillName}.${args.functionName}...`);
            try {
              const mod = await skillRegistry.loadModule(args.skillName);
              let fnResult: unknown;
              if (mod.createService) {
                const service = mod.createService(options.deps ?? {});
                if (typeof service[args.functionName] === 'function') {
                  fnResult = await service[args.functionName](...(args.args ?? []));
                } else if (typeof mod[args.functionName] === 'function') {
                  fnResult = await mod[args.functionName](...(args.args ?? []));
                } else {
                  throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
                }
              } else if (typeof mod[args.functionName] === 'function') {
                fnResult = await mod[args.functionName](...(args.args ?? []));
              } else {
                throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
              }
              const resultSummary = Array.isArray(fnResult) ? `${fnResult.length} items` : typeof fnResult === 'object' ? 'object' : String(fnResult).slice(0, 80);
              onThinking?.(` ✅ ${args.functionName} → ${resultSummary}`);
              state.messages.push({
                role: 'tool',
                content: `Module result for ${args.skillName}.${args.functionName}: ${JSON.stringify(fnResult)}`,
                toolCallId: call.id,
              } as ChatMessage);
              state.toolHistory.push({
                toolName: call.name,
                input: call.args,
                result: { success: true, data: fnResult } as any,
                stepIndex: state.iteration,
              });
            } catch (err: any) {
              onThinking?.(` ❌ ${args.functionName} failed: ${err.message}`);
              state.messages.push({
                role: 'tool',
                content: `Module error: ${err.message}`,
                toolCallId: call.id,
              } as ChatMessage);
              state.toolHistory.push({
                toolName: call.name,
                input: call.args,
                result: { success: false, error: err.message } as any,
                stepIndex: state.iteration,
              });
            }
          }
        } else {
          try {
            const result = await toolExecutor.executeTool(call);
            state.messages.push({
              role: 'tool',
              content: `Tool result for ${call.name}: ${JSON.stringify(result)}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: result } as any,
              stepIndex: state.iteration,
            });
          } catch (err: any) {
            state.messages.push({
              role: 'tool',
              content: `Tool ${call.name} failed: ${err.message}`,
              toolCallId: call.id,
            } as ChatMessage);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: false, error: err.message } as any,
              stepIndex: state.iteration,
            });
          }
        }
      }
    } else {
      // Check if the response is valid JSON — if not, ask the LLM to fix it
      const content = responseContent.trim();
      const isJson = (content.startsWith('{') || content.startsWith('['));

      if (!isJson && state.iteration < maxIter - 1) {
        // LLM produced non-JSON text — push a correction message and retry
        state.messages.push({
          role: 'assistant',
          content: responseContent,
        } as ChatMessage);
        state.messages.push({
          role: 'user',
          content: 'Your response must be a single valid JSON object. No markdown, no explanations, no code blocks — just raw JSON matching the output schema. Return ONLY the JSON object now.',
        } as ChatMessage);
        onThinking?.('\n⚠️ Non-JSON output detected, asking LLM to fix...');
        continue;
      }

      const result: ReactLoopResult = {
        result: responseContent,
        tokenUsage: { ...state.totalTokenUsage },
        latencyMs: Date.now() - startTime,
        inputPrompt: initialPrompt,
        rawOutput: responseContent,
        toolHistory: [...state.toolHistory],
      };
      if (shouldCache && options.promptVersion && options.modelName) {
        const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
        setCache(cacheInput, options.promptVersion, options.modelName, result);
      }
      return result;
    }
  }

  const lastContent = state.messages.filter(m => m.role === 'assistant').pop()?.content ?? '';
  const result: ReactLoopResult = {
    result: lastContent,
    tokenUsage: { ...state.totalTokenUsage },
    latencyMs: Date.now() - startTime,
    inputPrompt: initialPrompt,
    rawOutput: lastContent,
    toolHistory: [...state.toolHistory],
  };
  if (shouldCache && options.promptVersion && options.modelName) {
    const cacheInput = { userInput: userInput.content, loadedSkills: [...state.loadedSkills].sort() };
    setCache(cacheInput, options.promptVersion, options.modelName, result);
  }
  return result;
}