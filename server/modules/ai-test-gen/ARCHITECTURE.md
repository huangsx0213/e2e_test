# AI Test Gen - Architecture & Design

## Overview

AI Test Gen 是一个基于 LangGraph StateGraph 的自动化测试用例生成系统，通过三个 AI Agent（Test Analyst → Test Designer → Quality Manager）协作，从需求出发生成高质量的 ISTQB 标准测试用例。

## Pipeline Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
│ Preparation │ →  │ Test Analyst │ →  │ Checkpoint 1 │ →  │ Designer  │
│  (数据准备)  │    │  (分析需求)   │    │  (人工审核)   │    │ (设计用例) │
└─────────────┘    └──────────────┘    └──────────────┘    └───────────┘
                                                                │
┌──────────┐    ┌──────────────┐    ┌──────────────┐           │
│ Complete │ ←  │ Checkpoint 3 │ ←  │   Quality    │ ←  ┌──────────────┐
│ (输出结果) │    │  (人工审核)   │    │  Manager     │    │ Checkpoint 2 │
└──────────┘    └──────────────┘    │  (质量评审)   │    │  (人工审核)   │
                                    └──────────────┘    └──────────────┘
```

## Agent Roles & Skills

### Test Analyst（测试分析师）

**职责**：分析需求风险，推导 test conditions，选择 ISTQB 测试技术

**绑定 Skills**（10 个）：

| 类别 | Skill | 说明 |
|------|-------|------|
| Data | `requirement_detail_query` | 批量查询需求详情（支持缓存去重） |
| Data | `requirement_graph_query` | 需求图谱扩展（parent/children/siblings/deps/flows） |
| Data | `flow_detail_query` | 批量查询业务流程详情（支持缓存去重） |
| ISTQB | `istqb_equivalence_partitioning` | 等价类划分 |
| ISTQB | `istqb_boundary_value_analysis` | 边界值分析 |
| ISTQB | `istqb_decision_table` | 判定表 |
| ISTQB | `istqb_state_transition` | 状态迁移 |
| ISTQB | `istqb_use_case_testing` | 用例测试 |
| Knowledge | `knowledge_base` | 项目知识库 |

**Workflow**：
1. 查询需求详情（`requirement_detail_query`，批量）
2. 查询业务流程（`flow_detail_query`，非 flow 模式下作为上下文参考）
3. 扩展需求图谱（`requirement_graph_query`，传入 flowId 纳入用户选中的 flow）
4. 加载 ISTQB 技术指南（按需加载，至少一个）
5. 推导 test conditions

**输出 Schema**：
```typescript
{
  requirementAnalysis: { overallApproach: string, riskAssessmentSummary: string },
  testConditions: [{
    id, requirementId, condition, category, priority, riskLevel,
    primaryTechnique, secondaryTechniques, techniqueRationale,
    coverageDimensions, dataRequirements, dependencies, requirementLevel
  }]
}
```

### Test Designer（测试设计师）

**职责**：基于 test conditions 设计详细可执行的测试用例

**绑定 Skills**（9 个）：

| 类别 | Skill | 说明 |
|------|-------|------|
| Data | `requirement_detail_query` | 查询需求（缓存命中时极快） |
| Data | `requirement_graph_query` | 扩展需求图谱 |
| Data | `flow_detail_query` | 查询业务流程 |
| ISTQB | `istqb_equivalence_partitioning` | 等价类划分 |
| ISTQB | `istqb_boundary_value_analysis` | 边界值分析 |
| ISTQB | `istqb_decision_table` | 判定表 |
| ISTQB | `istqb_state_transition` | 状态迁移 |
| ISTQB | `istqb_use_case_testing` | 用例测试 |
| Knowledge | `knowledge_base` | 项目知识库 |

**Workflow**：
1. 查询需求详情（缓存命中，快速）
2. **加载 ISTQB 技术指南（MANDATORY）** — 每个条件对应的 primaryTechnique 必须加载
3. 设计测试用例

**输出 Schema**：
```typescript
{
  draftTestCases: [{
    id, title, conditionId, requirementId, priority, category,
    techniqueApplied, preconditions, testData,
    steps: [{ stepNumber, action, expected }],
    postconditions, tags,
    selfReview: { score, strengths, weaknesses, suggestions }
  }]
}
```

### Quality Manager（质量经理）

**职责**：6 维度评审测试用例，生成覆盖率矩阵

**绑定 Skills**（2 个）：

| 类别 | Skill | 说明 |
|------|-------|------|
| Data | `requirement_detail_query` | 验证需求正确性（缓存命中） |
| Knowledge | `knowledge_base` | 查询领域标准/规则 |

**6 维度评审**：Clarity → Completeness → Correctness → Traceability → Data Validity → Maintainability

**输出 Schema**：
```typescript
{
  finalTestCases: [{
    id, title, conditionId, requirementId, priority, category,
    preconditions, testData,
    steps: [{ stepNumber, action, expected }],
    tags, status, reviewSummary,
    changeLog: [{ field, from, to, reason }]
  }],
  coverageMatrix: {
    rows: [{ requirementId, requirementTitle, level, totalConditions,
             testCaseCount, coveragePercentage, techniqueBreakdown,
             categoryBreakdown, uncoveredRisks }],
    summary: { totalRequirements, totalConditions, totalCases, overallCoverage }
  }
}
```

## Two Generation Modes

### Requirement-Level（默认）

- 需求是**主体**，test conditions 围绕需求设计
- 业务流程仅作为**上下文参考**，帮助理解需求在真实场景中的连接
- Analyst 必须查需求，可选查流程

### Flow-Level（includeFlowCases = true）

- 业务流程是**主体**，test conditions 围绕 flow 的步骤设计
- 需求作为**参考**，确保 flow case 覆盖关键业务规则
- Analyst 必须查流程和需求

## ReAct Loop & Structured Output

### ReAct 循环

每个 Agent 通过 ReAct（Reason → Act → Observe）循环与 Skills 交互：

```
Round 1: LLM 思考 → 调用 tool(s) → 观察结果
Round 2: LLM 继续思考 → 调用更多 tool(s) → 观察结果
...
Round N: LLM 思考/总结 → 无 tool calls → 结束 ReAct，转入后续 JSON 提取
```

- 最多 15 轮（`MAX_REACT_ROUNDS`）
- 无 tool calls 时自动退出
- 温度：0.3（Phase 1），0（Phase 2）

### 两阶段 JSON 提取策略

```
Phase 1: ReAct 自由输出 → tryExtractJson() → schema.parse()
  ├─ 成功 → 直接返回
  └─ 失败 → Phase 2

Phase 2: schema-constrained 输出提取 → schema.parse()
  ├─ 成功 → 返回
  └─ 失败 → 抛出异常
```

**为什么需要两阶段**：
- Phase 1 需要自由分析文本和 tool calls，不适合直接强制最终结构化输出
- Phase 2 使用 schema-constrained 输出，把前面的分析和 tool 结果整理成最终 JSON
- 即使 API 帮助约束 JSON 形状，仍然需要运行时 schema 校验和 normalize

### JSON 容错层

| 层 | 机制 | 处理的问题 |
|----|------|-----------|
| 1 | `tryExtractJson()` | markdown 包裹、混合文本中的 JSON |
| 2 | 顶层 `z.preprocess` | LLM 输出单个对象而非 `{ draftTestCases: [...] }` 包裹 |
| 3 | 内层 `z.preprocess` | 数组/对象混用、字符串数字、非字符串类型 |

## Skill System

### Data Skills（查询真实数据）

| Skill | 参数 | 缓存 | 说明 |
|-------|------|------|------|
| `requirement_detail_query` | `requirementId: string \| string[]` | ✅ `reqDetailCache` | 查需求详情，含 parent/children |
| `requirement_graph_query` | `requirementId: string \| string[]`, `flowId?: string \| string[]` | — | 需求图谱：parent/children/siblings/deps/dependents/flows |
| `flow_detail_query` | `flowId: string \| string[]` | ✅ `flowDetailCache` | 查流程详情，含 steps 和关联需求 |

### ISTQB Knowledge Skills（Markdown 管理）

每个测试技术一个 `.md` 文件，存放在 `skills/knowledge/` 目录：

```
knowledge/
  istqb-equivalence-partitioning.md
  istqb-boundary-value-analysis.md
  istqb-decision-table.md
  istqb-state-transition.md
  istqb-use-case-testing.md
  knowledge-base.md
```

- 文件名即 skill name（`-` 转 `_`）
- 内容按需加载（skill func 被调用时才读文件）
- 支持 `context` 参数，获取针对性指导

### Knowledge Base Skills（业务知识，可扩展）

当前只有 `knowledge_base`，未来可添加：
- 业务规则（`business-rules.md`）
- 通用知识（`domain-knowledge.md`）
- 历史用例（`historical-cases.md`）
- Bug 记录（`bug-patterns.md`）

只需在 `knowledge/` 目录添加 `.md` 文件，系统自动注册为 skill。

### 查询缓存机制

- `reqDetailCache` / `flowDetailCache`：`Map<string, unknown>`
- 每个 batch 开始时调用 `clearQueryCache()` 清空
- LLM 重复传已查 ID 时自动跳过，日志显示 cache hit
- 跨 Agent 共享（Analyst 查过的，Designer/QM 调用时直接命中）

## Requirement Graph（需求图谱）

`requirement_graph_query` 从种子需求出发，自动展开关联关系：

```
seed requirement
  ├── parent (上级需求)
  ├── children (子需求)
  ├── siblings (同级需求)
  ├── dependencies (上游依赖)
  ├── dependents (下游依赖)
  └── associated flows (关联业务流程)
```

- 支持批量传入多个 seed
- 自动去重（`Set<string>`）
- 用户选中的 flow 通过 `flowId` 参数纳入图谱
- 日志区分 discovered flows（通过需求关联发现）和 user-selected flows（用户主动选择）

## Timeout & Performance

| 配置 | 值 | 说明 |
|------|---|------|
| Agent timeout | 600s (10min) | 每个 agent 节点的最大执行时间 |
| ReAct max rounds | 15 | 单个 agent 的最大 tool call 轮次 |
| Phase 1 temperature | 0.3 | 平衡分析质量与稳定性 |
| Phase 2 temperature | 0 | 尽量确定性输出 |
| Phase 1 maxTokens | 32768 | ReAct 循环的 token 上限 |
| Phase 2 maxTokens | 32768 | 提取阶段的 token 上限 |

## Key Files

| 文件 | 职责 |
|------|------|
| `graph/state.ts` | LangGraph 状态定义 |
| `graph/graph.ts` | 图拓扑构建 |
| `graph/prompts.ts` | 三个 Agent 的 system prompt + user message |
| `graph/nodes/analyst.ts` | Test Analyst 节点 + 输出 schema |
| `graph/nodes/designer.ts` | Test Designer 节点 + 输出 schema |
| `graph/nodes/quality.ts` | Quality Manager 节点 + 输出 schema |
| `graph/nodes/utils.ts` | ReAct 循环 + 两阶段提取 + JSON 容错 |
| `graph/skills/data-skills.ts` | 数据查询类 skill（需求/流程/图谱） |
| `graph/skills/skills.ts` | Skill 分组注册 + Markdown 知识加载 |
| `graph/skills/knowledge/` | ISTQB + 知识库 Markdown 文件 |
| `session.ts` | 单个 batch 的执行管理 |
| `orchestrator.ts` | 多 batch 编排 + 启动/恢复/重试 |
| `context.ts` | AI Provider 创建 + 配置 |
| `infra/provider.ts` | 多 Provider 适配（Azure/OpenAI/NVIDIA/OpenRouter/Agnes） |
