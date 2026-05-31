import type { ZodType } from 'zod';
import type { AIProvider, ChatMessage, ToolCall } from './provider.ts';
import type { AgentRole, AgentContext, AgentRunOptions } from './agent.ts';
import { createAgentContext, runAgent } from './agent.ts';
import { zodToJsonSchema } from './tool-converter.ts';
import { type ToolExecutor } from './react-loop.ts';
import type { SerializedReactLoopState } from './react-loop-state.ts';
import { globalSkillRegistry } from './skill-registry.ts';
import {
  createSearchSkillsTool,
  createLoadSkillTool,
  createExecuteSkillModuleTool,
  createRequestReviewTool,
} from './skill-tools.ts';
import { TestAnalystRole } from './roles/test-analyst.ts';
import { TestDesignerRole } from './roles/test-designer.ts';
import { QualityManagerRole } from './roles/quality-manager.ts';

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  not?: JsonSchema;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  format?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ToolContext {
  signal?: AbortSignal;
  useCache?: boolean;
  timeoutMs?: number;
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
  onStep?: (stepIndex: number, stepName: string) => void;
  onThinking?: (text: string) => void;
  useReActLoop?: boolean;
  resumeState?: SerializedReactLoopState | null;
  deps?: { db?: any; toolRegistry?: any };
}

export type ToolResult<T = unknown> =
  | { success: true; data: T; metadata: ToolMetadata }
  | { success: false; error: ToolError };

export interface ToolMetadata {
  toolName: string;
  latencyMs: number;
  tokenUsage: { input: number; output: number; reasoning: number };
  inputPrompt?: ChatMessage[];
}

export interface ToolError {
  code: 'VALIDATION_ERROR' | 'TIMEOUT' | 'ABORTED' | 'PROVIDER_ERROR' | 'UNKNOWN';
  message: string;
  details?: unknown;
}

export interface ToolDef<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly version: string;
  readonly kind: 'agent' | 'function';
  execute(input: TInput, ctx?: ToolContext): Promise<ToolResult<TOutput>>;
}

export function resolveToolErrorCode(err: unknown): ToolError['code'] {
  if (!err) return 'UNKNOWN';
  const e = err as any;

  if (e?.name === 'TimeoutError' || e?.message?.includes('timed out') || e?.message?.includes('Timeout')) {
    return 'TIMEOUT';
  }
  if (e?.name === 'AbortError' || e?.message?.includes('aborted') || e?.message?.includes('abort')) {
    return 'ABORTED';
  }
  if (e?.name === 'ZodError' || e?.issues || e?.message?.includes('validation')) {
    return 'VALIDATION_ERROR';
  }
  if (e?.message?.includes('429') || e?.message?.includes('rate limit') || e?.message?.includes('fetch failed') || e?.message?.includes('ECONNRESET')) {
    return 'PROVIDER_ERROR';
  }
  return 'UNKNOWN';
}

export class AgentTool<TInput = unknown, TOutput = unknown> implements ToolDef<TInput, TOutput> {
  readonly kind = 'agent' as const;

  constructor(
    private role: AgentRole,
    private providerFactory: () => AIProvider,
    private getPromptVersion: () => string,
    private getModelName: () => string,
  ) {}

  get name(): string {
    return this.role.name.replace(/-/g, '_');
  }

  get version(): string {
    return this.getPromptVersion();
  }

  get description(): string {
    const firstLine = this.role.systemPromptTemplate
      .split('\n')
      .find(l => l.trim() && !l.startsWith('#') && !l.startsWith('`'))
      ?? '';
    return firstLine.trim().slice(0, 200);
  }

  get inputSchema(): JsonSchema {
    return zodToJsonSchema(this.role.inputSchema);
  }

  get outputSchema(): JsonSchema {
    return zodToJsonSchema(this.role.outputSchema);
  }

  async execute(input: TInput, ctx: ToolContext = {}): Promise<ToolResult<TOutput>> {
    const provider = this.providerFactory();
    await globalSkillRegistry.initialize();
    const agentCtx = createAgentContext(provider, this.role, {
      promptVersion: ctx.promptVersion ?? this.getPromptVersion(),
      modelName: ctx.modelName ?? this.getModelName(),
      tokenLimit: ctx.tokenLimit,
    });

    const useReAct = ctx.useReActLoop ?? false;
    const toolExecutor = useReAct ? this.createReActToolExecutor() : undefined;
    const deps = ctx.deps;
    const resumeState = ctx.resumeState;

    const startTime = Date.now();
    try {
      const raw = await runAgent(agentCtx, input, {
        timeoutMs: ctx.timeoutMs,
        useCache: ctx.useCache ?? true,
        signal: ctx.signal,
        onStep: ctx.onStep,
        onThinking: ctx.onThinking,
        useReActLoop: useReAct,
        toolExecutor,
        deps,
        resumeState,
      });

      return {
        success: true,
        data: useReAct
          ? {
              result: raw.result,
              tokenUsage: raw.tokenUsage,
              toolHistory: raw.toolHistory,
              requestedReview: raw.requestedReview,
              currentReactLoopState: raw.currentReactLoopState,
            } as any
          : raw.result as TOutput,
        metadata: {
          toolName: this.name,
          latencyMs: raw.latencyMs,
          tokenUsage: raw.tokenUsage,
          inputPrompt: raw.inputPrompt,
        },
      };
    } catch (err: any) {
      const code = resolveToolErrorCode(err);
      return {
        success: false,
        error: {
          code,
          message: err?.message ?? String(err),
          details: err?.issues,
        },
      };
    }
  }

  private createReActToolExecutor(): ToolExecutor {
    const searchTool = createSearchSkillsTool(globalSkillRegistry);
    const loadTool = createLoadSkillTool(globalSkillRegistry);
    const execModuleTool = createExecuteSkillModuleTool(globalSkillRegistry);
    const reviewTool = createRequestReviewTool();

    const allowed = this.role.allowedTools ?? ['search_skills', 'load_skill', 'execute_skill_module', 'request_review'];

    const roleLookup: Record<string, AgentRole> = {
      'test-analyst': TestAnalystRole,
      'test-designer': TestDesignerRole,
      'quality-manager': QualityManagerRole,
    };

    const spawnSubagentTool = {
      name: 'spawn_subagent',
      description: 'Delegate a task to a specialized sub-agent. The sub-agent runs independently with its own skill context and returns results.',
      parameters: {
        type: 'object' as const,
        properties: {
          role: { type: 'string' as const, description: 'Sub-agent role: test-analyst, test-designer, or quality-manager' },
          goal: { type: 'string' as const, description: 'Goal or description of the task to delegate' },
          input: { type: 'object' as const, description: 'Input data matching the sub-agent\'s input schema' },
        },
        required: ['role', 'goal', 'input'],
      } satisfies JsonSchema,
      execute: async (args: { role: string; goal: string; input: unknown }) => {
        if ((this as any)._isSubagent) {
          throw new Error('Nested sub-agent spawning is not allowed (max depth = 1)');
        }
        const subRole = roleLookup[args.role];
        if (!subRole) throw new Error(`Unknown sub-agent role: ${args.role}. Available: ${Object.keys(roleLookup).join(', ')}`);
        const subAgent = new AgentTool(subRole, this.providerFactory, this.getPromptVersion, this.getModelName);
        (subAgent as any)._isSubagent = true;
        const result = await subAgent.execute(args.input, { useReActLoop: true });
        const r = result as any;
        if (!r.success) throw new Error(`Sub-agent ${args.role} failed: ${r.error?.message ?? 'unknown error'}`);
        return r.data;
      },
    };

    const toolMap: Record<string, { execute: (args: any) => Promise<unknown>; description: string; parameters: JsonSchema }> = {
      search_skills: searchTool,
      load_skill: loadTool,
      execute_skill_module: execModuleTool,
      request_review: reviewTool,
    };
    if (allowed.includes('spawn_subagent')) {
      toolMap['spawn_subagent'] = spawnSubagentTool;
    }

    return {
      executeTool: async (call: ToolCall) => {
        const tool = toolMap[call.name];
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        return tool.execute(call.args as any);
      },
      getAgentTools: () => {
        return allowed.map(name => {
          const t = toolMap[name];
          return { name, description: t?.description ?? '', parameters: t?.parameters ?? { type: 'object', properties: {} } };
        });
      },
      isSpecialTool: (name: string) => {
        return ['search_skills', 'load_skill', 'execute_skill_module', 'request_review'].includes(name);
      },
    };
  }
}

export class FunctionTool<TInput = unknown, TOutput = unknown> implements ToolDef<TInput, TOutput> {
  readonly kind = 'function' as const;

  constructor(
    readonly name: string,
    readonly description: string,
    readonly inputSchema: JsonSchema,
    readonly outputSchema: JsonSchema,
    readonly version: string,
    private handler: (input: TInput) => Promise<TOutput>,
  ) {}

  async execute(input: TInput, _ctx: ToolContext = {}): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    try {
      const data = await this.handler(input);
      return {
        success: true,
        data,
        metadata: {
          toolName: this.name,
          latencyMs: Date.now() - startTime,
          tokenUsage: { input: 0, output: 0, reasoning: 0 },
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: resolveToolErrorCode(err),
          message: err?.message ?? String(err),
        },
      };
    }
  }
}
