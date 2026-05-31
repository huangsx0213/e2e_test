import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolOrchestrator } from '../tool-orchestrator.ts';
import { ToolRegistry } from '../tool-registry.ts';
import { AgentTool, FunctionTool } from '../tool.ts';
import type { AIProvider } from '../provider.ts';
import type { AgentRole } from '../agent.ts';
import { z } from 'zod';

function createMockProvider(): AIProvider {
  return {
    getModelName: () => 'test-model',
    streamChat: vi.fn().mockImplementation(async function* () {
      yield { content: '{"result": "ok"}', usage: { prompt_tokens: 10, completion_tokens: 5 } };
    }),
  } as unknown as AIProvider;
}

function createMockRole(): AgentRole {
  return {
    name: 'test_role',
    systemPromptTemplate: 'You are a test agent',
    requiredSkills: [],
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  };
}

describe('ToolOrchestrator', () => {
  let registry: ToolRegistry;
  let provider: AIProvider;
  let orchestrator: ToolOrchestrator;

  beforeEach(() => {
    registry = new ToolRegistry();
    provider = createMockProvider();
    orchestrator = new ToolOrchestrator(registry, provider);
  });

  describe('pipeline', () => {
    it('throws when tool not found in registry', () => {
      expect(() => orchestrator.pipeline({ tools: ['nonexistent'] })).toThrow('Tool "nonexistent" not found in registry');
    });

    it('creates pipeline with function tool', () => {
      const fnTool = new FunctionTool(
        'test_function',
        'Test function tool',
        { type: 'object', properties: { input: { type: 'string' } } },
        { type: 'object', properties: { output: { type: 'string' } } },
        'v1',
        async (input: any) => ({ output: 'ok' }),
      );
      registry.register(fnTool);

      const pipeline = orchestrator.pipeline({ tools: ['test_function'] });

      expect(pipeline).toHaveProperty('invoke');
      expect(pipeline).toHaveProperty('nodes');
    });

    it('creates pipeline with single agent tool', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(
        role,
        () => provider,
        () => 'v1',
        () => 'test-model',
      );
      registry.register(agentTool);

      const pipeline = orchestrator.pipeline({ tools: ['test_role'] });

      expect(pipeline).toHaveProperty('invoke');
      expect(pipeline).toHaveProperty('stream');
      expect(pipeline).toHaveProperty('getState');
      expect(pipeline).toHaveProperty('updateState');
      expect(pipeline).toHaveProperty('nodes');
    });

    it('creates pipeline with multiple agent tools', () => {
      const role1 = { ...createMockRole(), name: 'role_1' };
      const role2 = { ...createMockRole(), name: 'role_2' };

      const agentTool1 = new AgentTool(role1, () => provider, () => 'v1', () => 'test-model');
      const agentTool2 = new AgentTool(role2, () => provider, () => 'v1', () => 'test-model');

      registry.register(agentTool1);
      registry.register(agentTool2);

      const pipeline = orchestrator.pipeline({ tools: ['role_1', 'role_2'] });

      expect(pipeline).toHaveProperty('invoke');
      expect(pipeline).toHaveProperty('nodes');
    });

    it('accepts custom stateAnnotation', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const customState = {
        phase: () => 'idle',
        data: () => null,
      };

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        stateAnnotation: customState,
      });

      expect(pipeline).toBeDefined();
    });

    it('accepts checkpointer option', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const mockCheckpointer = {
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
      };

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        checkpointer: mockCheckpointer as any,
      });

      expect(pipeline).toBeDefined();
    });

    it('accepts callbacks option', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const callbacks = {
        onStart: vi.fn(),
        onComplete: vi.fn(),
      };

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        callbacks,
      });

      expect(pipeline).toBeDefined();
    });

    it('accepts agentOpts', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        agentOpts: {
          timeoutMs: 5000,
          useCache: false,
        },
      });

      expect(pipeline).toBeDefined();
    });

    it('accepts buildToolInput and buildToolResult', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        buildToolInput: {
          'test_role': (state) => ({ query: state.query }),
        },
        buildToolResult: {
          'test_role': (raw) => ({ result: raw }),
        },
      });

      expect(pipeline).toBeDefined();
    });

    it('accepts logging callbacks', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        agentLogEnter: { 'test_role': vi.fn() },
        agentLogExit: { 'test_role': vi.fn() },
      });

      expect(pipeline).toBeDefined();
    });

    it('creates pipeline with checkpoints enabled', () => {
      const role = createMockRole();
      const agentTool = new AgentTool(role, () => provider, () => 'v1', () => 'test-model');
      registry.register(agentTool);

      const mockCheckpointer = {
        put: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
      };

      const pipeline = orchestrator.pipeline({
        tools: ['test_role'],
        enableCheckpoints: true,
        checkpointer: mockCheckpointer as any,
      });

      expect(pipeline).toBeDefined();
      expect(pipeline).toHaveProperty('nodes');
    });

    it('creates pipeline with multiple tools and checkpoints', () => {
      const role1 = { ...createMockRole(), name: 'role_1' };
      const role2 = { ...createMockRole(), name: 'role_2' };

      const agentTool1 = new AgentTool(role1, () => provider, () => 'v1', () => 'test-model');
      const agentTool2 = new AgentTool(role2, () => provider, () => 'v1', () => 'test-model');

      registry.register(agentTool1);
      registry.register(agentTool2);

      const pipeline = orchestrator.pipeline({
        tools: ['role_1', 'role_2'],
        enableCheckpoints: true,
      });

      expect(pipeline).toBeDefined();
    });
  });

  describe('dynamicRun', () => {
    function createOrchestratorProvider(responses: string[]): AIProvider {
      let callIndex = 0;
      return {
        getModelName: () => 'test-model',
        chat: vi.fn().mockImplementation(async () => {
          const response = responses[callIndex] ?? responses[responses.length - 1];
          callIndex++;
          return { content: response };
        }),
        streamChat: vi.fn().mockImplementation(async function* () {
          for (const r of responses) {
            yield { content: r };
          }
        }),
      } as unknown as AIProvider;
    }

    it('returns final answer when orchestrator responds with final_answer', async () => {
      const orchestratorProvider = createOrchestratorProvider(['{"final_answer": "Task completed"}']);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Analyze requirements');

      expect(result.goal).toBe('Analyze requirements');
      expect(result.finalAnswer).toBe('Task completed');
      expect(result.toolCalls).toEqual([]);
      expect(result.totalSteps).toBe(0);
    });

    it('executes tool calls when orchestrator responds with tool_calls', async () => {
      const fnTool = new FunctionTool(
        'search',
        'Search for data',
        { type: 'object', properties: { query: { type: 'string' } } },
        { type: 'object', properties: { results: { type: 'array' } } },
        'v1',
        async (input: { query: string }) => ({ results: [`Result for: ${input.query}`] }),
      );
      registry.register(fnTool);

      const orchestratorProvider = createOrchestratorProvider([
        '{"tool_calls": [{"tool_name": "search", "input": {"query": "test"}}]}',
        '{"final_answer": "Search completed"}',
      ]);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Search for test data');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolName).toBe('search');
      expect(result.toolCalls[0].result.success).toBe(true);
      expect(result.totalSteps).toBe(1);
    });

    it('respects maxSteps limit', async () => {
      let callCount = 0;
      const orchestratorProvider: AIProvider = {
        getModelName: () => 'test-model',
        chat: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount <= 3) {
            return { content: '{"tool_calls": [{"tool_name": "echo", "input": {}}]}' };
          }
          return { content: '{"final_answer": "Done"}' };
        }),
        streamChat: vi.fn().mockImplementation(async function* () {
          yield { content: '{"final_answer": "Done"}' };
        }),
      } as unknown as AIProvider;

      const fnTool = new FunctionTool(
        'echo',
        'Echo input',
        { type: 'object' },
        { type: 'object' },
        'v1',
        async () => ({ echoed: true }),
      );
      registry.register(fnTool);

      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Echo test', {}, { maxSteps: 3 });

      expect(result.totalSteps).toBe(3);
    });

    it('calls onToolCall and onToolResult callbacks', async () => {
      const onToolCall = vi.fn();
      const onToolResult = vi.fn();

      const fnTool = new FunctionTool(
        'greet',
        'Greet someone',
        { type: 'object', properties: { name: { type: 'string' } } },
        { type: 'object', properties: { greeting: { type: 'string' } } },
        'v1',
        async (input: { name: string }) => ({ greeting: `Hello, ${input.name}!` }),
      );
      registry.register(fnTool);

      const orchestratorProvider = createOrchestratorProvider([
        '{"tool_calls": [{"tool_name": "greet", "input": {"name": "World"}}]}',
        '{"final_answer": "Greeting sent"}',
      ]);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      await orchestrator.dynamicRun('Greet the world', {}, {
        onToolCall,
        onToolResult,
      });

      expect(onToolCall).toHaveBeenCalledWith('greet', { name: 'World' });
      expect(onToolResult).toHaveBeenCalled();
      expect(onToolResult.mock.calls[0][1].success).toBe(true);
    });

    it('handles tool not found gracefully', async () => {
      const orchestratorProvider = createOrchestratorProvider([
        '{"tool_calls": [{"tool_name": "nonexistent", "input": {}}]}',
        '{"final_answer": "Tool not found"}',
      ]);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Call nonexistent tool');

      expect(result.toolCalls).toHaveLength(0);
      expect(result.finalAnswer).toBe('Tool not found');
    });

    it('handles tool execution failure', async () => {
      const failingTool = new FunctionTool(
        'fail-tool',
        'Always fails',
        { type: 'object' },
        { type: 'object' },
        'v1',
        async () => { throw new Error('Tool failure'); },
      );
      registry.register(failingTool);

      const orchestratorProvider = createOrchestratorProvider([
        '{"tool_calls": [{"tool_name": "fail-tool", "input": {}}]}',
        '{"final_answer": "Tool failed"}',
      ]);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Test failure handling');

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].result.success).toBe(false);
      const toolResult = result.toolCalls[0].result as { success: false; error: { code: string; message: string; details?: unknown } };
      expect(toolResult.error.message).toContain('Tool failure');
    });

    it('passes tool context to tool execution', async () => {
      const toolContext = { useCache: false, timeoutMs: 5000 };

      const fnTool = new FunctionTool(
        'context-tool',
        'Uses context',
        { type: 'object' },
        { type: 'object' },
        'v1',
        async () => ({ ok: true }),
      );
      registry.register(fnTool);

      const orchestratorProvider = createOrchestratorProvider([
        '{"tool_calls": [{"tool_name": "context-tool", "input": {}}]}',
        '{"final_answer": "Context used"}',
      ]);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Test context', {}, {
        toolContext,
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].result.success).toBe(true);
    });

    it('stops when orchestrator returns empty response', async () => {
      const orchestratorProvider = createOrchestratorProvider(['{}']);
      const orchestrator = new ToolOrchestrator(registry, orchestratorProvider);

      const result = await orchestrator.dynamicRun('Empty response test');

      expect(result.totalSteps).toBe(0);
      expect(result.finalAnswer).toBe('{}');
    });
  });
});
