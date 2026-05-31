# Interpreter Skill + 渐进式发现 架构设计

## 0. 术语

| 术语 | 定义 |
|------|------|
| **Progressive Disclosure** | Agent 启动时只加载 skill 元数据（名称+描述），按需通过 `load_skill` 加载完整内容 |
| **ReAct Loop** | Agent 内部的多轮推理-行动-观察循环，可调用工具后再继续推理 |
| **Interpreter Skill** | 包含 `index.ts` 可执行模块的 skill，确定性逻辑由代码保证 |
| **SkillRegistry** | 扫描 skills/ 目录、解析 YAML frontmatter、提供搜索和按需加载 |
| **ToolRegistry** | 管理 ToolDef 的注册和发现（已有），供给 ReAct Loop 调用 |
| **Mode A** | 确定性 Pipeline：3 Agent 串行 + Checkpoint，每个 Agent 内部 ReAct |
| **Mode B** | 自主 Orchestrator：单个编排 Agent + subagent + 全量 skill 发现 |

## 1. 最终架构

```
┌─────────────────────────────────────────────────────┐
│                    Mode A (Pipeline)                  │
│  Analyst(ReactLoop) → Checkpoint →                    │
│  Designer(ReactLoop) → Checkpoint →                   │
│  QualityManager(ReactLoop) → Checkpoint → Done        │
├─────────────────────────────────────────────────────┤
│                    Mode B (Autonomous)                 │
│  OrchestratorAgent(ReactLoop)                          │
│    ├── search_skills → load_skill                      │
│    ├── spawn_subagent("test-analyst", goal)            │
│    ├── spawn_subagent("test-designer", goal)           │
│    ├── spawn_subagent("quality-manager", goal)         │
│    └── request_review(phase, data) → interrupt         │
└─────────────────────────────────────────────────────┘
```

## 2. Skill 格式

### 目录结构
```
skills/<name>/
  SKILL.md          # YAML frontmatter + 指令
  index.ts          # 可选，可执行模块
  references/       # 可选，参考文件
```

### SKILL.md 格式
```yaml
---
name: requirement-query
description: Progressively load and filter requirements from the project index
tags: [requirements, query, retrieval]
module: ./index.ts
allowedTools: [query_requirements]
---
使用此 skill 查询和过滤需求。
先调用 getIndex() 获取索引概览，再通过 queryRequirements() 按条件过滤。
```

### SkillRegistry（合并 skill-discovery.ts）
```typescript
class SkillRegistry {
  search(query: string): SkillMetadata[]
  getMetadata(name: string): SkillMetadata
  loadContent(name: string): Promise<string>
  loadModule(name: string): Promise<{ createService?: (deps: any) => any; [key: string]: any }>
  listByTag(tag: string): SkillMetadata[]
  getAllMetadata(): SkillMetadata[]
}
```

## 3. AIProvider 扩展：Tool Calling 支持

### ChatResponse 扩展
```typescript
export interface ToolCall {
  name: string;
  args: unknown;
  id: string;           // 用于关联 tool result
}

export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];     // 新增
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}
```

### ChatOptions 扩展
```typescript
export interface ChatOptions {
  // ...现有字段（temperature, maxTokens, timeoutMs, signal, etc.）
  tools?: Array<{
    name: string;
    description: string;
    parameters: JsonSchema;
  }>;     // 新增：ReAct Loop 传入的可用工具列表
}
```

### streamChat 扩展
```typescript
export interface StreamChunk {
  type: 'content' | 'reasoning' | 'done' | 'error' | 'tool_call_start' | 'tool_call_end';
  content?: string;
  toolCall?: ToolCall;    // tool_call_start 时附带
  toolResult?: unknown;   // tool_call_end 时附带
}
```

`streamReactLoop` 通过 `onThinking` 推送 tool call 进展：
- `tool_call_start` → `onThinking("[Calling tool: name]")`
- `tool_call_end` → `onThinking("[Tool result: ...]")`

## 4. ReAct Loop

### 位置
`runAgent()` 内部，通过 `AgentRunOptions.useReActLoop` 标志切换。
`AgentTool.execute()` 不变，仍然是薄适配层。

### AgentContext 扩展（无变化）

`useReActLoop` 不再属于 `AgentContext`——它仅作为 `AgentRunOptions` 传递给 `runAgent()`。`AgentContext` 接口无需新增字段，但 `AgentRole` 接口需新增 `useProgressiveDisclosure?: boolean`：

```typescript
// 以下为简化示意，字段名以 agent.ts 中 AgentRole 为准
interface AgentRole {
  name: string;
  systemPromptTemplate: string;     // 代码中为 systemPromptTemplate
  requiredSkills: string[];         // 代码中为必填
  inputSchema: ZodType;             // 代码中为必填
  outputSchema: ZodType;            // 代码中为必填
  options?: ChatOptions;
  useProgressiveDisclosure?: boolean;   // 新增：声明 skill 加载策略
}
```

### createAgentContext 分支逻辑（G1 关键修改）

当前 `createAgentContext()` 无条件调用 `loadSkillContext(role.requiredSkills)` 全量加载 SKILL.md。Progressive Disclosure 模式下需分支。

**关键设计决策**：`useReActLoop` 仅控制 `runAgent()` 是否进入 ReAct 循环，**不控制 skill 加载方式**。skill 加载策略由 `AgentRole.useProgressiveDisclosure` 声明式控制：

```typescript
// AgentRole 类型新增字段
interface AgentRole {
  // ...原有
  useProgressiveDisclosure?: boolean;   // true = 渐进式加载，false = 全量加载（默认）
}
```

```typescript
export function createAgentContext(provider, role, opts?: {
  promptVersion?: string;
  modelName?: string;
  tokenLimit?: number | null;
}): AgentContext {
  const useProgressiveDisclosure = role.useProgressiveDisclosure ?? false;

  let skillContext: SkillContext;
  if (useProgressiveDisclosure) {
    // 渐进式发现：只加载元数据，不加载 SKILL.md 全文
    const allMetadata = SkillRegistry.getAllMetadata();
    skillContext = {
      systemPrompt: `Available skills:\n${
        allMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n')
      }`,
      skillContents: {},        // 不预加载
      cachedSkillContents: {},
    };
  } else {
    // 原有逻辑：全量加载
    skillContext = loadSkillContext(role.requiredSkills);
  }

  return {
    provider,
    role,
    skillContext,
    tokenTracker: new TokenTracker(),
    promptVersion: opts?.promptVersion ?? 'default',
    modelName: opts?.modelName ?? 'default',
    tokenLimit: opts?.tokenLimit ?? null,
  };
}
```

`AgentTool.execute()` 中两个维度独立传递：

```typescript
// AgentTool.execute 内部
const agentCtx = createAgentContext(provider, role, { promptVersion, modelName, tokenLimit });
// useProgressiveDisclosure 由 role 自身声明，createAgentContext 自动判断
// useReActLoop 独立控制 runAgent 的循环行为
return runAgent(agentCtx, input, { useReActLoop: ctx?.useReActLoop ?? false });
```

| 模式 | `AgentRole.useProgressiveDisclosure` | `AgentRunOptions.useReActLoop` | 效果 |
|------|--------------------------------------|-------------------------------|------|
| Mode A Analyst/Designer/QualityManager | `false` (默认) | `true` | 全量加载 skill → ReAct 循环（仅 `execute_skill_module`） |
| Mode B Orchestrator | `true` | `true` | 元数据加载 → ReAct 循环（全工具集） |

### ReactLoopState（独立文件 react-loop-state.ts）

复用 `tool-orchestrator.ts` 中的 `ToolCallRecord`：

```typescript
// 现有类型（来自 tool-orchestrator.ts，不变）
export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  result: ToolResult;    // { success: true, data } | { success: false, error }
  stepIndex: number;
}

// 新增
interface ReactLoopState {
  messages: ChatMessage[];
  loadedSkills: Set<string>;           // 运行时用 Set（去重）
  iteration: number;
  toolHistory: ToolCallRecord[];       // 复用现有类型，按 toolName/input/stepIndex 填充
  totalTokenUsage: { input: number; output: number; reasoning: number };
}

// 序列化版本（跨进程/flush 传递时用 Array 替代 Set）
interface SerializedReactLoopState {
  loadedSkills: string[];              // Set → Array 序列化
  toolHistory: ToolCallRecord[];
  totalTokenUsage: { input: number; output: number; reasoning: number };
  iteration: number;
}
```

### 流程

#### G2 冲突 1：`response_format: json_object` 与 tool calling 不兼容

当前 `runAgent()` 硬编码 `responseFormat: 'json_object'`。OpenAI API 在 `tools` 和 `json_object` 同时传入时行为不可靠。**ReAct 模式下必须跳过 `json_object`**：

```typescript
// runAgent() 内部，ReAct 模式
const chatOptions = useReActLoop
  ? { ...role.options, tools: agentTools, signal }       // 无 responseFormat
  : { ...role.options, responseFormat: 'json_object', signal };  // 原有逻辑
```

#### G2 冲突 2：ReAct 模式输出验证断开

当前验证链 `LLM 文本 → JSON.parse → role.outputSchema.parse → validated` 在 ReAct 模式下断裂——最终响应是自然语言总结而非 JSON。ReAct 模式改用宽松验证：

```typescript
// ReAct 模式：LLM 最终响应保留原始文本，不做 JSON.parse + outputSchema.parse
// 如需结构化，由 `execute_skill_module` 工具在确定性代码中完成
function extractFinalResult(state: ReactLoopState): unknown {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg.role === 'assistant') {
    return lastMsg.content;     // 原始文本
  }
  return state.messages.filter(m => m.role === 'assistant').pop()?.content ?? '';
}
```

#### G2 冲突 3：HTTP 层需解析 tool_calls

当前 `parseChatResponse()` 和 `readSSEStream()` 完全忽略 `msg.tool_calls`。[provider.ts](file:///e:/Projects/e2e_test/shared/ai/provider.ts) 需新增：

```typescript
// parseChatResponse 新增 tool_calls 提取
function parseChatResponse(data: any): ChatResponse {
  const msg = data.choices[0].message;
  const toolCalls = msg.tool_calls?.map((tc: any) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
    id: tc.id,
  }));
  return {
    content: msg.content,
    reasoningContent: msg.reasoning_content,
    toolCalls,                              // 新增
    usage: { promptTokens, completionTokens, reasoningTokens },
  };
}

// readSSEStream 新增 delta.tool_calls 处理
function readSSEStream(response): AsyncGenerator<StreamChunk> {
  let currentToolCall: { id: string; name: string; args: string } | null = null;
  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          currentToolCall = { id: tc.id, name: tc.function.name, args: '' };
          yield { type: 'tool_call_start', toolCall: { id: tc.id, name: tc.function.name, args: {} } };
        }
        if (tc.function?.arguments) {
          currentToolCall!.args += tc.function.arguments;
        }
      }
    }
    // ...原有 content/reasoning_content 处理
  }
  // 流结束时，如果 currentToolCall 完整，产出完整 toolCall
  if (currentToolCall) {
    yield { type: 'tool_call_end', toolCall: { ...currentToolCall, args: JSON.parse(currentToolCall.args) } };
  }
}
```

#### 流程
```
runAgent(context, input, { useReActLoop: true }):
  metadataPrompt = "Available skills: [{name}, {description}, ...]"
  state = new ReactLoopState(systemPrompt(metadataPrompt), userInput)

  for state.iteration in 1..maxIterations(15):
    // G2-1: ReAct 模式不传 responseFormat
    llmOptions = { ...context.role.options, tools: agentTools, signal: context.signal }
    response = context.provider.chat(state.messages, llmOptions)
    // 每次 LLM 调用后检查 token 预算（无论是否有 tool_calls）
    state.totalTokenUsage = accumulate(state.totalTokenUsage, response.usage)
    checkTokenBudget(state.totalTokenUsage, context.tokenLimit)

    if response has tool_calls:
      for each call:
        if call.name == "load_skill":
          content = SkillRegistry.loadContent(call.args.name)
          // 作为 user 消息注入（Chat API 不支持中途改 system prompt）
          state.messages.push({
            role: 'user',
            content: `[Skill Loaded: ${call.args.name}]\n${content}`
          })
          state.loadedSkills.add(call.args.name)
        elif call.name == "request_review":
          // 返回特殊标记，ReAct Loop 停止，由 LangGraph 节点调用 interrupt()
          state.requestedReview = call.args
          break loop
        else:
          result = executeTool(call, { registry, db })
        state.messages.push(toolResult)
        // 复用现有 ToolCallRecord：按 toolName/input/stepIndex 字段名填充
        state.toolHistory.push({ toolName: call.name, input: call.args, result: wrapToolResult(result), stepIndex: iteration })
    else:
      // G2-2: ReAct 模式不做 JSON.parse/outputSchema.parse
      const finalResult = extractFinalResult(state)
      // 缓存最终结果（key 包含 loadedSkills 快照）
      if useCache:
        setCache({ input: parsedInput, loadedSkills: [...state.loadedSkills].sort() },
                 promptVersion, modelName, validated)
      return {
        result: finalResult,
        tokenUsage: state.totalTokenUsage,
        toolHistory: state.toolHistory
      }
```

### streamReactLoop（streamAgent 的 ReAct 版本）
```
streamReactLoop(context, input):
  与 runAgent 相同的 ReAct 逻辑，但每轮迭代结果通过 onThinking 流式推送：
  - LLM 推理过程 → onThinking(text)
  - Tool call 开始 → onThinking("[Calling tool: load_skill(name)]")
  - Tool call 结束 → onThinking("[Tool result: ...]")
  - 最终结果 → 返回完整结果
```

### Messages 体积控制（跨 checkpoint 持久化）

`ReactLoopState.messages` 在多轮 ReAct 迭代后可能非常大（每轮 = tool call + tool result 各一条消息）。跨 `interrupt()` 持久化时需限制体积：

```
规则：
1. SerializedReactLoopState 只包含迭代计数指标（loadedSkills, toolHistory, totalTokenUsage, iteration）
   → messages 不进入 checkpoint
2. 恢复策略（二选一）：
   a) 快速模式（默认）：从 loadedSkills 列表重新 load_skill 注入全部已加载 skill，
      然后跳过已执行迭代，直接让 Agent 从 feedback 处继续推理
   b) 轻量模式：不注入已加载 skill，Agent 需要时自行重新 search/load
3. 选择依据：轻量模式更简单（省了回放逻辑），代价是 Agent 需重新加载 skill。
   对话轮数少时优先轻量模式。长对话（10+ 迭代）且大量 skill 已加载时用快速模式。
```

### 可用工具

| 工具 | 来源 | 说明 |
|------|------|------|
| `search_skills(query)` | 内置 | 从 SkillRegistry 搜索 skill 元数据 |
| `load_skill(name)` | 内置 | 注入 SKILL.md 内容为 user 消息 |
| `execute_skill_module(name, fn, args)` | 内置 | 调用 skill 的 index.ts 函数 |
| `request_review(phase, data)` | 内置 | 触发 interrupt，请求人工审查（Mode B） |
| `query_requirements` | Skill/ToolRegistry | 查询需求索引（由 `allowedTools` 或角色配置注入） |
| `get_business_flows` | Skill/ToolRegistry | 获取业务流蓝图 |
| `spawn_subagent(role, goal, input)` | Orchestrator 专属 | 启动子代理 |

### Token 预算管理
```
function checkTokenBudget(usage: TokenUsage, limit: number | null) {
  const total = usage.input + usage.output;
  if (limit && total > limit) {
    throw new Error(`Token limit exceeded (${total} > ${limit}).`);
  }
}
```

### runAgent 返回值（useReActLoop 模式）
```typescript
// 新增 toolHistory 字段，供 createAgentNode/logExit/observer.onComplete 传递
interface ReactRunResult {
  result: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  latencyMs: number;
  inputPrompt: ChatMessage[];
  rawOutput: string;
  toolHistory: ToolCallRecord[];        // ReAct Loop 的 tool call 历史
  requestedReview?: { phase: string; data: unknown };  // request_review 请求
  currentReactLoopState?: SerializedReactLoopState;     // interrupt() 前的精确 ReactLoop 快照
}
```

### createAgentNode 适配
`createAgentNode` 的 `logExit` 和 `observer.onComplete` 需要传递 `toolHistory`：
```
observer.onComplete(agentName, raw.tokenUsage, raw.latencyMs, raw.inputPrompt, raw.result, raw.toolHistory);
// toolHistory 写入 test_gen_agent_logs
```

### 缓存策略

| 场景 | 缓存行为 |
|------|---------|
| 中间 tool call 结果 | 不缓存 |
| 最终结果（useReActLoop=false） | 按原有逻辑缓存，key = `{ parsedInput, promptVersion, modelName }` |
| 最终结果（useReActLoop=true） | 缓存，key = `{ parsedInput, loadedSkills: sorted[], promptVersion, modelName }` |

## 5. Interpreter Skills

### index.ts 约定（双模式）
```typescript
// skills/requirement-query/index.ts

// 模式 A：纯函数（无副作用，优先使用）
export function queryRequirements(
  filters: QueryFilters,
  indexData: RequirementIndex
): Requirement[] { /* 纯逻辑 */ }

export function getIndex(indexJson: string): RequirementIndex {
  return JSON.parse(indexJson);
}

// 模式 B：有外部依赖时使用 createService
export function createService(deps: { db?: DbClient; toolRegistry?: ToolRegistry }) {
  return {
    async persistedQuery(filters: QueryFilters): Promise<Requirement[]> {
      // 需要数据库访问的场景
    }
  };
}
```

### execute_skill_module 实现
```typescript
async function executeSkillModule(
  skillName: string,
  functionName: string,
  args: unknown[],
  deps?: { db?: DbClient; toolRegistry?: ToolRegistry }
): Promise<unknown> {
  const module = await SkillRegistry.loadModule(skillName);

  // 优先尝试 createService 模式
  if (module.createService && deps) {
    const service = module.createService(deps);
    return await service[functionName](...args);
  }

  // 纯函数模式
  return await module[functionName](...args);
}
```

### 首批改造
| Skill | 纯函数 | createService |
|-------|--------|---------------|
| `requirement-query` | `queryRequirements(filters, indexData)` | — |
| `requirement-index` | `getChildren(index, parentId)`, `searchByTag(index, tag)` | — |
| `flow-design` | `parseBlueprint(blueprint)`, `validateFlow(flow)` | — |

## 6. Subagent 机制

### spawn_subagent 工具（Mode B 专属）
```typescript
async function spawnSubagent(params: {
  role: 'test-analyst' | 'test-designer' | 'quality-manager';
  goal: string;
  input: unknown;
}): Promise<SubagentResult> {
  const role = getRole(params.role);
  const agent = new AgentTool(role, provider, promptVersion, modelName);
  // 通过 execute() 的 options 参数传递 useReActLoop
  return await agent.execute(params.input, { useReActLoop: true });
}
```

- 子代理独立 `ReactLoopState`
- tool calling 记录关联父级 runId
- 嵌套深度限制为 1

### OrchestratorAgent 角色定义（shared/ai/roles/test-orchestrator.ts）

OrchestratorAgent 是 Mode B 的核心角色，拥有 `search_skills` / `load_skill` / `execute_skill_module` / `spawn_subagent` / `request_review` 的权限，按 `AgentRole` 已有格式定义：

```typescript
// shared/ai/roles/test-orchestrator.ts
export const orchestratorRole: AgentRole = {
  name: 'test-orchestrator',
  systemPrompt: `You are a test orchestration agent. ...`,
  skills: ['requirement-query', 'requirement-index', 'flow-design', 'test-case-generation', 'assertion-design', 'data-preparation', 'risk-analysis'],
  allowedTools: ['search_skills', 'load_skill', 'execute_skill_module', 'spawn_subagent', 'request_review'],
  useProgressiveDisclosure: true,
};
```

执行时通过 `new AgentTool(orchestratorRole, ...)` 实例化，同 `startPipeline` 中对 Analyst/Designer/QualityManager 的创建方式。

### AgentTool 接口扩展

扩展现有的 `AgentRunOptions`（`agent.ts`）：

```typescript
// agent.ts — 现有接口扩展
export interface AgentRunOptions {
  // ...现有字段（timeoutMs, maxRetries, useCache, signal, onStep, onThinking）
  useReActLoop?: boolean;               // 新增：启用 ReAct Loop
  resumeState?: ReactLoopState | null;  // 新增：中断恢复时传入
}

// tool.ts — AgentTool.execute 接受扩展后的 AgentRunOptions
class AgentTool {
  async execute(input: TInput, ctx?: ToolContext & AgentRunOptions): Promise<ToolResult<TOutput>> {
    // createAgentContext 不接收 useReActLoop，skill 加载由 role.useProgressiveDisclosure 控制
    const agentCtx = createAgentContext(provider, this.role, {
      promptVersion: ctx?.promptVersion ?? this.getPromptVersion(),
      modelName: ctx?.modelName ?? this.getModelName(),
      tokenLimit: ctx?.tokenLimit,
    });
    // useReActLoop 独立传入 runAgent()
    return runAgent(agentCtx, input, { useReActLoop: ctx?.useReActLoop ?? false });
  }
}
```

## 7. Dual Mode

### Mode A: Pipeline（startPipeline，默认）

Mode A 的 Agent 已通过 `requiredSkills` 全量加载 skill 内容到 system prompt，因此**不需要** `search_skills` / `load_skill` 的渐进式发现。启用 ReAct Loop 的唯一目的是让 Agent 能调用 **`execute_skill_module`**——将之前依赖 LLM 推理的步骤转为确定性代码执行。

每个 Agent 的 `allowedTools` 配置：

| Agent | allowedTools | 动机 |
|-------|-------------|------|
| Test Analyst | `execute_skill_module` | 用 `requirement-query` / `requirement-index` 的确定性函数查询需求 |
| Test Designer | `execute_skill_module` | 用 `flow-design` 解析业务流蓝图 |
| Quality Manager | `execute_skill_module` | 用 `risk-analysis` 执行风险评估（后续 skill） |

`createAgentContext` 时仍走全量加载路径（`useProgressiveDisclosure=false` 默认分支），但 `runAgent()` 检测到 `useReActLoop=true` 后注入 `execute_skill_module` 工具。

```
TestGenService.startPipeline()
  → 创建 AgentTool[](Analyst, Designer, QualityManager)
  → 每个配置 useReActLoop: true
  → ToolOrchestrator.pipeline() 构建串行 LangGraph
  → 3 Agent + 3 Checkpoint 不变
  → Agent 内部可调用 execute_skill_module，但不可用 search_skills/load_skill
```

### Mode B: Autonomous（startOrchestrator，新入口）
```
TestGenService.startOrchestrator()
  → 复用 TestGenSession + BatchOrchestrator 基础设施:
     并发控制 (concurrencySlot)
     AbortController 管理
     Token 预算检查
     SSE 事件推送
  → 创建 LangGraph Graph，包含单个 OrchestratorNode
  → OrchestratorNode 运行 ReactLoop:
      search_skills → load_skill → execute_skill_module
      或 spawn_subagent(role, goal)
      或 request_review(phase, data) → interrupt
  → 返回最终结果
```

### request_review 与 LangGraph interrupt() 集成

`interrupt()` 只能在 LangGraph 节点中调用。Mode B 的实现方式：

```
Mode B 的执行引擎也是 LangGraph，Orchestrator 是其中的一个节点。

LangGraph Graph (Mode B):
  START → OrchestratorNode(ReactLoop) → CheckpointNode → END

OrchestratorNode:
  1. 运行 ReactLoop
  2. 如果 Agent 调用 request_review:
     → ReactLoop 停止，返回 { requestedReview: { phase, data } }
     → OrchestratorNode 调用 interrupt(payload) 暂停
     → 用户审查并反馈
     → 反馈作为 user 消息注入，继续 ReactLoop
  3. 如果 Agent 完成:
     → 返回最终结果
```

### ReactLoop 状态持久化跨 interrupt/resume

`interrupt()` 恢复时，LangGraph 节点函数**从头执行**。关键约束：`interrupt()` 一旦被调用，该次执行中任何后续 state 写入都不会被 checkpoint。因此 **必须在 `interrupt()` 之前把最新 ReactLoop 状态嵌入 `interrupt()` payload**。

```typescript
// orchestrator-node.ts — LangGraph 节点
interface TestGenState {
  input: unknown;
  messages: ChatMessage[];
  reactLoopState: SerializedReactLoopState | null;  // 序列化状态，用于跨 interrupt/resume 持久化
  result?: unknown;
  toolHistory?: ToolCallRecord[];
}

async function orchestratorNode(state: TestGenState) {
  const resumeState = state.reactLoopState;

  const agent = new AgentTool(orchestratorRole, provider, getPromptVersion, getModelName);  // 角色定义见 shared/ai/roles/test-orchestrator.ts

  const result = await agent.execute(state.input, {
    useReActLoop: true,
    resumeState,
  });

  if (result.requestedReview) {
    // ⚠️ interrupt() 丢弃后续 state 写入，所以必须将最新 ReactLoop 状态嵌入 payload
    const feedback = interrupt({
      type: 'request_review',
      phase: result.requestedReview.phase,
      data: result.requestedReview.data,
      reactLoopState: result.currentReactLoopState,  // ← 精确的运行时快照
    });
    return {
      messages: [...state.messages, { role: 'user', content: feedback as string }],
      reactLoopState: result.currentReactLoopState,
    };
  }

  return { result: result.result, toolHistory: result.toolHistory };
}

// react-loop.ts — request_review 时把当前状态快照放入返回值
function handleRequestReview(state: ReactLoopState):
    { requestedReview: {...}; currentReactLoopState: SerializedReactLoopState } {
  return {
    requestedReview: state.requestedReview,
    currentReactLoopState: {
      loadedSkills: [...state.loadedSkills],              // Set → Array
      toolHistory: state.toolHistory,
      totalTokenUsage: { ...state.totalTokenUsage },
      iteration: state.iteration,
    },
  };
}
```

### 两个 Registry 的协作

```
ToolRegistry（已有）:
  管理 ToolDef（AgentTool, FunctionTool）
  被 ToolOrchestrator 用于 Pipeline 构建
  被 ReAct Loop 作为工具来源（通过 allowedTools）

SkillRegistry（新增）:
  管理 SkillMetadata + SKILL.md 内容 + index.ts 模块
  被 ReAct Loop 用于搜索/加载 skill
  execute_skill_module 的 createService(deps) 可接收 ToolRegistry 引用
```

## 8. 新增/改动文件清单

### 新增
| 文件 | 职责 |
|------|------|
| `shared/ai/skill-registry.ts` | 扫描 skills/ → 解析 frontmatter → 搜索索引 → 按需加载（合并 skill-discovery.ts） |
| `shared/ai/react-loop-state.ts` | ReactLoopState 类型定义 |
| `shared/ai/react-loop.ts` | ReAct 循环引擎（核心 loop + streamReactLoop） |
| `shared/ai/skill-tools.ts` | search_skills, load_skill, execute_skill_module, request_review 工具 |
| `shared/ai/roles/test-orchestrator.ts` | 编排 Agent 角色定义（`orchestratorRole`，含 `useProgressiveDisclosure: true`） |
| `skills/*/index.ts` | 各 skill 的可执行模块 |

### 改动
| 文件 | 改动 |
|------|------|
| `shared/ai/agent.ts` | `AgentRole` 新增 `useProgressiveDisclosure?: boolean`；`createAgentContext` 新增 `useProgressiveDisclosure` 分支（全量 vs 元数据）；`runAgent()` / `streamAgent()` 新增 ReAct Loop 模式；返回值新增 `toolHistory` |
| `shared/ai/tool.ts` | `AgentTool.execute` 接受 `AgentRunOptions`（含 `useReActLoop`），传给 `runAgent()`；`createAgentContext` 不再接收 `useReActLoop`，改用 `role.useProgressiveDisclosure` 分支 |
| `shared/ai/provider.ts` | `ChatResponse` 新增 `toolCalls` 字段；`ChatOptions` 新增 `tools` 参数；`parseChatResponse()` 新增 `tool_calls` 提取；`readSSEStream()` 新增 `delta.tool_calls` 增量解析；`StreamChunk` 新增 `tool_call_start` / `tool_call_end` 类型 |
| `shared/ai/pipeline-nodes.ts` | `AgentObserver.onComplete` 新增第 6 个参数 `toolHistory`；`createAgentNode` / `logExit` 传递 `toolHistory` |
| `shared/ai-test-gen/test-generation.ts` | 新增 `createOrchestratorGraph`（Mode B 的 LangGraph） |
| `server/.../test-gen-service.ts` | 新增 `startOrchestrator` 入口，复用 TestGenSession 基础设施 |
| `server/.../test-gen-session.ts` | 适配 Mode B 的 `TestGenState` 结构（`startBatch`/`resumeBatch` 中 state 字段与现有 `TestGenStateAnnotation` 的差异） |
| `server/.../orchestrator-node.ts` | Mode B 的 LangGraph 节点，管理 ReactLoop 状态持久化 + interrupt/resume |
| `server/.../test-gen-scope.ts` | `TestGenExecutionScope.recordAgentComplete` 适配 `toolHistory` 参数 |
| `server/.../db/test-gen-repository.ts` | `test_gen_agent_logs` 表新增 `tool_history` 字段（JSON） |
| `shared/ai/skill-cache.ts` | `SkillContext` 接口新增 `skillContents` 和 `cachedSkillContents` 字段（渐进式模式下为空对象） |
| `skills/*/SKILL.md` | 所有 7 个 SKILL.md 添加 YAML frontmatter |

## 9. 安全约束

- `maxIterations = 15` 防止无限循环
- 累计 token 预算：`ReactLoopState.totalTokenUsage` 每轮检查 `tokenLimit`
- Subagent 嵌套深度 ≤ 1
- tool calling 记录写入 `test_gen_agent_logs`
- 不引入沙箱（Node.js 直接 import，skill 代码受项目代码审查控制）
