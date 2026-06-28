# AI 自动化测试生成 — 产品需求文档 (PRD)
> **版本**: v2.1 | **更新日期**: 2026-06-27
> **性质**: 可实施改进规格 | **语言**: 中文（术语附英文原名）
> **v2.1 变更说明**：补充 §3—§9 中缺失的实现规格（映射表、写入路径、枚举对齐、约束执行机制），新增 §12 实施检查清单，修复内部不一致，收缩偏差 #1/#3 标记为可验收。

---

## 1. 产品概述

AI 自动化测试生成系统（以下简称 "Test Gen"）基于 ISTQB 国际测试标准，通过 4 个协作 Agent（Architect、Analyst、Designer、Quality）自动分析业务需求，生成人类可读且机器可执行的测试用例。

系统核心设计理念：
- **全局视野 vs 局部执行**：Architect 在批次循环前生成全局蓝图，下游 Agent 按批次执行
- **持久化增量覆盖**：已覆盖条件写入数据库，跨批次/跨运行去重
- **人机审核**：4 个 Checkpoint 支持编辑、反馈与重试

### 1.1 适用标准

| 标准 | 相关内容 |
|------|----------|
| **ISTQB CTFL 4.0** | 第 2.2 节 测试级别；第 4.2 节 黑盒测试技术；第 4.4 节 基于经验的测试技术 |
| **ISO/IEC/IEEE 29119-1** | 条款 4 测试过程；条款 5.3 测试设计 |
| **ISO/IEC/IEEE 29119-3** | 条款 9.4 测试用例规范（action + expected per step） |
| **ISO/IEC/IEEE 29119-4** | 条款 5 基于规范的测试技术；条款 7 覆盖率度量 |
| **IEEE 829-2008** | 条款 8 测试规程规范（原子化、可重复步骤） |

---

## 2. 宏观流程架构

### 2.1 4-Agent 执行流

底层 LangGraph 维持固定的 4 节点执行流 + 4 个人机审核节点：

```
Architect → Checkpoint 0 (Review Blueprint)
         → Analyst  → Checkpoint 1 (Review Conditions)
         → Designer → Checkpoint 2 (Review Draft Cases)
         → Quality  → Checkpoint 3 (Final Review & Warnings)
         → Complete
```

| 节点 | Agent Name | 职责 |
|------|-----------|------|
| **Architect** | `test_architect` | 生成全局测试蓝图（Global Test Blueprint）；计算频次/覆盖率快照 |
| **Analyst** | `test_analyst` | 按 Stage 模式生成测试条件（Test Conditions） |
| **Designer** | `test_designer` | 将条件翻译为原子化测试步骤 |
| **Quality** | `quality_manager` | 6 维度评审 + 原子性自纠正 + 覆盖矩阵持久化 |

### 2.2 Orchestrator 3-Stage 路由调度

Orchestrator 在批次循环前一次性执行 Architect，然后按 3 个 Stage 串行调度：

| Stage | Analyst Mode | 输入 scope | 批次数 |
|-------|-------------|-----------|--------|
| **Stage 1** | `STAGE_1_REQUIREMENT` | 按 Epic 分组的用户选中需求 | `epics.length` 个 batch |
| **Stage 2** | `STAGE_2_FLOW` | 用户选中的 Business Flows | 1 个 batch（所有选中 flow 合并） |
| **Stage 3** | `STAGE_3_ERROR_GUESSING` | 项目全部需求（按受影响 Epic 分批，见偏差 #4） | `affectedEpicBatches.length` 个 batch；无 anomalousFlowProposals 时降级为 1 batch（全量） |

> **总批次数** = `Stage 1 batches + (有 flows ? 1 : 0) + affectedEpicBatches.length`
> 其中 `affectedEpicBatches = directiveTestStrategy.anomalousFlowProposals` 去重后的 epic 数；无 proposals 时降级为 1。

所有 Stage 完成后，Orchestrator 调用 `deduplicateTestCases` 对全部最终用例按 title 去重。

---

## 2.1 语义去重实现细节

语义去重在 Analyst Node 完成条件推导后立即执行，确保重复条件在进入下一个 Agent 前被移除。

### 2.1.1 触发时机

每个 Stage 的 Analyst Node 完成 LLM 条件推导后立即执行语义去重：

| Stage | 触发时机 | 去重范围 |
|-------|---------|---------|
| **Stage 1** | Analyst Node 完成 `testConditions` 后 | 当前 batch 的所有条件（来自多个 ISTQB 技术） |
| **Stage 2** | Analyst Node 完成 `testConditions` 后 | selectedFlows 的所有条件 |
| **Stage 3** | Analyst Node 完成 `testConditions` 后 | 所有 error guessing 条件 |

### 2.1.2 去重算法

**输入**：所有条件的 `id`, `title`, `condition` 文本

**LLM 提示词**：
```
You are a test condition deduplication expert. Given a list of test conditions, identify which ones are semantic duplicates — i.e., they test the SAME test scenario even though the wording differs.

Rules:
1. Two conditions are semantic duplicates if they test the SAME test scenario
2. Two conditions are NOT duplicates if they test different aspects (different inputs, different paths, different error conditions, or different coverage dimensions)
3. When a group of conditions are semantic duplicates, keep the one with the clearest title and most specific wording
```

**输出**：
```json
{
  "groups": [
    { "indices": [0, 3], "keptIndex": 0, "reason": "Same scenario: login with valid credentials" }
  ],
  "keptIndices": [0, 1, 2]
}
```

### 2.1.3 实现位置

**文件**：`server/modules/ai-test-gen/graph/nodes/analyst.ts`

**逻辑**：
```typescript
// 获取 LLM 的 validated.testConditions 后
if (dedupedConditions.length > 1) {
  // 构建比较 payload
  // 调用 callLLMWithStructuredOutput 进行语义相似度分析
  // 过滤掉 removedIndices 中的条件
}
```

### 2.1.4 与 Orchestrator 层去重的关系

| 去重层级 | 触发时机 | 范围 | 算法 |
|---------|---------|------|------|
| **Analyst Node 内** | 每个 Stage 完成后 | 单个 Stage 的所有条件 | LLM 语义相似度 |
| **Orchestrator 层** | 所有 Stage 完成后 | 全部最终用例 | Text (title) + LLM 语义 |

Analyst Node 内的语义去重是**第一道防线**，防止重复条件进入下一个 Stage。Orchestrator 层的去重是**最终合并**，处理跨 Stage 的重复用例。

---

## 3. Architect 节点（指令式测试策略引擎）

> **定位对标**：ISTQB CTAL-TM Test Manager — 在测试执行前制定 Test Strategy，通过风险分析 + 技术指派 + 覆盖规划来指导下游所有测试活动。

### 3.1 核心设计原则：指令式（Directive）

Architect 产出的是**指令**（directive），不是建议（suggestion）。下游 Analyst **必须遵守** Architect 的以下约束：

| 指令类型 | 强制力 | 违反后果 |
|----------|--------|----------|
| 覆盖策略（coverageDirective） | **硬约束** | `skip` 标记的 requirement 在 `buildBatchInputState` 中从 `allowedReqIds` 排除；Analyst Zod 校验 `requirementId ∈ allowedReqIds` 自然拒绝 skip 项 |
| 风险优先级（riskPriority） | **硬约束** | Analyst 条件 `priority` 不得低于 `riskPriority`；`createAnalystOutputProfile` 接收 `priorityFloor` 映射，Zod 校验拒绝 |
| 推荐技术（recommendedTechniques） | **软约束** | prompt 强调但不做 Zod 校验；偏离时必须说明理由，Quality TS 程序化比对后写入 `deviations[]` |
| 跨-flow 交接目标（integrationFocus） | **软约束** | prompt 注入；未覆盖计入 `coverageGaps[]`，CP3 提醒用户 |
| 共享状态前置条件（sharedStatePresets） | **软约束** | prompt 追加；缺失计入 `validationWarnings[]` |

**优先级排序**（硬约束校验用）：`critical > high > medium > low`。Analyst 条件 priority 低于 epicDirective.riskPriority 时，ZodError 消息格式：`"Condition {id} priority '{actual}' is below Architect's riskPriority floor '{floor}' for epic {epicId}"`。

**共享排序函数**（定义在 `helpers.ts` 中，供约束校验和偏差记录共用）：

```typescript
// helpers.ts
const PRIORITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 } as const;
type RiskLevel = keyof typeof PRIORITY_ORDER;

function meetsPriorityFloor(actual: RiskLevel, floor: RiskLevel): boolean {
  return PRIORITY_ORDER[actual] >= PRIORITY_ORDER[floor];
}
```

### 3.2 执行模型：纯门外（Orchestrator-level only）

Architect **只在 Orchestrator 级别运行一次**，不在 per-batch LangGraph 内。

**per-batch 的 `preparation` 节点职责重新定义**：

| 原职责 | 新职责 | 理由 |
|--------|--------|------|
| ~~LLM fallback（forceRedesign 时再调 Architect LLM）~~ | **删除** | CP0 `forceRedesign=true` 时，用户在 CP0 Review 阶段直接操作（此时尚未进入 batch loop），Orchestrator 检测到 checkpoint result 中 `forceRedesign=true` 后，重调 `ensureGlobalBlueprint(forceArchitect=true)`，重新触发 CP0 review。**preparation 节点不参与此流程**——forceRedesign 只在 CP0（batch loop 之前）发生，preparation 不需要透传任何 forceRedesign 标记 |
| Token 预算估算 | **删除** | 当前是死代码（无下游消费） |
| 频次扫描 → `observer.onStep` | **改造**：结果注入 `state.requirementFrequencies`，Analyst prompt 中以 `## High-Frequency Requirements` 段落引用 | 当前结果被丢弃；`requirementFrequencies` 字段新增到 `TestGenState`，类型为 `Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }>` |
| 覆盖率快照 | **保留 + 增强** | 程序化过滤：已覆盖 conditionHash+technique 的 requirement 在 `buildBatchInputState` 中从 `allowedReqIds` 排除（复用现有 `requirementId ∈ allowedReqIds` Zod 校验）；同时 Analyst prompt 注入 `## Already Covered Requirements` 段落提示 LLM 哪些需求已有覆盖（仅 Reference Only，不可生成条件） |

per-batch preparation 节点简化为：**纯 TS 确定性计算 + 蓝图分发**。不再有任何 LLM 调用。

### 3.3 缓存机制（改进）

**当前问题**：`computeRequirementHash` 只基于用户**选中**的 requirementIds 做哈希。两次运行选了不同 subset → hash 不同 → 完全重跑 Architect，即使蓝图内容 90% 相同。

**改进方案**：

```typescript
// 改造 orchestrator.ts computeRequirementHash
cacheKey = SHA-256(
  ALL project requirements.sort(by id).map(r => `${r.id}:${r.title}:${r.description ?? ''}`)
  + ALL project flows.sort(by id).map(f => `${f.id}:${f.name}:${f.type}`)
)
```

- hash 基于**全项目**需求+流的内容，与用户选择无关
- 只有需求/流本身被编辑 → hash 变 → 缓存 miss → 重跑
- 用户多选/少选 requirement → hash 不变 → 直接复用
- **旧缓存兼容**：缓存表 `test_gen_architect_cache` 中存储的旧结构 `GlobalTestBlueprint` 与新结构 `DirectiveTestStrategy` schema 不同。缓存命中时需校验 version 标记：缓存行新增 `schema_version` 列（默认 `'v1'`），新结构写入 `'v2'`；读取时若 `schema_version !== 'v2'` 视为 miss

| 场景 | 当前行为 | 改进后行为 |
|------|---------|-----------|
| 需求文本不变，换了选择 subset | 缓存 miss，重跑 Architect | 缓存 hit，零 LLM |
| 编辑了某个 requirement 的标题 | 缓存 miss，重跑 | 缓存 miss，重跑 |
| `forceArchitect=true` | 强制重跑 | 强制重跑（不变） |
| 新增了一个 flow | 缓存 miss，重跑 | 缓存 miss，重跑 |
| 旧 `v1` 缓存命中 | — | 视为 miss（schema 不兼容），重跑并写 `v2` |

### 3.4 Architect 输入（改进）

**当前问题**：Architect 只看 requirement id + title + level，无法做真正的风险分析。

**改进后 Architect 接收的输入**：

```typescript
{
  requirements: [{ id, title, description, acceptanceCriteria[], level, parentId }],
  epics:         [{ id, title, childRequirementCount }],
  businessFlows: [{ id, name, type, steps: [{ sequence, actionSummary, requirementId }] }],
  existingCoverage: [{ requirementId, conditionHash, technique, testCaseCount }],
  crossRefs:     [{ requirementId, referencedByFlowIds[], coOccurringReqIds[] }],
  projectContext: { name, pages[], endpoints[] }
}
```

**关键新增**：
- `description` + `acceptanceCriteria[]`：让 Architect 能真正理解需求内容做风险评估。**数据来源**：`requirementRepo.listByProject(projectId)` 已返回完整 requirement 对象（含 `description` 字段），`ensureGlobalBlueprint` 构造 `syntheticState` 时改为传入全量需求详情而非仅 id/title/level
- `crossRefs`（跨引用图）：**计算方式**——在 Orchestrator `ensureGlobalBlueprint` 之前，遍历 `allProjectFlows` 的 steps。每个 step 绑定一个 requirementId（`PipelineBusinessFlowBlueprintStep.requirementId` 保持单数，因为原子操作一步只对应一个需求）。**coOccurringReqIds** 定义为同 flow 内相邻 step 的 requirementId 集合（不含自身）：

  ```typescript
  // ensureGlobalBlueprint 中 crossRefs 计算逻辑
  function computeCrossRefs(flows: BusinessFlow[]): CrossRefItem[] {
    const reqToFlows = new Map<string, { flowIds: Set<string>; coOccurring: Set<string> }>();
    for (const flow of flows) {
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        const entry = reqToFlows.get(step.requirementId) ?? { flowIds: new Set(), coOccurring: new Set() };
        entry.flowIds.add(flow.id);
        // 相邻步（前/后一步）的 requirementId 视为 co-occurring
        if (i > 0) entry.coOccurring.add(flow.steps[i - 1].requirementId);
        if (i < flow.steps.length - 1) entry.coOccurring.add(flow.steps[i + 1].requirementId);
        reqToFlows.set(step.requirementId, entry);
      }
    }
    return [...reqToFlows.entries()].map(([reqId, data]) => ({
      requirementId: reqId,
      sharedByFlowIds: [...data.flowIds],
      coOccurringReqIds: [...data.coOccurring],
      conflictRisk: data.flowIds.size > 1 ? 'high' : 'low',
    }));
  }
  ```

- `businessFlows.steps`：**改造 `buildBusinessFlowBlueprints`**，不再清空 `steps: []`，而是保留 `actionSummary` 和 `requirementId`（保持单数）

### 3.5 Architect 输出：Directive Test Strategy（指令式测试策略）

替代原有的描述性 `GlobalTestBlueprint`，输出结构化指令：

```typescript
interface DirectiveTestStrategy {
  // ── 1. 全局策略 ──
  strategicGuidance: string;       // 保留：3-8 句指令性段落
  sharedStatePresets: string[];    // 保留并增强：每个 item 必须出现在 Designer preconditions 中

  // ── 2. 跨引用拓扑 ──（新增）
  crossReferenceMap: Array<{
    requirementId: string;
    sharedByFlowIds: string[];      // 哪些 flow 共享此 requirement
    coOccurringReqIds: string[];    // 同 flow 相邻步的 requirementId（co-occurring 关系）
    conflictRisk: 'high' | 'low';   // 多 flow 引用同一 req → 数据竞争风险
  }>;

  // ── 3. 每-Epic 指令（强化原 riskEpicTree）──
  epicDirectives: Array<{
    epicId: string;
    epicTitle: string;
    riskPriority: 'critical' | 'high' | 'medium' | 'low';
    riskRationale: string;        // WHY：基于什么特征判断的
    recommendedTechniques: ('EP' | 'BVA' | 'Decision Table' | 'State Transition' | 'Use Case')[];
    coverageDirective: 'full'       // 完整覆盖：functional + boundary + error + validation
                                | 'standard'   // 标准：functional + 至少 1 条 non-happy
                                | 'skip';      // 已充分覆盖，仅 Reference Only
    focusAreas: string[];          // ["auth state", "quantity boundary", "permission matrix"]
  }>;

  // ── 4. 每-Flow 指令（新增）──
  flowDirectives: Array<{
    flowId: string;
    flowName: string;
    integrationFocus: string[];    // 要验证的跨-req 交接点 ["auth→order", "order→payment"]
    sharedStateConcerns: string[]; // ["session must be valid at step 5", "CSRF token renewal"]
    recommendedTechniques: ('Use Case' | 'State Transition')[];
  }>;

  // ── 5. 异常流种子（保留，用于 Stage 3）──
  anomalousFlowProposals: Array<{
    title: string;
    trigger: string;
    expectedBehavior: string;
    riskLevel: 'high' | 'medium' | 'low';
    affectedRequirementIds: string[];  // 新增：关联到哪些 requirement
  }>;
}
```

**对比原有 Blueprint 的关键变化**：

| 维度 | 原 GlobalTestBlueprint | DirectiveTestStrategy |
|------|----------------------|---------------------|
| `riskEpicTree` | 只有 `riskLevel + notes` | → `epicDirectives`：加了 `recommendedTechniques`、`coverageDirective`、`focusAreas` |
| 无 | → 新增 `flowDirectives` | Stage 2 有程序化指导 |
| `sharedStateInferences` | 字符串数组，Analyst 可忽略 | → `sharedStatePresets`：Designer preconditions 中必须包含 |
| `anomalousFlowProposals` | 无关联 requirement | → 增加 `affectedRequirementIds[]`，Stage 3 可精确去重 |
| 无 | → 新增 `crossReferenceMap` | Stage 2 真正知道哪些 req 是跨-flow 共享的 |
| `strategicGuidance` | 描述性 | 保留但语气从"建议"改为"指令" |

### 3.6 下游消费方式（程序化约束）

Architect 输出不再只是"注入 prompt 让 LLM 阅读"，而是通过 **TS 程序化逻辑** + **分层约束策略** 执行。约束分两级：

#### 硬约束（程序化强制，不遵守就拒绝）

| 指令 | 执行点 | 机制 | 失败处理 |
|------|--------|------|----------|
| `epicDirectives[].coverageDirective = 'skip'` | Orchestrator `buildBatchInputState` | 遍历 `epicDirectives`，对 `coverageDirective='skip'` 的 epic，将其下 `rootGroups` 中的 requirement 从 `allowedReqIds` 中**排除**；`allowedReqIds` 不含 skip 项 → Analyst 现有 Zod 校验 `requirementId ∈ allowedReqIds` 自然拒绝 | 排除后的 requirement 不会出现在 Analyst 输入中，无需额外 Zod 层拒绝 |
| `epicDirectives[].riskPriority` | Analyst `createAnalystOutputProfile` | `createAnalystOutputProfile` 签名扩展为 `(allowedReqIds, priorityFloor?: Map<epicId, RiskLevel>)`；`validateRequirementIds` 扩展为同时校验 `priority` ≥ `priorityFloor[condition.epicId]` | ZodError → Analyst Retry（附带 feedback："Architect 指定此 Epic 为 {riskPriority}，条件 {id} 的 priority '{actual}' 低于阈值 '{floor}'"）。重试上限 2 次，超限后降级为 `warning` 级别 deviations（不阻断流程） |

#### 软约束（prompt 强调 + 偏差记录，允许偏离但不静默）

| 指令 | 执行点 | 机制 | 偏离处理 |
|------|--------|------|----------|
| `epicDirectives[].recommendedTechniques` | Analyst prompt 注入 | `buildAnalystUserMessage` 中程序化注入 `## Architect-Recommended Techniques per Epic` 段落 | **TS 程序化比对**：Quality 节点完成后，TS 代码遍历条件，将 `primaryTechnique` 与 `epicDirectives[].recommendedTechniques` 交叉比对，未匹配的写入 `deviations[]`，type=`technique_mismatch` |
| `flowDirectives[].integrationFocus` | Stage 2 prompt 注入 | `buildStageInstructions('STAGE_2_FLOW')` 中程序化注入 `## Integration Focus Targets` 段落 | Quality 节点 TS 程序化比对：条件中无任何一条覆盖某 `integrationFocus` 项 → 写入 `coverageGaps[]`，CP3 提醒用户 |
| `flowDirectives[].sharedStateConcerns` | Stage 2 prompt 注入 | `buildStageInstructions('STAGE_2_FLOW')` 中程序化注入 | Designer preconditions 缺失 → Quality 节点计入 `validationWarnings[]`（TS 遍历 finalTestCases 的 preconditions，检查是否包含 `sharedStateConcerns` 关键词） |
| `sharedStatePresets[]` | Designer prompt 注入 | `buildDesignerUserMessage` 中程序化追加 `## Mandatory Shared State Preconditions` 段落 | 缺失 → Quality 节点 TS 比对写入 `validationWarnings[]` |
| `crossReferenceMap[]` | Analyst prompt 注入 | 汇总高频节点 + conflictRisk 标记注入 `buildAnalystUserMessage` | 无强制 — 仅供参考 |
| `anomalousFlowProposals[].affectedRequirementIds` | Stage 3 去重 | `coverage_check_query` + `affectedRequirementIds` 双重匹配 | 无强制 — 只影响去重精度 |

#### Deviations 记录结构

当 Analyst 偏离软约束时，**Quality 节点完成 LLM 审核后**，由 **TS 程序化代码**比对 Architect directive 与 Analyst 实际输出，生成偏差记录：

```typescript
interface DeviationRecord {
  type: 'technique_mismatch' | 'coverage_gap' | 'missing_preset';
  architectDirective: string;   // "Architect recommended: Decision Table"
  actualBehavior: string;       // "Analyst chose: EP"
  rationale: string;            // Analyst 的 techniqueRationale（如有）
  severity: 'info' | 'warning'; // info=偏离但有合理 rationale; warning=偏离且 rationale 未提及 Architect 推荐（可能未考虑 Architect 指令）
  conditionId?: string;         // 关联的条件 ID（technique_mismatch 时有值）
}

// TS 程序化计算逻辑（quality.ts 内，LLM 调用完成后执行）：
function computeDeviations(
  conditions: TestCondition[],
  epicDirectives: EpicDirective[],
  flowDirectives: FlowDirective[],
  finalTestCases: NlTestCase[],
  sharedStatePresets: string[],
): DeviationRecord[] { ... }
```

所有 deviations 在 CP3（Final Review）展示给用户，由用户决定是否接受。

**`coverageGaps` 记录结构**（当 Stage 2 未覆盖某 integrationFocus 项）：

```typescript
interface CoverageGapRecord {
  flowId: string;
  flowName: string;
  missedFocus: string;    // 未被条件覆盖的 integrationFocus 项
  relatedConditionIds: string[]; // 同 flow 下已覆盖的条件（辅助判断）
}
```

#### 为什么是混合约束而非全硬约束

1. **LLM 不确定性**：Architect 基于 id+title+description 做风险评估，但只有 Analyst 调用 `requirement_detail_query` 后才能看到 AC 细节。如果 Architect 说"用 Decision Table"但 AC 中实际没有多条件组合逻辑，硬约束会强制 Analyst 输出牵强的 Decision Table 条件。
2. **降级保护**：`coverageDirective='skip'` 和 `riskPriority` 是确定性判断（已覆盖=跳过、高风险=不低于 high），冲突概率低，适合硬约束。`recommendedTechniques` 是语义判断，冲突概率中，适合软约束。
3. **可观测性**：软约束不静默 — 所有偏离都有记录，用户在 CP3 能看到 Architect 的原始意图和 Analyst 的偏离理由。

### 3.6a DirectiveTestStrategy → State + Prompt 注入映射表

Architect 的每一条指令从输出到下游消费的完整路径：

| Directive 字段 | 写入 State 字段 | 注入哪个 Agent Prompt | 注入格式 | 约束级别 |
|----------------|----------------|----------------------|---------|---------|
| `strategicGuidance` | `directiveTestStrategy.strategicGuidance` | Analyst `buildAnalystUserMessage` → `## Strategic Guidance` | 原文段落 | 无（背景信息） |
| `sharedStatePresets[]` | `directiveTestStrategy.sharedStatePresets` | Designer `buildDesignerUserMessage` → `## Mandatory Shared State Preconditions` | 编号列表 | 软约束 |
| `crossReferenceMap[]` | `directiveTestStrategy.crossReferenceMap` | Analyst `buildAnalystUserMessage` → `## Cross-Reference Map (High-Frequency Nodes)` | 表格：reqId, flows, risk | 无 |
| `epicDirectives[]` | `directiveTestStrategy.epicDirectives` | Analyst `buildAnalystUserMessage` → `## Epic Directives` | 表格：epic, riskPriority, recommendedTechniques, coverageDirective, focusAreas | 硬+软混合 |
| `flowDirectives[]` | `directiveTestStrategy.flowDirectives` | Analyst `buildStageInstructions('STAGE_2_FLOW')` → `## Flow Directives & Integration Targets` | 表格：flow, integrationFocus, sharedStateConcerns, techniques | 软约束 |
| `anomalousFlowProposals[]` | `directiveTestStrategy.anomalousFlowProposals` | Analyst `buildStageInstructions('STAGE_3_ERROR_GUESSING')` | 列表：title, trigger, affectedRequirementIds | 无 |

**State 字段变更**：`TestGenStateAnnotation` 新增字段：

| 字段 | 类型 | 来源 |
|------|------|------|
| `directiveTestStrategy` | `DirectiveTestStrategy \| undefined` | Architect 输出（Orchestrator 写入 `buildBatchInputState`） |
| `requirementFrequencies` | `Array<{ requirementId: string; occurrenceCount: number; isDuplicateReference: boolean }>` | preparation 频次扫描 |
| `deviations` | `DeviationRecord[]` | Quality 节点 TS 程序化计算 |
| `coverageGaps` | `CoverageGapRecord[]` | Quality 节点 TS 程序化计算 |

**`globalBlueprint` 字段演进**：采用**适配器模式过渡**而非一步类型替换。过渡期 state 并保留两字段：

```typescript
directiveTestStrategy?: DirectiveTestStrategy;  // 新（Phase 3 引入）
globalBlueprint?: GlobalTestBlueprint;          // 旧（消费点逐个迁移后删除）
```

- Phase 3-6 过渡期：两字段并存。新代码通过 `directiveTestStrategy` 访问；旧消费点（未迁移完的部分）继续读 `globalBlueprint`
- Phase 7：`globalBlueprint` 标记 `@deprecated`，所有消费点切换到 `directiveTestStrategy`
- Phase 9：删除 `globalBlueprint` 字段。迁移期间提供 getter 兼容：`get riskEpicTree() { return this.epicDirectives; }`

### 3.7 Checkpoint 0（审核 Architect 输出）

检查点 0 审核的不再是描述性蓝图，而是**指令式策略**。用户可以：

- **调整风险优先级**：将 Architect 标记为 `medium` 的 Epic 上调为 `high` → 后续 batch 的条件力度增大
- **修改覆盖策略**：将 `full` 降级为 `standard` → 减少条件数量
- **增补 focusAreas**：添加 Architect 未识别的特定关注点
- **删除/修改异常流种子**：过滤掉不适用的 anomalousFlowProposals
- **强制重生成**：`forceRedesign=true` → Orchestrator 检测到 CP0 checkpoint result 中 `forceRedesign=true` → 调用 `ensureGlobalBlueprint(forceArchitect=true)` → 重新触发 CP0 review（不清除已选 batch 状态，只替换 `directiveTestStrategy`）。此流程完全不涉及 preparation 节点。

**CP0 编辑生效范围**：Architect 在所有 batch 之前运行，CP0 编辑的 `directiveTestStrategy` 对**所有后续 batch** 生效（无"已跑完 batch 回退"机制）。若用户在 batch 1 已跑完后的 CP1 发现 Architect 指令不合理，应中止运行并重新 start。

---

## 4. Analyst 节点（测试条件生成）

Analyst 是整条管线的核心条件生成器，由 `analystMode` 控制三种分析策略。

### 4.1 Stage 1 — Requirement Analysis（组件级）

| 维度 | 说明 |
|------|------|
| **输入** | 按 Epic 分组的当前 batch 需求（`state.currentBatch`） |
| **角色** | Component Analyst |
| **约束** | 只允许引用 `allowedReqIds`（当前 batch 内的 requirementId），Zod 校验强制执行 |
| **默认 technique** | EP + BVA + Decision Table + State Transition + Use Case |
| **覆盖规则** | 每个 requirement：≥1 happy-path + ≥1 error/boundary/validation；EP 必含 valid+invalid 对 |

**Workflow**：
1. `requirement_detail_query`（所有 batch requirementId 一次性）
2. `flow_detail_query`（可选）
3. `requirement_graph_query`（依赖链展开）
4. `istqb_guide`（加载所有技术指南）
5. 风险评估 → 技术选择 → 条件推导

**条件数量决定规则**：

条件数量由测试技术综合分析推导得出，不设任意数字目标。每种 ISTQB 测试技术独立推导条件，然后合并去重：

| 测试技术 | 推导规则 |
|----------|---------|
| **等价类划分 (EP)** | 每个输入域 → 1 个有效等价类 + 1 个无效等价类 = 至少 2 条 |
| **边界值分析 (BVA)** | 每个数值/长度字段 → 下界、上界、越界 = 至少 3 条 |
| **决策表 (Decision Table)** | 每个规则行 = 1 条 |
| **状态转换 (State Transition)** | 每个有效转换 = 1 条 |
| **使用用例 (Use Case)** | 主路径 + 备选路径 + 异常路径 = 各至少 1 条 |

**去重规则**：
- 同一需求被多个技术覆盖时，**Analyst Node 执行完成后触发 LLM 语义去重**：对所有推导出的条件，LLM 判断是否语义等价（如"输入空用户名"和"不提供凭据"语义相同），保留语义更清晰的一条
- 语义去重在 Analyst Node 内执行（非 prompt 内 LLM 自主调用），确保去重逻辑可控
- 去重后的条件集合即为该 Stage 的最终输出
- 最终数量 = Stage 内所有条件合并后语义去重

### 4.1.1 语义去重实现（Analyst Node 内）

语义去重在 Analyst Node 完成条件推导后立即执行：

1. **触发时机**：Analyst Node 获取 LLM 的 `validated.testConditions` 后
2. **触发条件**：条件数量 > 1
3. **执行方式**：
   - 构建比较 payload（每个条件的 `id`, `title`, `condition`）
   - 调用 `callLLMWithStructuredOutput`，使用专门的语义去重 LLM 提示词
   - LLM 返回 `groups`（语义重复组）和 `keptIndices`（保留的条件索引）
   - 过滤掉 `removedIndices` 中的条件，只保留 `keptIndices` 中的条件

4. **去重算法**：
```
Rules:
1. Two conditions are semantic duplicates if they test the SAME test scenario
2. Two conditions are NOT duplicates if they test different aspects (different inputs, different paths, different error conditions, or different coverage dimensions)
3. When a group of conditions are semantic duplicates, keep the one with the clearest title and most specific wording
```

5. **去重范围**：
   - Stage 1：当前 batch 内的所有条件（来自多个 ISTQB 技术）
   - Stage 2：当前 selectedFlows 的所有条件
   - Stage 3：所有 error guessing 条件

6. **实现位置**：`server/modules/ai-test-gen/graph/nodes/analyst.ts`

### 4.2 Stage 2 — Flow Integration（跨组件集成级）

| 维度 | 说明 |
|------|------|
| **输入** | 用户选中的所有 Business Flows（合并为一个 batch） |
| **角色** | Integration Analyst |
| **约束** | `allowedReqIds = new Set()`，**不做 batch 限制**；**`category` 必须为 `'integration'`**；**`requirementId` 填 flow 自身的 ID，需求仅用于编写详细步骤的参考** |
| **默认 technique** | **Use Case Testing**（primary）、**State Transition Testing**（secondary） |
| **覆盖规则** | 同上；`category` 必须为 `integration`（硬约束，见 §3.6 偏差 #1） |

**Workflow**：
1. `flow_detail_query`（selectedFlowIds）
2. `requirement_detail_query`（flow steps 引用的 requirementId）
3. `requirement_graph_query`（reqId, flowId）
4. `istqb_guide`
5. **`coverage_check_query`（检测哪些 requirement 已被 Stage 1 覆盖，跳过内部逻辑）**
6. 条件推导

**条件数量决定规则**：

Flow 级别的测试用例数量由 flow 结构和关联需求的交互点决定：

| 来源 | 推导规则 |
|------|---------|
| **Use Case Testing** | 每个 flow 的主场景 + 备选场景 + 异常场景 = 各至少 1 条 |
| **状态转换** | 跨组件的状态转换（如 auth→session→dashboard）= 各至少 1 条 |
| **数据交接** | 每个 flow step 的 `requirementId` 变化点（step N 的 output → step N+1 的 input）= 1 条 |
| **共享状态** | Architect 指定的 `sharedStatePresets`（如 session 有效性）= 各 1 条 |

**去重规则**：
- 同一交互点被多个技术覆盖时，**Analyst Node 执行完成后触发 LLM 语义去重**
- 与 Stage 1 的条件去重：`coverage_check_query` 返回 Stage 1 已覆盖的条件，Analyst Node 在语义去重前会跳过这些条件
- 语义去重在 Analyst Node 内执行，确保去重逻辑可控

**requirementId 规则**：
- Flow 条件测试的是**跨需求的交互**，不是单个需求本身
- 条件的 `requirementId` 字段应填写 **flow 自身的 ID**（来自 `selectedFlowIds`），而不是 flow steps 中引用的 requirementId
- Flow steps 中的 requirementId 仅作为 LLM 编写详细测试步骤的参考数据，不应用于标记 flow 条件的归属需求

> **`coverageDirective='skip'` 与 `coverage_check_query` 职责边界**：两者不冲突。`coverageDirective='skip'` 是程序化硬过滤（Orchestrator 层从 `allowedReqIds` 排除，不让 Analyst 分析）；`coverage_check_query` 是 LLM 自主决策参考（Analyst 层 skill 调用，提供已有覆盖信息供去重参考）。前者是"不让分析"，后者是"让分析但给已有覆盖信息"。

### 4.3 Stage 3 — Error Guessing（缺陷推测）

| 维度 | 说明 |
|------|------|
| **输入** | 项目**全部** requirements（⚠️ 见偏差 #4） |
| **角色** | Defect Speculation Expert |
| **约束** | `allowedReqIds = new Set()`，不做限制 |
| **种子来源** | Blueprint 的 `anomalousFlowProposals` |
| **去重手段** | `coverage_check_query` 查 DB 已有覆盖 + Analyst Node 内 LLM 语义去重 |
| **强制属性** | `category = 'error'`、`priority >= 'high'` |

**语义去重**：
- Stage 3 完成后，Analyst Node 触发语义去重
- 去重范围：所有 error guessing 条件
- 保留语义最清晰、描述最具体的条件

**重点推测方向**：
- 竞态条件（Concurrent mutations）
- 孤儿引用（Deleted parent, child still active）
- 鉴权绕过（Auth/permission bypass）
- 状态机违规（Invalid transitions）
- 数据边界溢出（Exceeding quotas/limits）
- 网络故障/超时/部分提交

**Workflow**：
1. `istqb_guide`（Error Guessing + 全部技术）
2. 读 Blueprint 的 `anomalousFlowProposals`
3. `coverage_check_query`（避免重复已覆盖条件）
4. 推导 error 条件

### 4.4 输出 Schema（TestCondition）

每个条件必须包含：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一标识，如 `C-001` |
| `requirementId` | ✅ | 源需求 ID，须精确匹配输入 |
| `condition` | ✅ | 单一、可验证的 circumstance |
| `category` | ✅ | `functional` / `boundary` / `error` / `validation` / `integration` |
| `priority` | ✅ | `critical` / `high` / `medium` / `low` |
| `riskLevel` | ✅ | `critical` / `high` / `medium` / `low` |
| `primaryTechnique` | ✅ | ISTQB 技术 |
| `secondaryTechniques` | ✅ | 数组，可为空 |
| `techniqueRationale` | ✅ | 选择理由 |
| `coverageDimensions` | ✅ | 覆盖维度标签数组 |
| `dataRequirements` | 可选 | 测试数据需求 |
| `dependencies` | ✅ | 数组，可为空 |

**⚠️ `category` 枚举迁移**：当前 `shared/contracts/index.ts` 中 `TestCondition.category` 为 `'happy-path' | 'alternate' | 'error' | 'boundary'`，与 PRD 不一致。需统一为 PRD 定义的 5 值枚举。**迁移策略**：`'happy-path'` → `'functional'`，`'alternate'` → `'validation'`（或 `'integration'` 视语境），新增 `'integration'`。合约变更需同步更新 Zod schema（`AnalystRuntimeSchema` 中 `category: z.string()` 改为 `z.enum([...])`）。

**⚠️ `riskLevel` 枚举迁移**：当前合约 `TestCondition.riskLevel` 为 3 值 `'high' | 'medium' | 'low'`，PRD 新增 `'critical'`。需与 `epicDirectives.riskPriority` 四值对齐。

---

## 5. Designer 节点（测试用例与步骤设计）

### 5.1 核心规则

- **每个 condition 至少 1 个 draft test case**（Zod 校验强制）
- testCase 的 `requirementId` 必须等于其 `conditionId` 对应的 condition 的 `requirementId`
- 步骤必须遵循**原子性五大黄金法则**

### 5.2 Technique Fidelity（技术忠实度）

| Technique | test case 必须做到 |
|-----------|-------------------|
| EP | `testData` 标明 valid/invalid partition |
| BVA | `testData` 写明精确边界值及位置（如 `= 0 (one below minimum 1)`） |
| Decision Table | `preconditions`/`testData` 列出每个 condition-column 输入 |
| State Transition | `preconditions` 注明起始 state，最后 step `expected` 注明结束 state |
| Use Case | Steps mirror use case 实际序列（main/alternate/exception branch） |

### 5.3 Self-Review 自评

| 分数 | 含义 |
|------|------|
| 9-10 | 每步原子可验证、技术忠实、完全独立 |
| 6-8 | 小缺陷（如 bundled action、数据缺标签） |
| 1-5 | 重大缺陷（缺失 precondition、vague expected、技术未实际应用） |

### 5.4 输出 Schema（DraftTestCase）

每个用例必须包含：`id`、`title`、`conditionId`、`requirementId`、`priority`、`category`、`techniqueApplied`、`preconditions`、`testData`、`steps[]`、`postconditions`、`tags`、`selfReview{score, strengths, weaknesses, suggestions}`

---

## 6. Quality 节点（质量审核与持久化）

### 6.1 六维度审核

| 维度 | 审核内容 |
|------|----------|
| **Clarity** | 每步单一 action + 单一 observable expected |
| **Completeness** | 技术应用满足实际要求；happy-path + negative/boundary 覆盖 |
| **Correctness** | expected 结果与需求文本匹配，不超范围推断 |
| **Traceability** | 内容忠实于 `conditionId`/`requirementId` |
| **Data Validity** | 测试数据具体、现实、技术正确 |
| **Maintainability** | 前置条件自包含，无隐藏依赖 |

### 6.2 原子性自纠正（Mandatory Self-Correction）

- 可修复的复合步骤 → **自动 SPLIT** 成 N 个原子步骤，标 `status: approved_with_changes`
- 不可修复的（元素歧义、需求未规定）→ 保留原样，写入 `validationWarnings[]`

### 6.3 覆盖矩阵计算与持久化

`coverageMatrix` 由 TypeScript 程序化计算，不依赖 LLM：

```
coveragePercentage = min(100, round(testCaseCount / totalConditions * 100))
```

按 requirement 聚合 `techniqueBreakdown` + `categoryBreakdown`。

**持久化**：`persistCoverageForBatch` 将条件写入 `test_gen_persistent_coverage` 表，key = `(project_id, requirement_id, condition_hash, technique)`，`condition_hash = SHA-256(conditionText).slice(0, 16)`。

### 6.4 Deviation 比对与记录（新增）

Quality 节点 LLM 审核完成后，TS 代码执行 `computeDeviations()`：

1. **technique_mismatch**：遍历 `approvedConditions`，对每条条件查其所属 Epic 的 `epicDirectives[].recommendedTechniques`，若 `primaryTechnique` 不在列表中 → 生成 `DeviationRecord`。severity 判定：`techniqueRationale` 中未提及 Architect 推荐的技术 → `warning`（可能忽略了 Architect 指令）；已提及且给出合理理由 → `info`（正常偏离）
2. **coverage_gap**：遍历 `flowDirectives[].integrationFocus`，对每项检查 `approvedConditions` 是否有条件文本覆盖 → 未覆盖生成 `CoverageGapRecord`
3. **missing_preset**：遍历 `sharedStatePresets[]`，检查 `finalTestCases` 的 `preconditions` 是否包含 → 缺失写入 `validationWarnings[]`

`deviations` 和 `coverageGaps` 写入 `TestGenState` 对应字段，在 CP3 展示。

---

## 7. Checkpoint 人机审核机制

### 7.1 交互模式

| Checkpoint | Phase | Payload |
|-----------|-------|---------|
| **0** | `review-blueprint` | `{strategy: directiveTestStrategy}` |
| **1** | `review-conditions` | `{conditions, analysis}` |
| **2** | `review-draft` | `{cases}` |
| **3** | `final-review` | `{cases, matrix, validationWarnings, deviations, coverageGaps}` |

### 7.2 操作类型

- **Approve**：通过，数据保持或采纳编辑后版本
- **Retry**：返回上一个 Agent 重跑（附带 `humanReviewFeedback`）
  - CP0 支持 `forceRedesign=true` → Orchestrator 检测 CP0 checkpoint result → 重调 `ensureGlobalBlueprint(forceArchitect=true)` → 重新触发 CP0 review（不涉及 preparation 节点）
- **编辑**：通过 `saveCheckpointEdits` → `graph.updateState(threadId, stateKeys, asNode)` 写回 LangGraph 状态

### 7.3 Auto 模式

Auto 模式下所有 Checkpoint 自动通过（不中断），数据保持原样。

### 7.4 Batch 与 Thread 映射

- 每个 batch 有独立 thread：`{runId}-batch-{batchIndex}`
- CP0（Architect）使用 batch 0 的 thread（architect 在 batch loop 前运行）
- `saveCheckpointEdits` 按 `checkpointNumber` 决定 `effectiveBatch`：
  - `CP0 → effectiveBatch = 1`（固定映射到 batch 0 的 thread）
  - `CP1/2/3 → effectiveBatch = 绑定批次`

---

## 8. 测试步骤原子性规范

所有 `NlTestCaseStep` 必须满足下游自动化引擎（Playwright / Stagehand）的可执行要求。

### 8.1 五大黄金法则

| # | 规则 | 正确示例 | 错误示例 |
|---|------|---------|---------|
| 1 | **单一交互动作** | "点击标签为 'Sign In' 的按钮" | "填写登录表单并提交" |
| 2 | **单一断言目标** | "按钮文本变为 'Signing in...'" | "登录成功并跳转到仪表盘" |
| 3 | **元素可定位性** | "在占位符为 'Username' 的输入框中输入 `admin`" | "输入有效的用户名" |
| 4 | **具体测试数据** | "输入 `admin123`" | "输入格式不符合要求的密码" |
| 5 | **无隐式上下文** | 动作前明确处于特定页面环境 | "点击 '提交'"（缺前置上下文） |

### 8.2 NL-to-Code 映射

| `NlTestCaseStep` 字段 | Playwright 映射 | 示例 |
|------------------------|-----------------|------|
| `action` 中的动词 | Action API | "输入" → `fill()` |
| `action` 中的主语 | DOM 定位 | "占位符 'Username'" → `getByPlaceholder('Username')` |
| `action` 中的宾语 | 数据参数 | "`admin`" → `fill('admin')` |
| `expected` 描述 | 断言 API | "显示 'Success'" → `expect(loc).toContainText('Success')` |

---

## 9. 最终去重与合并

所有 3 个 Stage 的 `finalTestCases` 收集后：

```typescript
const { allCases, removedCount } = deduplicateTestCases(
  allResults.flatMap(r => r.lastState?.finalTestCases || r.cases || []),
);
```

**三级去重规则**：

| 优先级 | 层级 | Key / 机制 | 规则 | 保留策略 |
|--------|------|-----------|------|---------|
| **一级** | 文本 | title 归一化 | title 小写归一化（`.trim().replace(/\s+/g, ' ')`）后完全相同则去重 | 保留先出现的 |
| **二级** | 文本 | `conditionId + techniqueApplied` | 同 `conditionId` 且同 `techniqueApplied` 的 case 视为重复 | 保留先出现的；title 不同但 conditionId+technique 相同 → 计入 `conflicts` |
| **三级** | **语义（LLM）** | `condition` 文本语义相似度 | 同一 batch 内或跨 batch 的两条条件，如果 LLM 判断语义等价（如"输入空用户名"和"不提供凭据"），视为重复 | 保留语义更清晰、描述更具体的一条；计入 `conflicts` |

title 相同但 steps 不同 → 计入 `conflicts` 但保留先出现的。

**语义去重触发时机**：

| 阶段 | 触发方式 |
|------|---------|
| **Stage 1 内** | Analyst 推导条件时，LLM 对同一需求的多条候选条件进行语义去重，合并后再输出 |
| **Stage 2 内** | Analyst 调用 `coverage_check_query` 时，LLM 对比 Stage 1 已覆盖条件，跳过语义等价的内部逻辑，只生成跨需求交互条件 |
| **Stage 3 内** | Analyst 调用 `coverage_check_query` 时，LLM 对比已有覆盖，跳过语义等价的 error 条件 |
| **最终合并** | `deduplicateTestCases` 先执行一级和二级文本去重，剩余的疑似重复由 LLM 做语义去重确认 |

```typescript
// 去重算法伪代码
function deduplicateTestCases(cases: NlTestCase[]): DedupResult {
  const seenTitles = new Set<string>();
  const seenConditionTechnique = new Set<string>();
  const allCases = [];
  const conflicts = [];

  for (const tc of cases) {
    const titleKey = normalize(tc.title);
    const condTechKey = `${tc.conditionId}::${tc.techniqueApplied}`;

    if (seenTitles.has(titleKey)) {
      // title 重复：steps 不同则记录 conflict
      removedCount++;
      continue;
    }
    if (seenConditionTechnique.has(condTechKey)) {
      // conditionId+technique 重复
      removedCount++;
      conflicts.push(`Duplicate conditionId+technique: ${condTechKey} (title differs)`);
      continue;
    }
    seenTitles.add(titleKey);
    seenConditionTechnique.add(condTechKey);
    allCases.push(tc);
  }

  // 三级：语义去重（LLM 判断）
  // 对所有 remaining cases，按 condition 文本进行语义相似度聚类
  // 同一簇中保留语义最清晰的一条，其余标记为 conflicts
  const semanticClusters = llmSemanticDedup(allCases);
  for (const cluster of semanticClusters) {
    if (cluster.length > 1) {
      const winner = cluster[0]; // 语义最清晰的
      for (const loser of cluster.slice(1)) {
        conflicts.push(`Semantic duplicate of "${winner.title}": ${loser.title}`);
        removedCount++;
      }
      allCases[allCases.indexOf(winner)] = winner;
    }
  }

  return { allCases, conflicts, removedCount };
}
```

---

## 10. ⚠️ 设计偏差与改进方向

> 以下标注了当前代码实现与设计意图之间的偏差，以及具体的改进验收标准。
> 标注 ✅ 表示已有完整实现方案且可验收。
> 标注 🟡 表示方案已定义但仍有实现细节待补。

### 偏差 #0：Architect 输出指导力弱 ✅

**问题**：Architect 输出 4 个描述性字段，下游 Analyst 可听可不听，没有程序化约束。

**改进**：已在第 3 章重定义为 `DirectiveTestStrategy`。

**验收标准**：
- [ ] `structured-output/architect.ts` 使用 `DirectiveTestStrategy` Zod schema
- [ ] `contracts/index.ts` 新增 `DirectiveTestStrategy` 接口
- [ ] `orchestrator.ts ensureGlobalBlueprint` 返回 `DirectiveTestStrategy` 类型
- [ ] `buildBatchInputState` 注入 `directiveTestStrategy` 到 `TestGenState`

### 偏差 #0a：Architect 输入信息不足 ✅

**问题**：Architect 只看 requirement id + title + level，无法做真正的风险分析。

**改进**：已在第 3.4 节改进输入结构。

**验收标准**：
- [ ] `buildArchitectUserMessage` 传入 `description` + `acceptanceCriteria[]`
- [ ] `ensureGlobalBlueprint` 构造 `syntheticState` 时包含全量需求详情
- [ ] `businessFlowBlueprints[].steps` 不再为空（偏差 #2 联动）
- [ ] `crossRefs` 由 Orchestrator 在 `ensureGlobalBlueprint` 前计算

### 偏差 #0b：Architect 缓存 key 基于选中 subset ✅

**问题**：`computeRequirementHash` 基于**选中**的 requirementIds 做哈希。

**改进**：已在第 3.3 节改进，hash 基于全项目需求+流内容。

**验收标准**：
- [ ] `computeRequirementHash` 遍历 `allRequirements`（非 filtered subset）
- [ ] 缓存表新增 `schema_version` 列
- [ ] 旧 `v1` 缓存命中视为 miss

### 偏差 #0c：per-batch preparation 节点职责混杂 ✅

**问题**：preparation 节点保留 LLM fallback，Token 预算是死代码，频次扫描结果被丢弃。

**改进**：已在第 3.2 节重新定义。

**验收标准**：
- [ ] `preparation.ts` 删除 LLM fallback 路径（132-174 行区域）
- [ ] `preparation.ts` 删除 token budget 计算（105-108 行区域）
- [ ] `preparation.ts` 返回值包含 `requirementFrequencies`
- [ ] `TestGenStateAnnotation` 新增 `requirementFrequencies` 字段
- [ ] Analyst prompt `buildAnalystUserMessage` 包含 `## High-Frequency Requirements` 段落
- [ ] CP0 `forceRedesign=true` 不再在 preparation 内调 LLM

### 偏差 #1：STAGE_2_FLOW 条件类别缺乏校验 ✅

**问题**：Stage 2 prompt 说 `category = integration` 但 Zod 不强制。

**改进**：
1. `createAnalystOutputProfile` 当 `analystMode === 'STAGE_2_FLOW'` 时新增 `enforceCategory: 'integration'` 参数，校验每条条件的 `category === 'integration'`，否则 ZodError
2. `buildStageInstructions('STAGE_2_FLOW')` 已注入 `flowDirectives[].integrationFocus`
3. Stage 2 Workflow 增加 `coverage_check_query`

**验收标准**：
- [ ] `createAnalystOutputProfile` 接受 `enforceCategory` 参数
- [ ] `analyzeNode` 在 Stage 2 传入 `enforceCategory: 'integration'`
- [ ] 非 `integration` 类别的条件被 Zod 拒绝
- [ ] `buildWorkflowSteps('STAGE_2_FLOW')` 增加 `coverage_check_query` 步

### 偏差 #2：Flow Blueprint 丢失 step 级信息 ✅

**问题**：`buildBusinessFlowBlueprints` 把 `steps` 清空为 `[]`。

**改进**：已在第 3.4 节改进。

**验收标准**：
- [ ] `business-flow-blueprint.ts` 输出包含 `steps[].actionSummary` + `steps[].requirementIds`
- [ ] `PipelineBusinessFlowBlueprintStep` schema 已存在且可用

### 偏差 #3：Stage 2 缺少 "Reference Only" 机制 ✅

**问题**：Stage 2 不查询已有覆盖，可能重复 Stage 1 已覆盖的 requirement 内部逻辑。

**改进**：
1. `coverageDirective='skip'` 在 `buildBatchInputState` 中从 `allowedReqIds` 排除
2. `requirementFrequencies` 注入 Analyst prompt
3. Stage 2 Workflow 增加 `coverage_check_query`

**验收标准**：
- [ ] `buildBatchInputState` 对 `coverageDirective='skip'` 的 requirement 从 `allowedReqIds` 排除
- [ ] Analyst prompt 包含 `## Already Covered Requirements` 段落（提供覆盖信息供参考，硬约束由 allowedReqIds 排除实现）
- [ ] Analyst prompt 包含 `## Already Covered Requirements` 段落
- [ ] `buildWorkflowSteps('STAGE_2_FLOW')` 包含 `coverage_check_query` 步：Stage 3 输入 scope 过大 🟡

**问题**：`buildErrorGuessingBatches` 把 `currentBatch` 设为项目**全部** requirements。

**改进方向**：按 Epic 分批，每批只处理 `anomalousFlowProposals[].affectedRequirementIds` 涉及的 Epic 及其直接依赖。降级条件：`directiveTestStrategy.anomalousFlowProposals.length === 0` 时降级为全量单 batch。

**实现规格**：
```typescript
// buildErrorGuessingBatches 改造
const affectedEpicIds = new Set(
  directiveTestStrategy.anomalousFlowProposals
    .flatMap(p => p.affectedRequirementIds)
    .map(rid => findRootEpic(rid, allIndex))
);
const stage3Batches = epics
  .filter(epic => affectedEpicIds.has(epic.id))
  .map((epic, i) => ({
    batchIndex: startBatchIndex + i,
    inputState: buildBatchInputState(/* ... */),
  }));
```

**验收标准**：
- [ ] `buildErrorGuessingBatches` 改为按受影响 Epic 分批
- [ ] 降级条件：`directiveTestStrategy.anomalousFlowProposals.length === 0` → 全量单 batch（保持向后兼容）
- [ ] 总批次数计算反映 Stage 3 多批次

### 偏差 #5：`businessFlowBlueprints` 注入全量 APPROVED flows 🟡

**问题**：`buildBatchInputState` 将全量 `businessFlows` 注入每个 batch。

**改进**：Stage 1 只注入与当前 batch requirements 关联的 flows（`crossReferenceMap` 中与 batch 内 requirement 相连的 flowId）；Stage 2 注入选中的 flows；Stage 3 可保持全量。

**实现规格**：
```typescript
// buildBatchInputState 中 Stage 1 过滤逻辑
const batchReqSet = new Set(batchRequirements.map(r => r.id));
const relevantFlowIds = crossReferenceMap
  .filter(xref => batchReqSet.has(xref.requirementId))
  .flatMap(xref => xref.sharedByFlowIds);
const filteredFlows = businessFlows.filter(f => relevantFlowIds.includes(f.id));
```

**验收标准**：
- [ ] Stage 1 `buildBatchInputState` 中 `businessFlowBlueprints` 按 `crossReferenceMap` 过滤
- [ ] Stage 2 保持注入选中 flows
- [ ] Stage 3 保持全量

### 偏差 #6：去重仅靠 title 文本匹配 ✅

**问题**：`deduplicateTestCases` 仅按 title 小写归一化去重。

**改进**：已在 §9 升格为三级去重规范（title 一级 + conditionId+technique 二级 + LLM 语义去重三级）。

**验收标准**：
- [ ] `deduplicateTestCases` 实现三级 key
- [ ] `DedupResult.conflicts` 包含二级 key 冲突记录和语义重复记录
- [ ] `helpers.test.ts` 新增二级 key 去重用例
- [ ] LLM 语义去重作为最终合并阶段的第三级去重机制

---

### 10a. `coverage_check_query` 技能定义

`coverage_check_query` 是一个新增的 data skill，注册在 `data-skills.ts` 中，用于查询已有覆盖信息以辅助 LLM 去重决策。

**技能规格**：
```typescript
// 函数签名
type CoverageCheckQuery = {
  name: 'coverage_check_query';
  description: '查询 test_gen_persistent_coverage 表，获取已有覆盖记录，用于跳过已覆盖条件';
  parameters: {
    requirementIds?: string[];  // 待查询的 requirement ID 列表（可选，不传则查全部）
    technique?: string;         // 按 technique 过滤（可选）
  };
  returns: Array<{
    requirementId: string;
    conditionHash: string;      // SHA-256(conditionText).slice(0, 16)
    technique: string;          // EP / BVA / Decision Table / State Transition / Use Case
    testCaseCount: number;      // 已生成的 case 数（0 = 只覆盖了条件但未生成 case）
    category: string;           // functional / boundary / error / validation / integration
  }>;
};

// 调用时机
- Stage 1: 可选（LLM 决定是否需要查询已有覆盖）
- Stage 2: Workflow 第 5 步强制调用（参见 §4.2）
- Stage 3: Workflow 第 3 步强制调用（参见 §4.3）
```

**注册位置**：`server/modules/ai-test-gen/graph/skills/data-skills.ts`，与其他 data skills 并列。

**查询目标**：`test_gen_persistent_coverage` 表。

---

## 11. 关键文件索引

| 文件 | 职责 |
|------|------|
| `server/modules/ai-test-gen/orchestrator.ts` | 3-Stage 路由调度、ensureGlobalBlueprint、saveCheckpointEdits |
| `server/modules/ai-test-gen/session.ts` | LangGraph thread 管理、startBatch/resumeAt/retryFromLastCheckpoint |
| `server/modules/ai-test-gen/graph/graph.ts` | LangGraph 拓扑定义：8 节点 + 4 interrupt |
| `server/modules/ai-test-gen/graph/state.ts` | TestGenStateAnnotation（analystMode / globalBlueprint / testConditions 等） |
| `server/modules/ai-test-gen/graph/nodes/preparation.ts` | Per-batch 确定性层（频次扫描 + 覆盖快照 + 蓝图分发）；**§10 偏差 #0c：删除 LLM fallback 和 token budget，新增 `requirementFrequencies` 返回** |
| `server/modules/ai-test-gen/graph/nodes/analyst.ts` | 3-Mode 条件生成 + allowedReqIds 校验；**§10 偏差 #1：Stage 2 传入 `enforceCategory: 'integration'`** |
| `server/modules/ai-test-gen/graph/nodes/designer.ts` | 条件 → draft test case + conditionId 覆盖校验 |
| `server/modules/ai-test-gen/graph/nodes/quality.ts` | 6 维度 review + 原子性自纠正 + 覆盖矩阵持久化；**§6.4 新增：TS `computeDeviations()` + `coverageGaps` 计算** |
| `server/modules/ai-test-gen/graph/nodes/checkpoints.ts` | 4 个 makeCheckpoint 中断节点；**§3.7：CP0 `forceRedesign` 回到 Orchestrator 而非 batch 内 LLM** |
| `server/modules/ai-test-gen/graph/prompts.ts` | System prompt 生成 + Stage instructions + workflow steps；**§3.6a：新增 directive 注入段落** |
| `server/modules/ai-test-gen/graph/structured-output/architect.ts` | Zod schema + normalize + validate；**§10 偏差 #0：重写为 `DirectiveTestStrategy` schema** |
| `server/modules/ai-test-gen/graph/structured-output/analyst.ts` | Zod schema + normalize + validate；**§10 偏差 #1：新增 `enforceCategory` 参数 + `priorityFloor`** |
| `server/modules/ai-test-gen/graph/structured-output/quality.ts` | Zod schema + normalize + validate；**§6.4：新增 `deviations` + `coverageGaps` 字段** |
| `server/modules/ai-test-gen/helpers.ts` | groupRequirementsByEpic + deduplicateTestCases；**§9：改造为两级去重** |
| `server/modules/ai-test-gen/business-flow-blueprint.ts` | Flow → Blueprint 映射；**§10 偏差 #2：保留 `steps[].actionSummary` + `steps[].requirementIds`** |
| `server/modules/ai-test-gen/graph/skills/data-skills.ts` | requirement_detail_query / flow_detail_query / coverage_check_query |
| `server/modules/ai-test-gen/graph/skills/skills.ts` | Skill 注册（ISTQB 指南 + knowledge base + data skills） |
| `server/modules/ai-test-gen/context.ts` | RunContext 构建（provider、observer、session） |
| `server/modules/ai-test-gen/scope.ts` | Agent 运行状态追踪 + thinking 缓冲 + agent log 持久化 |
| `server/migrations/003_architect_cache.ts` | Architect 缓存表；**§10 偏差 #0b：新增 `schema_version` 列** |
| `shared/contracts/index.ts` | 共享合约类型；**§4.4：`TestCondition.category` 枚举迁移 + `riskLevel` 4 值 + 新增 `DirectiveTestStrategy`** |
| `client/shared/test-gen-run/useTestGenRun.ts` | Hook：selectedAgentLog / selectedCheckpointData / SSE 集成 |
| `client/shared/test-gen-run/test-gen-reducer.ts` | Reducer：batch 状态 / checkpoint 数据 / SSE 事件处理 |
| `client/features/ai-test-gen/TestGenDetailPanel.tsx` | 详情面板 UI：Summary/Thinking/Prompts/Trace/Errors tab |

---

## 12. 实施检查清单

以下按依赖顺序列出所有 v2.1 需要的代码变更。每项标注关联偏差编号和涉及文件。

### Phase 依赖关系（DAG）

```
Phase 1 (contracts) ──┬──→ Phase 2 (state) ──┬──→ Phase 4 (preparation)
                      ├──→ Phase 3 (architect) │    Phase 5 (analyst)
                      └──→ Phase 8 (flows+dedup)└──→ Phase 6 (orchestrator)
                                                       Phase 7 (quality)
                                              Phase 9 (migration)
                                              Phase 10 (frontend)
```

可并行执行的 phases：
- Phase 3（Architect 重写）和 Phase 8（业务流修复 + 去重）互不依赖，可并行
- Phase 4（Preparation 清理）和 Phase 5（Analyst 约束增强）只依赖 Phase 1+2，可并行
- Phase 10（前端适配）依赖 Phase 1+3+7，可在 Phase 7 完成后启动，与 Phase 4-6/8-9 并行

### Phase 1：合约层（无依赖，先行）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 1.1 | `TestCondition.category` 枚举：`'happy-path'\|'alternate'\|'error'\|'boundary'` → `'functional'\|'boundary'\|'error'\|'validation'\|'integration'` | §4.4 | `shared/contracts/index.ts` | 5 值 enum 编译通过 |
| 1.2 | `TestCondition.riskLevel` 枚举：3 值 → 4 值（新增 `'critical'`） | §4.4 | `shared/contracts/index.ts` | 4 值 enum 编译通过 |
| 1.3 | 新增 `DirectiveTestStrategy` 接口及所有子类型（`EpicDirective`, `FlowDirective`, `CrossReferenceMapItem`, `AnomalousFlowProposal`） | #0 | `shared/contracts/index.ts` | 接口编译通过 |
| 1.4 | 新增 `DeviationRecord` + `CoverageGapRecord` 接口 | §6.4 | `shared/contracts/index.ts` | 接口编译通过 |
| 1.5 | `DedupResult` 类型新增 `conflicts: string[]` | #6 | `shared/contracts/index.ts` | 编译通过 |
| 1.6 | **`coverageDimensions` 类型对齐**：contracts 中 `{ dimension: string; variants: string[] }[]` 与 Zod 中 `z.array(z.string())` 统一。**决策**：采用 `z.array(z.string())`（简化，维度名称列表），contracts 同步修改 | §4.4 | `shared/contracts/index.ts` + `structured-output/analyst.ts` | 两处类型一致 |
| 1.7 | **`dataRequirements` 类型对齐**：contracts 中 `string`（可选）与 Zod 中 `z.array(z.string()).optional()` 统一。**决策**：采用 `string[]`（支持多数据需求），contracts 同步修改 | §4.4 | `shared/contracts/index.ts` + `structured-output/analyst.ts` | 两处类型一致 |

### Phase 2：State 层（依赖 Phase 1）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 2.1 | `TestGenStateAnnotation` 新增 `directiveTestStrategy?: DirectiveTestStrategy` | #0 | `graph/state.ts` | 编译通过 |
| 2.2 | `TestGenStateAnnotation` 新增 `requirementFrequencies` | #0c | `graph/state.ts` | 编译通过 |
| 2.3 | `TestGenStateAnnotation` 新增 `deviations: DeviationRecord[]` | §6.4 | `graph/state.ts` | 编译通过 |
| 2.4 | `TestGenStateAnnotation` 新增 `coverageGaps: CoverageGapRecord[]` | §6.4 | `graph/state.ts` | 编译通过 |

### Phase 3：Architect 重写（依赖 Phase 1）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 3.1 | `architect.ts` Zod schema 重写为 `DirectiveTestStrategy` | #0 | `structured-output/architect.ts` | `makeArchitectSchema()` 返回新 schema |
| 3.2 | `orchestrator.ts ensureGlobalBlueprint` 返回类型改为 `DirectiveTestStrategy` | #0 | `orchestrator.ts` | TS 编译通过 |
| 3.3 | `computeRequirementHash` 改为遍历 `allRequirements` + flow 内容 | #0b | `orchestrator.ts` | hash 包含全量输入 |
| 3.4 | `computeRequirementHash` 结果携带 `schema_version: 'v2'` | #0b | `orchestrator.ts` | v1 缓存命中视为 miss |
| 3.5 | `ensureGlobalBlueprint` 新增 `crossRefs` 计算逻辑 | #0a | `orchestrator.ts` | 输出含 `crossReferenceMap` |
| 3.6 | `buildArchitectUserMessage` 传入 `description` + `acceptanceCriteria[]` | #0a | `prompts.ts` | prompt 包含需求详情 |

### Phase 4：Preparation 清理（依赖 Phase 2）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 4.1 | 删除 LLM fallback 路径 | #0c | `preparation.ts` | `forceRedesign` 不调用 LLM |
| 4.2 | 删除 token budget 计算 | #0c | `preparation.ts` | 无 `budget` 相关代码 |
| 4.3 | 新增 `requirementFrequencies` 返回值 | #0c | `preparation.ts` | 返回含频次数据 |
| 4.4 | CP0 `forceRedesign=true` → state 写回 `phase: 'init'` + `forceRedesign: true` | §3.2 | `checkpoints.ts` | Orchestrator reruns Architect |

### Phase 5：Analyst 约束增强（依赖 Phase 1+2）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 5.1 | `createAnalystOutputProfile` 新增 `enforceCategory` 参数 | #1 | `structured-output/analyst.ts` | Stage 2 传入 `'integration'` |
| 5.2 | `createAnalystOutputProfile` 新增 `priorityFloor` 参数 | §3.6 | `structured-output/analyst.ts` | 条件 priority ≥ floor |
| 5.3 | `buildBatchInputState` 注入 `directiveTestStrategy` | §3.6a | `orchestrator.ts` | state 含 directive |
| 5.4 | `buildBatchInputState` 对 `coverageDirective='skip'` 的 requirement 从 `allowedReqIds` 排除 | #3 | `orchestrator.ts` | Zod 校验自动拒绝 skip 项 |
| 5.5 | `buildAnalystUserMessage` 新增 directive 注入段落（§3.6a 映射表） | §3.6a | `prompts.ts` | prompt 含 6 个段落 |
| 5.6 | `buildStageInstructions('STAGE_2_FLOW')` 增加 `coverage_check_query` | #1/#3 | `prompts.ts` | workflow steps 含新步 |
| 5.7 | `buildWorkflowSteps('STAGE_2_FLOW')` 增加 `coverage_check_query` | #1/#3 | `prompts.ts` | workflow steps 含新步 |
| **5.8** | **`buildDesignerUserMessage` 签名扩展，接收 `sharedStatePresets: string[]`，注入 `## Mandatory Shared State Preconditions` 段落** | §3.6a | `prompts.ts` | prompt 含共享状态段落 |
| **5.9** | **Phase 5.8 的替代方案（更优雅）**：在 `buildBatchInputState` 时把 `sharedStatePresets` 预注入 `state.businessFlowBlueprints` 的扩展字段，Designer 通过 state 读取而非参数传递 | §3.6a | `orchestrator.ts` + `prompts.ts` | 同上 |

### Phase 6：Orchestrator 路由优化（依赖 Phase 3）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 6.1 | `buildBatchInputState` Stage 1 按 `crossReferenceMap` 过滤 `businessFlows` | #5 | `orchestrator.ts` | 非 Stage 1 不受影响 |
| 6.2 | `buildErrorGuessingBatches` 改为按受影响 Epic 分批 | #4 | `orchestrator.ts` | 无 anomalous proposals 时降级全量 |

### Phase 7：Quality 偏差检测（依赖 Phase 1+2）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 7.1 | `quality.ts` 新增 `computeDeviations()` + `computeCoverageGaps()` | §6.4 | `quality.ts` | 输出写入 state |
| 7.2 | `structured-output/quality.ts` 新增 `deviations` + `coverageGaps` 字段 | §6.4 | `structured-output/quality.ts` | Zod 编译通过 |
| 7.3 | CP3 payload 包含 `deviations` + `coverageGaps` | §7 | `checkpoints.ts` | 前端可展示 |

### Phase 8：业务流修复 + 去重升级（依赖 Phase 1）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 8.1 | `business-flow-blueprint.ts` 保留 `steps[].actionSummary` + `steps[].requirementId`（保持单数） | #2 | `business-flow-blueprint.ts` | 输出非空 steps |
| 8.2 | `deduplicateTestCases` 实现三级 key（title + conditionId::technique + LLM 语义去重） | #6 | `helpers.ts` | `DedupResult.conflicts` 填充 |
| 8.3 | `helpers.test.ts` 新增两级去重用例 | #6 | 测试文件 | 全部通过 |

### Phase 9：迁移

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 9.1 | `003_architect_cache.ts` 新增 `schema_version` 列（default `'v1'`） | #0b | `migrations/003_architect_cache.ts` | 迁移可执行 |
| 9.2 | `globalBlueprint` 字段标记 `@deprecated`（删除条件：Phase 7 完成后） | #0 | `graph/state.ts` | 编译通过，消费点已全部迁移 |
| 9.3 | `GlobalTestBlueprint` 类型标记 `@deprecated`（删除条件：Phase 9 所有消费点迁移完成后） | #0 | `shared/contracts/index.ts` | 编译通过 |
| 9.4 | 声明 v1 运行数据兼容策略：旧运行记录不迁移，v1 缓存 miss = 重跑 = 安全（`schema_version` 机制自然隔离） | #0b | 策略文档 | — |
| 9.5 | 旧 `GlobalTestBlueprint` JSON 反序列化适配器：Phase 3-6 过渡期，读取 state 中旧 `globalBlueprint` 时走适配器；Phase 9 后无需 | #0 | `state.ts` / `helpers.ts` | 旧 state JSON 不抛异常 |
| 9.6 | `test_gen_persistent_coverage` 表：`technique` 和 `category` 字段值域不受枚举变更影响（存原始字符串），Enum 变更只影响新写入 | §4.4 | schema 文档 | 无需迁移 |

### 回滚策略

v2.1 上线后如需回滚到 v2.0：

1. **`TestCondition.category` 枚举变更**是破坏性变更。回滚时需提供**双向映射**：
   - 正向（v2.0→v2.1，上线用）：`'happy-path' → 'functional'`, `'alternate' → 'validation'`, `'error' → 'error'`, `'boundary' → 'boundary'`
   - 反向（v2.1→v2.0，回滚用）：`'functional' → 'happy-path'`, `'validation' → 'alternate'`, `'error' → 'error'`, `'boundary' → 'boundary'`, `'integration' → 'alternate'`
2. **`test_gen_architect_cache` 表**的 `schema_version` 列：回滚时删除该列不影响 `v1` 缓存，但 `v2` 缓存数据需随回滚处理（可保留，新 `v2` 条目在 v2.0 代码中不会命中因为 `schema_version` 列不存在）
3. **state JSON 数据**：回滚时旧 `globalBlueprint` 字段仍存在于 state 中（只是被标记 deprecated），v2.0 代码可正常读取
4. **声明**：此变更原则上不回滚（`schema_version` 机制确保缓存隔离，存疑时前向兼容），但如确需回滚，**数据库回退推荐方案**为：`git revert` 迁移文件后重新运行 `down` 迁移

### Phase 10：前端适配（依赖 Phase 1+3+7）

| # | 变更 | 关联偏差 | 文件 | 验收 |
|---|------|---------|------|------|
| 10.1 | `TestCondition.category` 5 值枚举 → 更新 category 显示/过滤逻辑 | §4.4 | `TestGenDetailPanel.tsx` | 5 种颜色标签可见 |
| 10.2 | CP3 payload 新增 `deviations` + `coverageGaps` → checkpoint review 面板新增展示段落 | §7 | `TestGenDetailPanel.tsx` | 偏差/覆盖空白段落可读 |
| 10.3 | `DirectiveTestStrategy` → CP0 review 面板重写（展示 epicDirectives 表格 + flowDirectives 表格） | §3.7 | `TestGenDetailPanel.tsx` | 表格展示，字段完整 |
| 10.4 | `riskLevel` 4 值 → 任何显示 risk level 的 UI 组件适配新枚举 | §4.4 | （多文件） | UI 不出现断链值 |
| `server/modules/ai-test-gen/graph/nodes/analyst.ts` | 3-Mode 条件生成 + allowedReqIds 校验 + **Analyst Node 内 LLM 语义去重**；**§10 偏差 #1：Stage 2 传入 `enforceCategory: 'integration'`** |
| `server/modules/ai-test-gen/graph/structured-output/analyst.ts` | Zod schema + normalize + validate；**§10 偏差 #1：新增 `enforceCategory` 参数 + `priorityFloor`** |
| `server/modules/ai-test-gen/graph/structured-output/quality.ts` | Zod schema + normalize + validate；**§6.4：新增 `deviations` + `coverageGaps` 字段** |
| `server/modules/ai-test-gen/graph/skills/data-skills.ts` | **新增 `semanticDedupQuery` skill**（目前仅文档说明，实际在 Analyst Node 内直接调用 LLM）；`requirement_detail_query` / `flow_detail_query` / `coverage_check_query` |
| `server/modules/ai-test-gen/graph/prompts.ts` | System prompt 生成 + Stage instructions + workflow steps；**新增 Step 5/6/6 Semantic deduplication**；**§3.6a：新增 directive 注入段落** |

### 10a. `coverage_check_query` 技能定义