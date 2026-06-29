# 架构师全局蓝图重构

*全局视野与范围控制 —— 防止分析师视野窄化，同时避免范围蔓延*

---

## 1. 问题陈述

### 1.1 原始设计

测试架构师（Test Architect）代理的设计目的是提供"全局视野"——对项目需求、业务流和跨领域关注点的整体视图——供下游的测试分析师（Test Analyst）和测试设计师（Test Designer）代理使用。这可以防止分析师在孤立的环境中设计测试用例，而不知道其直接批次之外的依赖关系、共享状态和风险。

### 1.2 矛盾

原始实现存在一个根本性缺陷：

> **架构师的输入被用户的复选框选择所过滤。**

| 组件 | 原始行为 | 后果 |
|-----------|------------------|-------------|
| 需求 | 仅将用户选择的需求传递给架构师 | 架构师看不到未选择的依赖项 |
| 流程步骤 | `steps: []` 硬编码为空 | 依赖关系 DAG 不可见 |
| 需求依赖 | 从未读取 `dependencies[]` 字段 | 外部依赖风险不可见 |
| 范围边界 | 通过输入过滤隐式确定 | 分析师无法知道哪些内容超出范围 |

结果是：一个本应提供"全局视野"的架构师，自身却在操作部分数据——是一个"已选中项的聚合"而非"项目范围的哨兵"。

### 1.3 平衡挑战

给架构师完整的项目数据会带来一个新风险：如果分析师看到所有需求和流程，它可能会为超出范围的项目生成测试条件——**范围蔓延**。

```
┌─ 太窄 ────────┐         ┌─ 太宽 ────────┐
│                  │         │                   │
│  分析师看不到    │         │  分析师为         │
│  依赖关系        │         │  未选中的史诗     │
│  → 错误的前置条件│         │  生成条件         │
│  → 遗漏的风险    │         │  → 批次爆炸       │
│                  │         │                   │
└──────────────────┘         └───────────────────┘
         ▲                            ▲
         │       ┌─────────┐          │
         └───────│  目标   │──────────┘
                 │  平衡   │
         ┌───────│         │──────────┐
         │       └─────────┘          │
         ▼                            ▼
┌──────────────────┐    ┌────────────────────────┐
│  完整的上下文可见性│    │  严格的范围边界         │
│  用于上下文感知    │    │  用于条件生成           │
└──────────────────┘    └────────────────────────┘
```

解决方案：**将"可见性"与"范围"分离**——给分析师完整的项目上下文用于风险评估和前置条件设置，但在代码层面实施护栏，限制条件生成仅限于已选中的项目。

---

## 2. 设计原则

### 原则一：架构师摄入完整项目

架构师接收**全部**项目需求和**全部**业务流程，不受用户选择的影响。其分析覆盖整个项目全景。

### 原则二：上下文边界是显式的，而非隐式的

蓝图包含一个 `contextBoundary` 字段，显式地分隔：
- **范围内**（selectedEpicIds、selectedFlowIds）：分析师的生成目标
- **范围外**（dependencyWarning、riskEpicTree 中未选中的史诗）：仅上下文感知

### 原则三：分析师有护栏，而非信息缺口

分析师可以看到完整的蓝图，但其提示词中包含一个**范围护栏**：
- 仅为 `contextBoundary.selectedEpicIds` / `selectedFlowIds` 中的项目生成条件
- 其他所有内容仅用于前置条件设置和风险评估
- 异常流程提案携带一个 `routing` 字段来指示应由哪个阶段处理它们

### 原则四：路由将异常与常规批次工作分离

异常流程提案带有 `routing` 字段标记（`stage-1`、`stage-2` 或 `stage-3`），确保跨边界的错误猜测场景由适当的分析师阶段处理——而不是被倒入错误的批次中。

---

## 3. 架构概览

```
                        ┌─────────────────────────────────────┐
                        │         数据库（项目数据）             │
                        │  ┌───────────────────────────────┐  │
                        │  │ requirements（全部，含.deps）   │  │
                        │  │ business_flows（全部，含steps） │  │
                        │  │ persistent_coverage             │  │
                        │  └───────────────────────────────┘  │
                        └─────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  编排器 — ensureGlobalBlueprint()                                 │
│                                                                    │
│  ┌─ 步骤1：获取 ──────────────────────────────────────────────┐ │
│  │  allRequirements ← repo.getAllRequirements(projectId)      │ │
│  │  allFlows ← repo.getAllFlows(projectId)  (含steps[])       │ │
│  │  coverage ← repo.getProjectCoverage(projectId)              │ │
│  │  selectedEpicIds ← params.requirementIds                    │ │
│  │  selectedFlowIds ← params.flowIds                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ 步骤2：构建LLM输入 ──────────────────────────────────────┐ │
│  │  userMessage = {                                          │ │
│  │    allRequirements,   // 完整项目，不过滤                  │ │
│  │    allFlows,          // 完整项目，含步骤DAG               │ │
│  │    selectedEpicIds,   // 用户的范围边界                    │ │
│  │    selectedFlowIds,   // 用户的范围边界                    │ │
│  │    existingCoverage,  // 已覆盖的条件                      │ │
│  │  }                                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ 步骤3：LLM生成蓝图 ──────────────────────────────────────┐ │
│  │  GlobalTestBlueprint {                                     │ │
│  │    contextBoundary: {                                      │ │
│  │      selectedEpicIds, selectedFlowIds,                     │ │
│  │      allEpicIds, allFlowIds, dependencyWarning             │ │
│  │    },                                                      │ │
│  │    riskEpicTree:        // 对所有史诗打分                  │ │
│  │    strategicGuidance,   // 项目级                          │ │
│  │    anomalousFlowProposals: [ { ..., routing } ],           │ │
│  │    sharedStateInferences                                   │ │
│  │  }                                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                         │                                        │
│  ┌─ 步骤4：缓存与注入 ───────────────────────────────────────┐ │
│  │  缓存键 = SHA-256(allRequirements + allFlows)             │ │
│  │  将globalBlueprint注入到每个批次的inputState              │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼  globalBlueprint 注入到所有批次
         │
┌────────┴────────────────────────────────────────────────────────┐
│  每批次 LangGraph                                                │
│                                                                    │
│  ┌─ 分析师读取蓝图 ──────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  contextBoundary.selectedEpicIds  →  生成条件               │   │
│  │                                                             │   │
│  │  contextBoundary.dependencyWarning →  设置前置条件           │   │
│  │                                                             │   │
│  │  riskEpicTree（未选中的史诗）→  仅校准风险                   │   │
│  │                                                             │   │
│  │  sharedStateInferences        →  添加到前置条件数组          │   │
│  │                                                             │   │
│  │  anomalousFlowProposals:                                    │   │
│  │    routing=stage-1/2  →  若匹配批次则生成                     │   │
│  │    routing=stage-3    →  跳过（在第3阶段处理）               │   │
│  │                                                             │   │
│  │  ★ 护栏：绝不生成超出范围史诗的条件                           │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 契约变更

### GlobalTestBlueprint

```typescript
interface GlobalTestBlueprint {
  // === 范围边界（新增）===
  contextBoundary: {
    selectedEpicIds: string[];     // 用户选中的史诗 — 分析师的目标
    selectedFlowIds: string[];     // 用户选中的流程
    allEpicIds: string[];          // 完整项目的史诗（用于上下文）
    allFlowIds: string[];          // 完整项目的流程
    dependencyWarning: string[];   // 选中项所依赖的未选中史诗
  };

  // === 现有字段 ===
  strategicGuidance: string;
  riskEpicTree: RiskEpicTreeNode[];    // 对所有史诗打分，不仅限于选中的
  anomalousFlowProposals: AnomalousFlowProposal[];
  sharedStateInferences: string[];
}
```

### AnomalousFlowProposal（含路由）

```typescript
interface AnomalousFlowProposal {
  title: string;
  trigger: string;
  expectedBehavior: string;
  riskLevel: 'high' | 'medium' | 'low';
  routing?: 'stage-1' | 'stage-2' | 'stage-3';  // 新增：默认为stage-3
}
```

路由语义：
| 值 | 含义 | 处理器 |
|-------|---------|---------|
| `stage-1` | 属于特定史诗的条件批次 | 分析师第1阶段 |
| `stage-2` | 属于流程集成测试 | 分析师第2阶段 |
| `stage-3`（默认） | 通用错误猜测、跨边界场景 | 分析师第3阶段 |

---

## 5. 提示词设计

### 5.1 架构师系统提示词（关键指令）

```
你的输入包含：

1. allRequirements[] — 全部项目需求（含dependencies字段）
2. allFlows[] — 全部业务流程（含完整的步骤序列）
3. selectedEpicIds[] — 用户选中的史诗ID
4. selectedFlowIds[] — 用户选中的流程ID

你的工作分为四个阶段：

阶段A — 上下文边界映射
  对于allEpicIds中的每个史诗，检查它是否在selectedEpicIds中。
  对于每个选中的史诗，检查它的依赖是否也被选中。
  如果没有，将未选中的依赖添加到contextBoundary.dependencyWarning。

阶段B — 全项目风险树
  对项目中的每个史诗打分，不仅仅是选中的那些。
  未选中的史诗也必须打分，备注以"[OUT-OF-SCOPE]"前缀开头。

阶段C — 战略指导
  在整个项目范围内推断跨领域关注点。
  注意跨边界交互（选中的模块调用未选中的模块API）。

阶段D — 带路由的异常流程
  生成2-5个异常流程。为每个分配一个routing值：
  - stage-1：异常属于特定史诗的批次
  - stage-2：异常属于流程集成测试
  - stage-3（默认）：通用错误猜测
```

### 5.2 分析师提示词 — 范围护栏（注入部分）

```
## 全局测试蓝图 — 仅供参考

下面的蓝图包含项目范围的上下文。请遵循以下规则：

1. contextBoundary.selectedEpicIds + selectedFlowIds → 你的测试目标。
   仅为这些生成条件。

2. contextBoundary.dependencyWarning → 仅用于前置条件设置。
   将它们作为前置条件添加。绝不为它们生成条件。

3. riskEpicTree 中超出选中ID的条目 → 仅用于风险校准。
   使用它们调整范围内项的优先级。

4. sharedStateInferences → 添加到前置条件数组。绝不为它们生成条件。

5. anomalousFlowProposals：
   - routing=stage-3 → 跳过（第3阶段会处理）
   - routing=stage1/2 → 若在當前批次範圍內則生成

★ 铁律：绝不为超出此批次范围的需求或流程生成测试条件。
```

---

## 6. 数据流变更

### 6.1 变更前（原始）

```
用户勾选史诗A、史诗B               用户勾选"用户注册"流程
         │                                         │
         ▼                                         ▼
  filteredReqs = [A, B]                  filteredFlows = [Registration]
         │                                         │
         ▼                                         ▼
  架构师看到：A, B                    架构师看到：{ steps: [] }
         │                                         │
         ▼                                         ▼
  蓝图覆盖：A, B                  无依赖信息可用
```

### 6.2 变更后（重构后）

```
用户勾选史诗A、史诗B               用户勾选"用户注册"流程
         │                                         │
         ▼                                         ▼
  allReqs = [A, B, C, D, E]              allFlows = [Registration, Login, Checkout]
  selected = [A, B]                      selectedFlows = [Registration]
         │                                         │
         ▼                                         ▼
  架构师看到：全部5个史诗            架构师看到：全部3个流程含steps[]
         │                                         │
         ▼                                         ▼
  蓝图：
    contextBoundary.selectedEpicIds = [A, B]
    contextBoundary.allEpicIds = [A, B, C, D, E]
    contextBoundary.dependencyWarning = [C]   // A依赖C，C未被选中
    riskEpicTree = A(high), B(medium), C(high), D(low), E(low)
    strategicGuidance: "A依赖C（未选中）。前置条件：C必须已部署。"
```

---

## 7. 边界情况处理

| 场景 | 架构师行为 | 分析师行为 |
|----------|-------------------|-----------------|
| 用户选中1个史诗，依赖3个未选中的 | `dependencyWarning` 列出全部3个；`riskEpicTree` 对全部4个打分 | 仅为选中的史诗生成条件；前置条件提及全部3个依赖 |
| 用户选中了全部史诗 | `selectedEpicIds === allEpicIds`；`dependencyWarning` 为空 | 全部正常生成 |
| 项目有20个史诗，用户选中2个 | 架构师对全部20个打分（18个标记 `[OUT-OF-SCOPE]`）；指导涵盖跨模块风险 | 仅为2个生成条件；风险校准考虑全局上下文 |
| 异常流程跨越选中 + 未选中模块 | `anomalousFlowProposals` 描述完整场景；`routing: stage-3` | 第1/2阶段跳过；第3阶段生成条件（不受范围限制） |
| 未选中任何流程（空选择） | `selectedFlowIds = []`，`allFlowIds` 填充项目流程 | 不生成流程条件；跳过流程级别的 `riskEpicTree` 条目 |
| 使用相同项目数据重新运行 | 从缓存加载蓝图（缓存命中） | 同上 |

---

## 8. 影响总结

| 文件 | 变更类型 | 描述 |
|------|-------------|-------------|
| `shared/contracts/index.ts` | 修改 | `GlobalTestBlueprint` 添加 `contextBoundary`；`AnomalousFlowProposal` 添加可选的 `routing` |
| `server/modules/ai-test-gen/graph/state.ts` | 修改 | `TestGenState` 添加 `selectionBoundary: { selectedEpicIds, selectedFlowIds }` |
| `server/modules/ai-test-gen/graph/prompts.ts` | 修改 | 架构师提示词：4阶段结构 + 移除批次特定指令；分析师提示词：范围护栏 + 结构化蓝图注入 |
| `server/modules/ai-test-gen/graph/structured-output/architect.ts` | 修改 | Zod schema 添加 `contextBoundary`、`routing`；normalize() 添加 routing 默认值兜底 |
| `server/modules/ai-test-gen/orchestrator.ts` | 修改 | `ensureGlobalBlueprint` 获取全部需求/流程；`computeRequirementHash` 排除选择信息；synthetic state 传递 `selectionBoundary` |
| `server/modules/ai-test-gen/business-flow-blueprint.ts` | 修改 | 接受 `requirementsMap` 参数；用真实映射数据填充 `steps[]`（含 title、acceptanceCriteria） |
| `server/modules/ai-test-gen/graph/nodes/preparation.ts` | 修改 | 回退 LLM 路径适配新函数签名 |
| `docs/06-ai-test-generation-strategy.en.md` | 修改 | 第3.2节更新以反映4项职责 + contextBoundary |

---

## 9. 迁移指南

### 步骤1：更新契约

向 `GlobalTestBlueprint` 添加 `contextBoundary`，向 `AnomalousFlowProposal` 添加 `routing`。

### 步骤2：更新结构化输出配置

在 `architect.ts` 中添加新的 Zod schema 字段。

### 步骤3：修复业务流程蓝图

在 `business-flow-blueprint.ts` 中将 `steps: []` 替换为实际映射的步骤数据。

### 步骤4：重写架构师提示词

用新的4阶段版本替换 `buildArchitectSystemPrompt`。更新 `buildArchitectUserMessage` 以接受完整项目数据 + 范围边界。

### 步骤5：修复编排器数据流

- 更改 `ensureGlobalBlueprint` 以获取全部需求和全部流程
- 向合成状态中添加 `selectionBoundary`（含 `selectedEpicIds` 和 `selectedFlowIds`）
- 更改缓存键哈希，排除用户选择信息，仅基于全量项目数据

### 步骤6：添加分析师护栏

使用范围护栏更新 `buildAnalystSystemPrompt` 中的蓝图注入部分。按 `contextBoundary` → 各字段分节注入，替代原始 JSON dump。

### 步骤7：更新策略文档

将 `06-ai-test-generation-strategy.en.md` 第3.2节与新职责同步。

---

## 10. 已知问题与设计决策

代码审查中发现以下问题，已在本文档中记录并纳入设计考量：

### 问题1：缓存键必须排除选择边界

**问题**：原始 `computeRequirementHash` 将 `requirementIds`（用户选择）包含在哈希输入中。重构后，同一项目的全局蓝图会为每种不同的选择组合重新计算，导致缓存失效。

**决策**：缓存键 = 仅 `SHA-256(allRequirements + allFlows)`。选择边界（`selectedEpicIds`、`selectedFlowIds`）作为独立输入数据传递给架构师，不参与哈希。这确保全局蓝图每次项目状态变化只缓存一次，不受用户选择影响。

**实现注意**：`computeRequirementHash` 必须重写，忽略 `params.requirementIds` 和 `params.flowIds`。

### 问题2：架构师系统提示词不能包含"针对当前批次"指令

**问题**：当前系统提示词（第619行）写道：*"Be specific to THIS batch's requirements and flows"*。这与重构目标（项目级分析）直接矛盾。

**决策**：完全移除此指令。替换为：*"Analyze the FULL project scope described in `allRequirements` and `allFlows`, not just the selected subset."*

### 问题3：SyntheticState 需要选择边界字段

**问题**：当前 `syntheticState`（orchestrator.ts 第717行）只包含 `currentBatch`（选中需求）。架构师没有方法区分"全部"和"选中"。

**决策**：在 `TestGenState` 中添加 `selectionBoundary: { selectedEpicIds: string[]; selectedFlowIds: string[] }`。架构师提示词引用此字段来构建输出中的 `contextBoundary`。

### 问题4：分析师提示词蓝图注入必须结构化

**问题**：当前代码将整个蓝图作为原始 JSON 注入（`JSON.stringify(state.globalBlueprint, null, 2)`）。重构后蓝图包含完整项目数据，会显著增加提示词 token 消耗。

**决策**：按分节注入：
1. 首先注入 `contextBoundary` 并标注
2. 然后分别注入各字段及使用说明
3. 让分析师能语义化解析蓝图，而非面对不透明的 JSON

### 问题5：业务流程步骤映射需要需求查询

**问题**：`PipelineBusinessFlowBlueprintStep` 需要 `requirementTitle` 和 `acceptanceCriteria`，但 `BusinessFlowStep` 只有 `requirementIds`（字符串数组，非对象）。

**决策**：`buildBusinessFlowBlueprints` 必须接受 `requirementsMap: Map<string, Requirement>` 参数来按 ID 查找标题和验收标准。此 map 在编排器中从 `allRequirements` 构建，然后再调用 `buildBusinessFlowBlueprints`。

### 问题6：路由字段在 Zod Normalizer 中需要默认值兜底

**问题**：重构设计说 `routing` 默认为 `stage-3`，但 Zod schema 中它是可选的。如果 LLM 返回空字符串或无效值，解析会失败。

**决策**：在 `architect.ts` 的 `normalize` 函数中添加兜底：
```typescript
routing: (input.routing as string) || 'stage-3',
```

---

## 11. 验证标准

| 标准 | 如何验证 |
|-----------|---------------|
| 架构师看到全部需求 | 服务器日志："Architect input: N reqs (M selected)" — N 应等于项目总数，而非选中数量 |
| 蓝图包含超范围项 | 检查 `globalBlueprint.riskEpicTree` 中是否存在未选中集中的史诗 |
| 分析师从不生成超范围条件 | 仅在史诗A上运行一个批次；检查测试条件中是否有任何史诗B的引用 |
| dependencyWarning 准确无误 | 选择依赖史诗C的史诗A；验证 `dependencyWarning` 包含C |
| 缓存键覆盖完整项目 | 更改选中集之外的一个需求；验证缓存失效 |
| 异常流程路由生效 | 生成带有 `routing: stage-1` 的异常；验证它出现在第1阶段批次中 |
