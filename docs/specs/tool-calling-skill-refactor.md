# Tool-Calling Skill 重构 Spec

## 0. 术语定义

| 术语 | 当前含义 | 目标含义 |
|------|---------|---------|
| **Skill** | SKILL.md 文本文件，作为 LLM System Prompt 的知识注入 | `ToolDef` + SKILL.md — 可调用工具 + 领域知识 |
| **Agent** | AgentRole（配置）+ `runAgent()`（隐式调用） | 不变的底层 LLM 调用引擎 |
| **Tool** | 不存在 | `AgentTool(Role)` — 包装 AgentRole 为可调用工具，具备 JSON Schema 定义 |
| **Orchestrator** | LangGraph StateGraph 硬编码 6 个 Node | `ToolOrchestrator` — 从注册表中动态路由工具调用，保留 LangGraph 为执行引擎 |
| **Registry** | 不存在 | `ToolRegistry` — 工具注册/发现/版本管理 |

---

## 1. 问题陈述

### 1.1 现状

```
Orchestrator (LangGraph StateGraph)
  │ 硬编码 node_analyst → node_checkpoint1 → node_designer → ...
  │
  ├─[AgentContext] test-analyst  ── runAgent() ── LLM
  ├─[AgentContext] test-designer ── runAgent() ── LLM
  └─[AgentContext] quality-manager ── runAgent() ── LLM
```

**问题**：
- Agent 是隐式工具：`AgentRole` 只是配置，不是可发现/可调用的工具
- Skill 是死文本：`loadSkillContext()` 把 SKILL.md 注入到 system prompt，但 Skill 本身不是可执行单元
- 编排是硬编码的：`createTestGenerationPipeline()` 固定 6-node LangGraph
- 无法动态重组：新增一个 Agent 需要改 LangGraph 图定义
- 无法对外暴露：前端/外部无法发现有哪些工具可用
- 无法组合：不能临时组合 tool chain（如 `search-req → analyst` 但不跑完整 pipeline）

### 1.2 目标状态

```
ToolRegistry
  ├── 'test-analyst'   → AgentTool
  ├── 'test-designer'  → AgentTool
  ├── 'quality-manager' → AgentTool
  └── 'search-requirement' → FunctionTool (未来)

ToolOrchestrator(Registry)
  │ 模式 A：确定性编排（替代硬编码 LangGraph）
  │   pipeline = orchestrator.pipeline('test-analyst', 'test-designer', 'quality-manager')
  │   内部用 LangGraph 执行，但 node 定义从 Registry 动态生成
  │
  │ 模式 B：LLM 动态路由（高级）
  │   编排 LLM 根据任务描述，从 Registry 中选择和调用工具
  │   适合复杂 Agentic 工作流
  │
  └─[Tool] test-analyst.handle(input) ── runAgent() ── LLM
```

---

## 2. 架构设计

### 2.1 新增文件

```
shared/ai/
├── tool.ts              # ToolDef, ToolResult, AgentTool, FunctionTool
├── tool-registry.ts     # ToolRegistry
├── tool-orchestrator.ts # ToolOrchestrator + PipelineBuilder
├── tool-converter.ts    # Zod → JSON Schema
├── __tests__/
│   ├── tool.test.ts
│   ├── tool-registry.test.ts
│   └── tool-orchestrator.test.ts
```

### 2.2 修改文件

```
shared/ai/
├── roles/*.ts           # 无需修改 —— 只导出 AgentRole 不变
├── agent.ts             # 小改：增加 ToolContext 参数（可选 signal, cache, timeout）
├── pipeline-nodes.ts    # 小改：createAgentNode 接受 ToolDef 代替 AgentContext
├── skill-loader.ts      # 不改 —— Skill 文本加载保持不变
├── skill-cache.ts       # 不改

shared/ai-test-gen/
├── test-generation.ts   # 重构：从硬编码图 → 使用 ToolOrchestrator.pipeline() 生成图

server/modules/ai-test-gen/
├── application/test-gen-service.ts  # 重构：从手动 createAgentContext → ToolOrchestrator
├── application/test-gen-session.ts  # 不改 —— 只管理 LangGraph 流
```

### 2.3 核心类型

```typescript
// ====== shared/ai/tool.ts ======

import type { ZodType } from 'zod';

/**
 * JSON Schema 表示（兼容 OpenAI Function Calling / Anthropic Tool Use）
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  description?: string;
  [key: string]: unknown;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
  /** 中止信号 —— 传入 Agent 内部用于取消 LLM 调用 */
  signal?: AbortSignal;
  /** 是否使用 Agent 缓存，默认 true */
  useCache?: boolean;
  /** 超时时间 ms，默认 60000 */
  timeoutMs?: number;
  /** Prompt 版本（用于缓存 key），默认从 skillCache 计算 */
  promptVersion?: string;
  /** 模型名称（用于缓存 key） */
  modelName?: string;
  /** Token 限制 */
  tokenLimit?: number | null;
  /** 进度回调 */
  onStep?: (stepIndex: number, stepName: string) => void;
  onThinking?: (text: string) => void;
}

/**
 * 统一的工具调用结果
 * 对标 Rust Result / FP Either 模式
 */
export type ToolResult<T = unknown> =
  | { success: true; data: T; metadata: ToolMetadata }
  | { success: false; error: ToolError };

export interface ToolMetadata {
  /** 工具名称 */
  toolName: string;
  /** 延迟 ms */
  latencyMs: number;
  /** Token 用量 */
  tokenUsage: { input: number; output: number; reasoning: number };
}

export interface ToolError {
  code: 'VALIDATION_ERROR' | 'TIMEOUT' | 'ABORTED' | 'PROVIDER_ERROR' | 'UNKNOWN';
  message: string;
  /** 可选的解析后的 Zod 错误详情 */
  details?: unknown;
}

/**
 * 工具定义 —— 核心抽象
 */
export interface ToolDef<TInput = unknown, TOutput = unknown> {
  /** 唯一工具名（如 'test-analyst'） */
  readonly name: string;
  /** 人类可读描述（用于 LLM function calling 的 description 字段） */
  readonly description: string;
  /** 输入 JSON Schema（从 Zod Schema 转换） */
  readonly inputSchema: JsonSchema;
  /** 输出 JSON Schema（从 Zod Schema 转换） */
  readonly outputSchema: JsonSchema;
  /** 工具版本（默认从 skill 文件 hash 计算） */
  readonly version: string;
  /** 是否为 Agent 型工具（调用 LLM） */
  readonly kind: 'agent' | 'function';
  /** 执行工具 */
  execute(input: TInput, ctx?: ToolContext): Promise<ToolResult<TOutput>>;
}
```

### 2.4 AgentTool 实现

```typescript
// 把现有的 AgentRole 包装为可调用工具
class AgentTool<TInput, TOutput> implements ToolDef<TInput, TOutput> {
  readonly kind = 'agent';

  constructor(
    private role: AgentRole,
    private providerFactory: () => AIProvider,
    private getPromptVersion: () => string,
    private getModelName: () => string,
  ) {}

  get name() { return this.role.name; }
  get version() { return this.getPromptVersion(); }

  get description(): string {
    // 从 systemPromptTemplate 中提取第一句可读描述
    const firstLine = this.role.systemPromptTemplate
      .split('\n')
      .find(l => l.trim() && !l.startsWith('#') && !l.startsWith('`'))
      ?? '';
    return firstLine.trim();
  }

  get inputSchema() {
    return zodToJsonSchema(this.role.inputSchema);
  }

  get outputSchema() {
    return zodToJsonSchema(this.role.outputSchema);
  }

  async execute(input: TInput, ctx: ToolContext = {}): Promise<ToolResult<TOutput>> {
    const provider = this.providerFactory();
    const agentCtx = createAgentContext(provider, this.role, {
      promptVersion: ctx.promptVersion ?? this.getPromptVersion(),
      modelName: ctx.modelName ?? this.getModelName(),
      tokenLimit: ctx.tokenLimit,
    });

    const startTime = Date.now();
    try {
      const { result, latencyMs, tokenUsage } = await runAgent(agentCtx, input, {
        timeoutMs: ctx.timeoutMs,
        useCache: ctx.useCache ?? true,
        signal: ctx.signal,
        onStep: ctx.onStep,
        onThinking: ctx.onThinking,
      });
      return {
        success: true,
        data: result as TOutput,
        metadata: {
          toolName: this.name,
          latencyMs,
          tokenUsage,
        },
      };
    } catch (err: any) {
      const code = resolveToolErrorCode(err);
      return {
        success: false,
        error: {
          code,
          message: err.message ?? String(err),
          details: (err as any).issues,
        },
      };
    }
  }
}
```

### 2.5 ToolRegistry

```typescript
class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void;
  resolve(name: string): ToolDef | undefined;
  list(): ToolDef[];
  /** 返回符合 OpenAI Function Calling 格式的工具列表 */
  toOpenAIFunctions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: JsonSchema } }>;

  /** 获取当前所有工具的版本 hash */
  computeVersion(): string;
}
```

### 2.6 ToolOrchestrator

```typescript
class ToolOrchestrator {
  constructor(
    private registry: ToolRegistry,
    private provider: AIProvider,
  ) {}

  /**
   * 确定性流水线：按给定顺序串行调用工具。
   * 内部使用 LangGraph 管理状态流转和 checkpoint。
   */
  pipeline(config: PipelineConfig): CompiledPipeline;

  /**
   * 动态编排：交给编排 LLM 根据目标描述决定调用哪些工具。
   * 编排 LLM 输出 tool_calls，由 this 执行并收集结果。
   */
  async dynamicRun(goal: string, context: Record<string, unknown>, options?: DynamicOptions): Promise<DynamicResult>;
}

interface PipelineConfig {
  tools: string[];  // ['test-analyst', 'test-designer', 'quality-manager']
  checkpointer?: BaseCheckpointSaver;
  callbacks?: AgentObserver;
  onCheckpoint?: (cpNum: number, payload: unknown) => void;
}
```

### 2.7 Pipeline 节点自动生成

```typescript
// 替代现有硬编码：
// createTestGenerationPipeline() 变为：

async function createPipeline(registry: ToolRegistry, config: PipelineConfig) {
  const graph = new StateGraph(PipelineStateAnnotation);

  for (let i = 0; i < config.tools.length; i++) {
    const toolName = config.tools[i];
    const tool = registry.resolve(toolName);
    if (!tool) throw new Error(`Tool "${toolName}" not found in registry`);

    // 自动根据 tool 的 name / description 注册入图
    const nodeName = `agent_${toolName}`;
    graph.addNode(nodeName, createDynamicAgentNode(tool, /*...*/));

    // 可选 checkpoint
    if (config.enableCheckpoints) {
      const cpName = `checkpoint_${i + 1}`;
      graph.addNode(cpName, createCheckpointNode(/*...*/));
      graph.addEdge(nodeName, cpName);
      graph.addConditionalEdges(cpName, /* phase routing */);
    }
  }

  return graph.compile({ checkpointer: config.checkpointer });
}
```

---

## 3. 实施 Plan

### Phase 1: Tool 抽象层（Day 1-2）

**目标**：创建 `ToolDef` 接口和 `AgentTool` 实现，不改变任何现有行为。

**文件**：

| 文件 | 操作 | 内容 |
|------|------|------|
| `shared/ai/tool-converter.ts` | **新增** | `zodToJsonSchema()` 转换函数 + JSON Schema 类型定义 |
| `shared/ai/tool.ts` | **新增** | `ToolDef`, `ToolContext`, `ToolResult`, `AgentTool`, `resolveToolErrorCode()` |
| `shared/ai/tool-registry.ts` | **新增** | `ToolRegistry` 类 |
| `shared/ai/__tests__/tool-converter.test.ts` | **新增** | 测试 Zod → JSON Schema 转换 |
| `shared/ai/__tests__/tool.test.ts` | **新增** | `AgentTool.execute()` 等价于 `runAgent()`；ToolResult 格式正确；错误码正确 |
| `shared/ai/__tests__/tool-registry.test.ts` | **新增** | 注册/发现/list/toOpenAIFunctions/computeVersion |

**验证标准**：
```
✓ AgentTool.execute(input) 返回结果与 runAgent(ctx, input) 等价
✓ ToolRegistry.resolve('test-analyst').inputSchema 是合法 JSON Schema
✓ ToolRegistry.toOpenAIFunctions() 返回符合 OpenAI Function Calling 格式
```

### Phase 2: ToolOrchestrator — 确定性流水线（Day 3-4）

**目标**：用 `ToolOrchestrator.pipeline()` 替代 `createTestGenerationPipeline()` 的硬编码图。

**文件**：

| 文件 | 操作 | 内容 |
|------|------|------|
| `shared/ai/tool-orchestrator.ts` | **新增** | `ToolOrchestrator`, `PipelineConfig`, `createPipeline()` |
| `shared/ai-test-gen/test-generation.ts` | **重构** | 保留函数签名（向后兼容），内部调用 `ToolOrchestrator.pipeline()` |
| `shared/ai/__tests__/tool-orchestrator.test.ts` | **新增** | Pipeline 编译；6 节点注册；向后兼容性 |

**验证标准**：
```
✓ createTestGenerationPipeline(provider, roles) 调用方式不变
✓ 生成的图仍包含 6 个节点
✓ 现有 pipeline.test.ts 测试仍通过
✓ 可以通过 PipelineConfig 自定义工具链顺序
```

### Phase 3: 注册表集成到 TestGenService（Day 4-5）

**目标**：`TestGenService` 通过 `ToolRegistry` 发现和调用工具，而非手动 `createAgentContext`。

**文件**：

| 文件 | 操作 | 内容 |
|------|------|------|
| `server/modules/ai-test-gen/application/test-gen-service.ts` | **重构** | 传入 `ToolRegistry + ToolOrchestrator` 替代手动 context 构建 |
| `shared/ai/roles/index.ts` | **不改** | 仍导出 `TestAnalystRole` 等 |
| `server/modules/ai-test-gen/application/test-gen-session.ts` | **不改** | Session 只管理 LangGraph 流 |
| `server/modules/ai-test-gen/application/phase-machine.ts` | **不改** | Phase 逻辑与 Tool 解耦 |

**验证标准**：
```
✓ 现有 server 侧测试全通过（test-gen-service.test.ts 等）
✓ 可以热注册新工具（在运行时向 Registry 添加工具）
```

### Phase 4: LLM 动态编排（Day 6-7，可选）

**目标**：`ToolOrchestrator.dynamicRun()` — 编排 LLM 自行决定工具调用链。

**文件**：

| 文件 | 操作 | 内容 |
|------|------|------|
| `shared/ai/tool-orchestrator.ts` | **扩展** | `dynamicRun()` 方法 — 编排 LLM 调用注册表工具 |
| `shared/ai/__tests__/tool-orchestrator.test.ts` | **新增测试** | Mock 编排 LLM 的 function calling 行为 |

**验证标准**：
```
✓ 编排 LLM 收到 ToolRegistry 中的工具定义
✓ 编排 LLM 的 tool_calls 被正确拦截和执行
✓ 编排结果 = 串行调用 3 个工具的结果合并
```

---

## 4. 向后兼容性保证

### 4.1 不变的接口

| 接口 | 保证 |
|------|------|
| `AgentRole` | 不修改任何字段 |
| `runAgent(ctx, input, opts)` | 签名不变 —— `Tool.execute()` 内部调用它 |
| `loadSkillContext(skillNames)` | 不变 |
| `createTestGenerationPipeline(provider, roles, callbacks, opts, checkpointer)` | 签名不变 —— 内部改用 `ToolOrchestrator` |
| 所有 Zod Schema（`BatchAnalystInputSchema` 等） | 不变 |
| 所有 Skill SKILL.md 文件 | 不变 |
| Express 路由 | 不变 |
| SSE 事件格式 | 不变 |

### 4.2 渐进式迁移

```
Step 1: 新增文件（不改变任何现有行为）
Step 2: 在 createTestGenerationPipeline 内部切换为 ToolOrchestrator（行为等价）
Step 3: 在 TestGenService 中引入 ToolRegistry（可选，不改默认行为）
Step 4: 暴露 ToolRegistry to REST API（可选）
```

任何一步都可以回退，不影响现有功能。

---

## 5. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| LangGraph compile 行为差异 | 低 | 高 | Phase 2 保留原函数签名，只重构内部实现，用现有 pipeline.test.ts 回归 |
| Zod → JSON Schema 转换不完整 | 中 | 低 | `zod-to-json-schema` 包成熟，手动补充边界类型（enum/catch 等） |
| Tool 版本冲突 | 低 | 中 | Tool.version = promptVersion（与现有缓存 key 一致），不引入新版本机制 |
| 动态编排 LLM 不稳定 | 高 | 中 | Phase 4 作为可选功能，确定性 Pipeline 模式为主力 |
| 测试覆盖缺口 | 低 | 中 | 每个 Phase 有对应的新测试文件，不删除任何现有测试 |

---

## 6. 业界对标总结

| 特性 | OpenAI Function Calling | Anthropic Tool Use | MCP | 本方案 |
|------|------------------------|-------------------|-----|--------|
| JSON Schema 输入 | tool.function.parameters | input_schema | tools/list | ToolDef.inputSchema |
| 工具发现 | 手动传入 | 手动传入 | tools/list RPC | ToolRegistry.list() |
| 版本化 | 无标准方式 | 无 | server version | ToolDef.version + Registry.computeVersion() |
| 错误标准化 | 无 | 无 | error code + message | ToolResult<T> discriminant union |
| 流式输出 | partial tool_calls | stream | 可选 | runAgent 内部已有 streamAgent |
| 组合性 | 无 | 无 | 无 | PipelineConfig + dynamicRun() |

本方案在 OpenAI/Anthropic 的 Function Calling 基础上额外增加了：
- **Registry 模式**：统一管理+发现
- **Result 模式**：success/error discriminant union，避免异常吞噬
- **版本化**：每个 tool 有 version，与现有的 prompt version 体系一致
- **确定+动态双模式**：Pipeline（确定）和 dynamicRun（LLM 自决定）