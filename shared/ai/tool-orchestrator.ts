import { StateGraph, START, END, Annotation, type BaseCheckpointSaver, type CompiledStateGraph } from '@langchain/langgraph';
import type { AIProvider, ChatMessage } from './provider.ts';
import type { ToolDef, ToolContext, ToolResult, JsonSchema } from './tool.ts';
import type { AgentObserver } from './pipeline-nodes.ts';
import { createToolNode, createCheckpointNode } from './pipeline-nodes.ts';

export interface DynamicOptions {
  maxSteps?: number;
  toolContext?: ToolContext;
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  result: ToolResult;
  stepIndex: number;
}

export interface DynamicResult {
  goal: string;
  toolCalls: ToolCallRecord[];
  finalAnswer: string;
  totalSteps: number;
}

export interface PipelineConfig {
  tools: string[];
  checkpointer?: BaseCheckpointSaver;
  callbacks?: AgentObserver;
  onCheckpoint?: (cpNum: number, payload: unknown) => void;
  enableCheckpoints?: boolean;
  agentOpts?: {
    timeoutMs?: number;
    useCache?: boolean;
    signal?: AbortSignal;
    useReActLoop?: boolean;
  };
  stateAnnotation?: any;
  buildToolInput?: Record<string, (state: any) => unknown>;
  buildToolResult?: Record<string, (raw: any) => Record<string, unknown>>;
  buildCheckpointPayload?: Record<number, (state: any) => unknown>;
  buildCheckpointResolve?: Record<number, (state: any, response: any) => Record<string, unknown>>;
  buildCheckpointRetry?: Record<number, (state: any, response?: any) => Record<string, unknown>>;
  buildCheckpointRouting?: Record<number, (state: any) => string>;
  checkpointLogEnter?: Record<number, (state: any) => void>;
  checkpointLogRetry?: Record<number, () => void>;
  checkpointLogExit?: Record<number, (state: any, response: any) => void>;
  agentLogEnter?: Record<string, (state: any) => void>;
  agentLogExit?: Record<string, (raw: any) => void>;
  agentStepConfig?: Record<string, { preStep: { index: number; name: string }; postSteps: Array<{ index: number; name: string }> }>;
}

export interface PipelineStepDef {
  toolName: string;
  preStep: { index: number; name: string };
  postSteps: Array<{ index: number; name: string }>;
}

export interface CheckpointDef {
  index: number;
  buildPayload: (state: any) => unknown;
  onResolve: (state: any, response: any) => Record<string, unknown>;
  onRetry: (state: any, response?: any) => Record<string, unknown>;
  routingFn: (state: any) => string;
  logEnter?: (state: any) => void;
  logRetry?: () => void;
  logExit?: (state: any, response: any) => void;
}

export interface CompiledPipeline {
  invoke: (input: any, options?: any) => Promise<any>;
  stream: (input: any, options?: any) => AsyncGenerator<any>;
  getState: (config: any) => Promise<any>;
  updateState: (config: any, state: any) => Promise<void>;
  nodes: Record<string, any>;
}

export class ToolOrchestrator {
  constructor(
    private registry: any,
    private provider: AIProvider,
  ) {}

  pipeline(config: PipelineConfig): CompiledPipeline {
    const stateAnnotation = config.stateAnnotation ?? this.createDefaultStateAnnotation();

    const graph = new StateGraph(stateAnnotation);

    const toolNames = config.tools;
    const enableCheckpoints = config.enableCheckpoints ?? false;

    const nodeNames: string[] = [];

    for (let i = 0; i < toolNames.length; i++) {
      const toolName = toolNames[i];
      const tool = this.registry.resolve(toolName) as ToolDef | undefined;
      if (!tool) throw new Error(`Tool "${toolName}" not found in registry`);

      const nodeName = `agent_${toolName}`;
      const buildInput = config.buildToolInput?.[toolName] ?? ((state: any) => state);
      const buildResult = config.buildToolResult?.[toolName] ?? ((raw: any) => ({ [toolName]: raw }));
      const stepConfig = config.agentStepConfig?.[toolName];
      const preStep = stepConfig?.preStep ?? { index: 0, name: `Execute ${toolName}` };
      const postSteps = stepConfig?.postSteps ?? [{ index: 1, name: `Complete ${toolName}` }];

      const node = createToolNode(
        tool,
        buildInput,
        buildResult,
        preStep,
        postSteps,
        config.callbacks,
        {
          useCache: config.agentOpts?.useCache,
          useReActLoop: config.agentOpts?.useReActLoop,
        },
        config.agentOpts?.timeoutMs,
        config.agentOpts?.signal,
        config.agentLogEnter?.[toolName],
        config.agentLogExit?.[toolName],
      );

      graph.addNode(nodeName, node);
      nodeNames.push(nodeName);

      if (enableCheckpoints) {
        const cpIndex = i + 1;
        const cpName = `checkpoint_${cpIndex}`;
        const buildPayload = config.buildCheckpointPayload?.[cpIndex] ?? ((state: any) => ({ phase: toolName, retry: false }));
        const onResolve = config.buildCheckpointResolve?.[cpIndex] ?? ((state: any, response: any) => state);
        const onRetry = config.buildCheckpointRetry?.[cpIndex] ?? ((state: any, response?: any) => state);

        const cpNode = createCheckpointNode(
          buildPayload,
          onResolve,
          onRetry,
          config.checkpointLogEnter?.[cpIndex],
          config.checkpointLogRetry?.[cpIndex],
          config.checkpointLogExit?.[cpIndex],
        );

        (graph as any).addNode(cpName, cpNode);
        (graph as any).addEdge(nodeName, cpName);

        const routingFn = config.buildCheckpointRouting?.[cpIndex];
        if (routingFn) {
          (graph as any).addConditionalEdges(cpName, (state: any) => {
            const target = routingFn(state);
            return target === '__end__' ? END : target;
          });
        } else if (i < toolNames.length - 1) {
          (graph as any).addEdge(cpName, `agent_${toolNames[i + 1]}`);
        } else {
          (graph as any).addEdge(cpName, END);
        }
      }
    }

    if (!enableCheckpoints) {
      (graph as any).addEdge(START, nodeNames[0]);

      for (let i = 0; i < nodeNames.length - 1; i++) {
        (graph as any).addEdge(nodeNames[i], nodeNames[i + 1]);
      }

      (graph as any).addEdge(nodeNames[nodeNames.length - 1], END);
    } else {
      (graph as any).addEdge(START, `agent_${toolNames[0]}`);
    }

    const compiled = graph.compile({ checkpointer: config.checkpointer });

    return {
      invoke: compiled.invoke.bind(compiled),
      stream: compiled.stream.bind(compiled),
      getState: compiled.getState.bind(compiled),
      updateState: compiled.updateState.bind(compiled),
      nodes: compiled.nodes,
    };
  }

  async dynamicRun(goal: string, context: Record<string, unknown> = {}, options: DynamicOptions = {}): Promise<DynamicResult> {
    const maxSteps = options.maxSteps ?? 10;
    const toolContext = options.toolContext ?? {};

    const tools = this.registry.toOpenAIFunctions();
    const toolNames = tools.map(t => t.function.name);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a tool orchestrator. Your goal is to accomplish the following task: ${goal}

You have access to these tools: ${toolNames.join(', ')}

Use the tools to accomplish the goal. When you have enough information, provide a final answer.
Respond with JSON containing either "tool_calls" (array of {tool_name, input}) or "final_answer" (string).`,
      },
      {
        role: 'user',
        content: JSON.stringify({ goal, context }, null, 2),
      },
    ];

    const toolCalls: ToolCallRecord[] = [];
    let stepIndex = 0;
    let finalAnswer = '';

    while (stepIndex < maxSteps) {
      const response = await this.invokeOrchestratorLLM(messages, tools);

      if (response.finalAnswer) {
        finalAnswer = response.finalAnswer;
        break;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const tc of response.toolCalls) {
          const tool = this.registry.resolve(tc.toolName);
          if (!tool) {
            messages.push({
              role: 'assistant',
              content: JSON.stringify({ error: `Tool "${tc.toolName}" not found` }),
            });
            continue;
          }

          options.onToolCall?.(tc.toolName, tc.input);

          const result = await tool.execute(tc.input, toolContext);

          options.onToolResult?.(tc.toolName, result);

          toolCalls.push({
            toolName: tc.toolName,
            input: tc.input,
            result,
            stepIndex,
          });

          messages.push({
            role: 'assistant',
            content: JSON.stringify({ tool_call: tc.toolName, input: tc.input }),
          });

          if (result.success) {
            messages.push({
              role: 'user',
              content: JSON.stringify({ tool_result: result.data }),
            });
          } else {
            messages.push({
              role: 'user',
              content: JSON.stringify({ tool_error: result.error }),
            });
          }

          stepIndex++;
        }
      } else {
        break;
      }
    }

    if (!finalAnswer) {
      finalAnswer = `Completed after ${stepIndex} tool calls. See toolCalls for details.`;
    }

    return {
      goal,
      toolCalls,
      finalAnswer,
      totalSteps: stepIndex,
    };
  }

  private async invokeOrchestratorLLM(
    messages: ChatMessage[],
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: JsonSchema } }>,
  ): Promise<{ toolCalls?: Array<{ toolName: string; input: unknown }>; finalAnswer?: string }> {
    const systemMsg = messages[0];
    const toolList = tools.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');

    const orchestratorMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `${systemMsg.content}\n\nAvailable tools:\n${toolList}\n\nRespond with valid JSON only.`,
      },
      ...messages.slice(1),
    ];

    const response = await this.provider.chat(orchestratorMessages, {
      temperature: 0.1,
      responseFormat: 'json_object',
    });

    try {
      const parsed = JSON.parse(response.content);

      if (parsed.final_answer) {
        return { finalAnswer: parsed.final_answer };
      }

      if (parsed.tool_calls) {
        return {
          toolCalls: parsed.tool_calls.map((tc: any) => ({
            toolName: tc.tool_name,
            input: tc.input ?? {},
          })),
        };
      }

      return { finalAnswer: response.content };
    } catch {
      return { finalAnswer: response.content };
    }
  }

  private createDefaultStateAnnotation() {
    return Annotation.Root({
      phase: Annotation<string>,
      errors: Annotation<Array<{ phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }>>,
    });
  }
}
