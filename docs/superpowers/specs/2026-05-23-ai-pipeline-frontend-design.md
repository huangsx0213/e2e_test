# AI Pipeline & NL Test Cases — Frontend & Backend 完善设计

## 概述

当前 AI Pipeline 和 NL Test Cases 的前端页面仅为 stub（各 14 行占位代码），后端 Pipeline 已具备完整功能但缺少真正的人机交互（Human-in-the-Loop）机制。本设计基于业界最佳实践（LangGraph HITL、n8n Canvas、LangSmith Observability、Anthropic Agent Patterns）对两个页面进行完整设计。

## 业界实践参考

| 来源 | 核心理念 | 本设计采纳 |
|------|---------|-----------|
| LangGraph v2 | `interrupt()` + `Command(resume)` + streaming 模式 | Interactive 模式的核心机制 |
| LangSmith Studio | 节点级 trace、agent 输入输出可视化、checkpoint 断点 | Detail Panel 的 Raw Trace + Input/Output Tab |
| n8n | 可视化 Canvas + 节点点击展开详情 + 单步重跑 | Flow Canvas + 点击节点查看日志 |
| Anthropic Agents | Workflows vs Agents 区分、Human-in-the-loop 为一等公民 | Auto vs Interactive 两种运行模式 |
| CrewAI | Sequential / Hierarchical 流程、Manager Agent 审核 | 3 个 ISTQB Agent 的 Sequential 编排 |

---

## 1. AI Pipeline 页面

### 1.1 整体布局 — 三面板设计

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AI Pipeline                                          [New Run] [History]│
├────────────┬─────────────────────────────────┬───────────────────────────┤
│  CONFIG    │      FLOW CANVAS               │     DETAIL PANEL          │
│  Panel     │      (Flowchart)               │     (Node Detail / Log)   │
│  (w-80)    │      (flex-1)                  │     (w-96)                │
└────────────┴─────────────────────────────────┴──────────────────────────┘
```

- **Left (Config Panel)**: Pipeline 配置 — 输入源选择、运行模式、AI Provider
- **Center (Flow Canvas)**: 基于 mermaid/ReactFlow 的交互式流程图
- **Right (Detail Panel)**: 点击节点后展示该节点的执行详情（agent 输入输出、LLM traces、token 使用量、时间戳）

顶部 [New Run] 进入配置模式创建新运行，[History] 切换到运行历史列表视图。

### 1.2 左侧 — 配置面板

```
┌─ Configuration ───────────────────────────┐
│  Pipeline Name                             │
│  [input: 用户管理模块测试_2026-05-23]      │
│                                            │
│  ── Input Sources ──                       │
│  Requirements           3 selected         │
│  ┌──────────────────────────────────────┐  │
│  │ 🔍 Filter...                        │  │
│  │ ☑ 用户管理 (Epic)                   │  │
│  │   ☑ 用户注册 (Feature)              │  │
│  │     ☑ 邮箱注册 (Story)              │  │
│  │     ☑ 手机注册 (Story)              │  │
│  │   ☐ 用户登录 (Feature)              │  │
│  │ ☑ 订单系统 (Epic)                   │  │
│  │   ☑ 创建订单 (Feature)              │  │
│  │ ☐ 报表系统 (Epic)                   │  │
│  │ [Select All] [Clear]                │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  Business Flows         2 selected         │
│  ┌──────────────────────────────────────┐  │
│  │ ☑ 用户注册流程 (happy-path)  ✓      │  │
│  │ ☑ 订单创建流程 (alternate)  ✓       │  │
│  │ ☐ 支付异常处理 (exception)  ✓       │  │
│  │ [✓] Show approved flows only        │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ── Run Settings ──                        │
│  Mode                                      │
│  ○ Auto   自动执行所有节点                 │
│  ● Interactive  每个检查点暂停等待审核     │
│                                            │
│  AI Provider                               │
│  [Azure OpenAI ▼]  gpt-4o                  │
│                                            │
│  [▶ Start Pipeline]                        │
└────────────────────────────────────────────┘
```

**交互细节：**
- 需求树支持展开/折叠、搜索过滤、父子联动（选 Epic 自动全选子节点）
- Business Flow 默认只显示已审批的，可切换显示全部
- Mode 切换时 Canvas 上的 Checkpoint 节点自动显示/隐藏暂停标记
- Start 前验证：至少选了一个输入源、有活跃的 Provider 配置

### 1.3 中间 — 流程图 (Flow Canvas)

使用 mermaid 渲染（已在 package.json 依赖中），或使用 ReactFlow（如需更丰富的交互）。

#### 节点定义

共 8 个节点：

```
 Preparation
     │
 Agent 1: Test Analyst (测试分析师)
     │
 Checkpoint 1: Review Conditions
     │
 Agent 2: Test Designer (测试设计师)
     │
 Checkpoint 2: Review Draft Cases
     │
 Agent 3: Quality Manager (质量经理)
     │
 Checkpoint 3: Final Review
     │
 Complete
```

#### 节点状态视觉

| 状态 | 样式 | 说明 |
|------|------|------|
| Pending | 灰色边框虚线 | 未开始 |
| Running | 蓝色边框 + 脉冲动画 | 正在执行 |
| Waiting | 橙色边框 + 呼吸闪烁 | Interactive 模式下等待人工审核 |
| Done | 绿色边框 + ✓ 标记 | 已完成 |
| Error | 红色边框 + ✕ 标记 | 执行失败 |
| Auto-passed | 灰色虚线边框 + 小字"Auto" | Auto 模式下自动通过的 Checkpoint |

#### 节点信息展示

每个 Agent 节点显示：
- Agent 角色名称和图标 (🧠 Test Analyst / ✏️ Test Designer / ⭐ Quality Manager)
- 子步骤概要（运行中显示当前步骤）
- 输出摘要：条件数量/用例数量
- Token 使用量 + 耗时
- 状态标记

每个 Checkpoint 节点显示：
- Checkpoint 名称
- Interactive 模式：显示 [Approve] [Edit] [Retry] 按钮
- Auto 模式：显示 "Auto-passed" 标记

#### 节点展开

点击节点右侧展开箭头，显示 Agent 内部子步骤：

```
Test Analyst (expanded):
  1. 评估需求风险与优先级  ✓  (1.2s)
  2. 提取 Test Conditions   ✓  (3.8s, 42 conditions)
  3. 选择 ISTQB 设计技术      ✓  (2.1s)
```

#### 进度栏

Canvas 底部显示：
- 批次进度条 (Batch 2/5)
- 已生成用例数量
- [Abort] 按钮（运行中可用）

### 1.4 右侧 — 节点详情面板

点击 Canvas 任意节点后展开，包含 Tab 切换。

#### Agent 节点 Tab

```
┌─ Test Analyst · Detail ───────────────────┐
│  Status: ✓ Completed                       │
│  Duration: 8.2s  |  Token: 12,450          │
│  Model: gpt-4o (Azure)                     │
│                                            │
│  [Input] [Output] [Raw Trace] [Errors]     │
│                                            │
│  Input Tab:                                │
│  - Batch context (batch 1/5, project)      │
│  - System Prompt (collapsed, expandable)   │
│  - User Message (collapsed, expandable)    │
│                                            │
│  Output Tab:                               │
│  - Risk Assessment 概要                    │
│  - Test Conditions 表格 (可排序/搜索)      │
│                                            │
│  Raw Trace Tab:                            │
│  - 毫秒级时间戳日志流                      │
│  - LLM 调用 attempt 记录 + 重试历史       │
│  - JSON parse / Zod validation 结果        │
└────────────────────────────────────────────┘
```

#### Checkpoint 节点 Tab (Interactive 模式)

```
┌─ Checkpoint 1 · Review Conditions ────────┐
│  Status: ● Waiting for review              │
│                                            │
│  [Conditions] [Analysis] [Audit Log]       │
│                                            │
│  Conditions Tab (42 items):                │
│  - 搜索/过滤栏                             │
│  - 条件卡片列表，每项包含：                 │
│    · Condition 文本                        │
│    · Category / Risk Level / Technique     │
│    · Rationale 理由                        │
│    · Coverage Dimensions                   │
│    · [Edit] [✕ Remove] 按钮               │
│                                            │
│  底部操作栏:                               │
│  [Approve All] [Edit Selected]             │
│  [Retry Agent] [Add Condition +]           │
└────────────────────────────────────────────┘
```

#### Checkpoint 节点 Tab (Auto 模式)

显示与 Interactive 相同的内容，但为只读（标注"Auto-passed at 14:32:08"）。

### 1.5 运行历史列表

点击顶部 [History] 切换到列表视图：

```
┌─ Run History ────────────────────────────────────────────────────────────┐
│  🔍 Search...  Status: [All ▼]  Mode: [All ▼]  Date: [Last 30d ▼]      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ #   Name                 Status    Mode     Date        Results    │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ #12 用户管理模块测试      ✓ Complete Auto     05-23 14:32 28 cases │  │
│  │ #11 订单系统测试          ✓ Complete Interact 05-23 10:15 15 cases │  │
│  │ #10 支付流程测试          ✕ Failed   Auto     05-22 18:02 0 cases  │  │
│  │  #9 全模块回归测试        ● Running  Interact 05-22 14:00 12/45    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Click a run → load canvas with that run's snapshot (read-only)          │
└──────────────────────────────────────────────────────────────────────────┘
```

点击历史记录加载该 Run 的快照到 Canvas + Detail Panel（只读，不可操作已完成的 Run）。

---

## 2. NL Test Cases 页面

### 2.1 布局 — 表格 + 详情面板

```
┌─ NL Test Cases ──────────────────────────────────────────────────────────┐
│  🔍 Search...  Status: [All ▼]  Priority: [All ▼]  Category: [All ▼]    │
│  Requirement: [All ▼]  Pipeline Run: [Run #12 ▼]                        │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ #  Title                  Priority  Category   Req        Status   │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ 1  邮箱注册-有效Gmail      Critical  happy-path  REQ-003   FINAL   │  │
│  │ 2  邮箱注册-无效格式(无@)  High      error       REQ-003   FINAL   │  │
│  │ 3  邮箱注册-边界值(64字符) High      boundary    REQ-003   FINAL   │  │
│  │ ...                                                                │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                  1-20 of 28  < 1 2 >    │
│                                                                          │
│  ┌─ Case Detail ─────────────────────────────────────────────────────┐  │
│  │  (click row to expand inline detail panel below the table)         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 用例详情面板

```
┌─ Case Detail: 邮箱注册-有效Gmail格式 ────┐
│  ID: TC-001                                │
│  Status: FINAL  Priority: Critical         │
│  Category: happy-path                      │
│  Requirement: REQ-003 · 邮箱注册 (Story)   │
│  Condition: C-001 · 邮箱格式验证            │
│  Technique: Equivalence Partitioning + BVA │
│  Pipeline: Run #12 · 用户管理模块测试       │
│                                            │
│  Preconditions:                            │
│  · 用户已打开注册页面                       │
│  · 系统处于正常服务状态                     │
│                                            │
│  Test Data:                                │
│  · email: test.user@gmail.com              │
│  · password: Test@123456                   │
│                                            │
│  Steps:                                    │
│  Step 1                                     │
│    Action:  在邮箱输入框输入 test.user@...  │
│    Expected: 输入内容正确显示在输入框中      │
│  Step 2                                     │
│    Action:  输入密码并点击"注册"按钮         │
│    Expected: 系统发送验证邮件，页面跳转到    │
│              "验证邮箱"提示页               │
│                                            │
│  Postconditions:                            │
│  · 用户账号创建成功（待邮箱验证状态）         │
│                                            │
│  Tags: [注册] [邮箱] [正向用例] [功能测试]  │
│                                            │
│  Review Summary:                           │
│  通过 ISTQB 6 维度审阅...                   │
└────────────────────────────────────────────┘
```

---

## 3. 后端架构变更

### 3.1 Interactive Mode 核心机制

当前问题: `pipeline.invoke()` 一次性调用，LangGraph 的 `interrupt()` 被自动忽略。

修改方案: 使用 LangGraph **streaming + interrupt 检测 + Command(resume)** 模式。

```
Start Pipeline
    │
    ▼
For each batch:
    │
    ├─ mode === 'auto':
    │     pipeline.invoke(input, config)
    │     → 忽略 interrupts，自动完成
    │     → 广播 SSE: phase:update
    │
    └─ mode === 'interactive':
          stream = pipeline.stream(input, config,
            stream_mode=["updates","values"])
          for chunk in stream:
              if chunk has interrupts:
                  → 保存 checkpoint payload 到 DB
                  → 广播 SSE: checkpoint:waiting
                  → 创建 Promise 等待 resume
                  → POST /:runId/resume 到达时 resolve
                  → 调用 pipeline.stream(Command(resume=...))
              else:
                  → 广播 SSE: phase:update / agent:complete
```

### 3.2 Resume 等待队列

```
const resumeQueue = new Map<string, {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}>();

// Agent 节点运行时，checkpoint 触发:
// 1. 将 interrupt payload 写入 pipeline_runs.checkpoint_data
// 2. 创建 Promise 并存储到 resumeQueue[runId]
// 3. await promise (挂起)

// POST /api/pipeline/:runId/resume 处理:
// 1. 获取 runId 对应的 promise resolve
// 2. 调用 resolve(actionData)
// 3. pipeline.stream 继续执行
```

### 3.3 新增/修改 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/pipeline/runs/:projectId` | **新增** 列出项目的所有 pipeline 运行记录 |
| `POST` | `/api/pipeline/:projectId/start` | **修改** 支持 mode 参数，interactive 模式改用 stream+await |
| `POST` | `/api/pipeline/:runId/resume` | **新增** Interactive 模式恢复暂停的 pipeline |
| `GET` | `/api/pipeline/:runId/checkpoint` | **新增** 获取当前等待审阅的 checkpoint 数据 |
| `GET` | `/api/pipeline/:runId/logs` | **新增** 获取 agent 节点执行日志 |
| `POST` | `/api/pipeline/:runId/abort` | **保留** 中止运行 |

### 3.4 新增 SSE 事件类型

| Event | Payload | When |
|-------|---------|------|
| `checkpoint:waiting` | `{ checkpointId, checkpointNumber, type, summary, payload }` | Interactive 模式暂停 |
| `checkpoint:resolved` | `{ checkpointId, action, timestamp }` | 用户审核后恢复 |
| `agent:start` | `{ agentName, phase, batch, timestamp }` | Agent 开始执行 |
| `agent:complete` | `{ agentName, outputSummary, tokenUsage, latencyMs }` | Agent 执行完成 |
| `agent:error` | `{ agentName, error, retryAttempt }` | Agent 执行出错 |

### 3.5 新增 Agent Execution Log 表

```sql
CREATE TABLE IF NOT EXISTS pipeline_agent_logs (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  batch        INTEGER NOT NULL,
  agent_name   TEXT NOT NULL,          -- 'test_analyst' | 'test_designer' | 'quality_manager'
  phase        TEXT NOT NULL,          -- 'analysis' | 'design' | 'quality'
  input_prompt TEXT,                   -- JSON: { systemPrompt, userMessage }
  output_data  TEXT,                   -- JSON: agent output
  token_usage  TEXT,                   -- JSON: { input, output, total }
  latency_ms   INTEGER,
  raw_trace    TEXT,                   -- JSON array of timestamped events
  status       TEXT NOT NULL DEFAULT 'RUNNING',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.6 Pipeline Run 配置持久化

在 `pipeline_runs` 表新增列：

```sql
ALTER TABLE pipeline_runs ADD COLUMN config TEXT;
-- JSON: { requirementIds, flowIds, mode, providerConfigName, name }
ALTER TABLE pipeline_runs ADD COLUMN checkpoint_data TEXT;
-- JSON: 当前 checkpoint 的 payload（conditions/cases 等）
```

---

## 4. 前端数据流架构

### 4.1 API Client (`client/shared/services/api.ts`)

新增：

```typescript
export const api = {
  // ... existing ...

  pipeline: {
    runs: (projectId: string) => apiFetch<PipelineRun[]>(`pipeline/runs/${projectId}`),
    start: (projectId: string, config: PipelineStartConfig) => apiFetch<{ runId: string }>(`pipeline/${projectId}/start`, { method: 'POST', body: JSON.stringify(config) }),
    resume: (runId: string, action: CheckpointAction) => apiFetch<void>(`pipeline/${runId}/resume`, { method: 'POST', body: JSON.stringify(action) }),
    checkpoint: (runId: string) => apiFetch<CheckpointData>(`pipeline/${runId}/checkpoint`),
    logs: (runId: string, agentName?: string) => apiFetch<AgentLog[]>(`pipeline/${runId}/logs` + (agentName ? `?agent=${agentName}` : '')),
    abort: (runId: string) => apiFetch<void>(`pipeline/${runId}/abort`, { method: 'POST' }),
    stream: (projectId: string, config: PipelineStartConfig): EventSource => new EventSource(`/api/pipeline/${projectId}/start?config=${encodeURIComponent(JSON.stringify(config))}`),
  },

  nlCases: {
    ...createCrudService<NlTestCase>('nl-cases'),
    listByProject: (projectId: string) => apiFetch<NlTestCase[]>(`nl-cases/by-project/${projectId}`),
  },
};
```

### 4.2 Query Keys (`client/shared/hooks/queryKeys.ts`)

新增：

```typescript
export const queryKeys = {
  // ... existing ...
  pipeline: {
    runs: (projectId: string) => ['pipeline', 'runs', projectId] as const,
    checkpoint: (runId: string) => ['pipeline', 'checkpoint', runId] as const,
    logs: (runId: string, agentName?: string) => ['pipeline', 'logs', runId, agentName] as const,
  },
  nlCases: (projectId: string) => ['nl-cases', projectId] as const,
};
```

### 4.3 React Query Hooks (`client/shared/hooks/useQueryHooks.ts`)

新增：

```typescript
export function usePipelineRuns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.runs(projectId),
    queryFn: () => api.pipeline.runs(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const running = query.state.data?.some((r) => r.status === 'RUNNING');
      return running ? 3000 : false;
    },
  });
}

export function useCheckpoint(runId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.checkpoint(runId),
    queryFn: () => api.pipeline.checkpoint(runId),
    enabled: !!runId,
    refetchInterval: 5000,
  });
}

export function useAgentLogs(runId: string, agentName?: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.logs(runId, agentName),
    queryFn: () => api.pipeline.logs(runId, agentName),
    enabled: !!runId,
  });
}

export function useNlCases(projectId: string) {
  return useQuery({
    queryKey: queryKeys.nlCases(projectId),
    queryFn: () => api.nlCases.listByProject(projectId),
    enabled: !!projectId,
  });
}
```

### 4.4 SSE Hook

新增 `usePipelineSSE` hook 用于实时订阅 pipeline 运行事件：

```typescript
function usePipelineSSE(projectId: string, config: PipelineStartConfig | null) {
  // 使用 EventSource 连接 SSE 端点
  // 监听事件: heartbeat, phase:start, agent:start, agent:complete,
  //          checkpoint:waiting, checkpoint:resolved, batch:start,
  //          batch:complete, pipeline:complete, pipeline:error
  // 更新本地状态，驱动 Canvas 节点状态变化
}
```

### 4.5 组件树

```
AiPipelinePage
  ├── PipelineConfigPanel        (左侧 · 配置)
  │   ├── RequirementTreeSelector (需求树多选)
  │   ├── BusinessFlowSelector    (Flow 列表多选)
  │   ├── ModeSelector            (Auto/Interactive 切换)
  │   └── ProviderSelector        (AI Provider 下拉)
  │
  ├── PipelineFlowCanvas          (中间 · mermaid 流程图)
  │   ├── PipelineNode            (单个节点，带状态标记)
  │   └── ProgressBar             (批次进度)
  │
  ├── PipelineNodeDetail          (右侧 · 节点详情)
  │   ├── AgentDetailTabs         (Agent 节点: Input/Output/Raw Trace/Errors)
  │   └── CheckpointReviewPanel   (Checkpoint 节点: 条件/用例审核)
  │
  └── PipelineRunHistory          (列表视图 · 切换显示)

NlCasesPage
  ├── NlCaseFilters               (筛选栏)
  ├── NlCaseTable                 (用例表格)
  └── NlCaseDetail                (选中用例的行展开详情)

Shared:
  ├── api.pipeline.*              (client/shared/services/api.ts)
  ├── api.nlCases.*               (client/shared/services/api.ts)
  ├── usePipelineRuns             (client/shared/hooks/useQueryHooks.ts)
  ├── useCheckpoint               (client/shared/hooks/useQueryHooks.ts)
  ├── useAgentLogs                (client/shared/hooks/useQueryHooks.ts)
  ├── useNlCases                  (client/shared/hooks/useQueryHooks.ts)
  └── usePipelineSSE              (client/shared/hooks/usePipelineSSE.ts · 新建)
```

---

## 5. 技术选型

| 模块 | 技术 | 理由 |
|------|------|------|
| 流程图渲染 | mermaid (已有依赖) | 声明式 DSL，渲染轻量，支持状态着色 |
| SSE 消费 | EventSource API | 标准浏览器 API，自动重连 |
| 状态管理 | React Query + useState | 与现有架构一致，SSE 事件驱动本地状态 |
| 需求树选择 | 复用 requirements 现有数据结构 | 已有 RequirementTree 组件逻辑可参考 |
| UI 组件 | Tailwind CSS + lucide-react | 项目已有依赖 |

**ReactFlow 候选**: 如果 mermaid 的交互性不足（如需要拖拽节点、自定义动画），可切换到 ReactFlow。但当前 mermaid 能满足"展示流程 + 状态着色 + 点击展开"的需求，且已在依赖中。

---

## 6. 实现优先级

### Phase 1: 后端 Interactive 模式

1. 修改 `POST /api/pipeline/:projectId/start` 支持 mode 参数
2. 实现 streaming + interrupt 检测 + Command(resume) 循环
3. 实现 resume 等待队列
4. 新增 `pipeline_agent_logs` 表 + migration
5. 新增/修改 API endpoints (runs list, resume, checkpoint, logs)

### Phase 2: 前端 Pipeline 页面

1. 三面板布局框架
2. 配置面板 (需求树选择、Flow 选择、模式切换)
3. mermaid 流程图渲染 + 节点状态
4. 节点详情面板 (Input/Output/Raw Trace Tabs)
5. Checkpoint 审核交互 (Approve/Edit/Retry)
6. SSE 实时订阅 hook
7. 运行历史列表

### Phase 3: 前端 NL Test Cases 页面

1. 用例表格 + 筛选栏
2. 用例详情行展开面板
3. React Query hooks 集成

### Phase 4: 连线优化

1. 运行中的 Agent 节点实时 streaming 文字展示
2. Token usage 统计展示
3. Batch 进度条动画
4. 错误恢复和 Abort 确认

---

## 7. Out of Scope

- NL 用例 → 自动化执行用例的后续流程
- Pipeline 之间的比对/合并
- AI Provider 配置管理 UI（已有 Settings 页面）
- 覆盖矩阵的可视化图表（后续迭代）
- Pipeline 模板/预设功能