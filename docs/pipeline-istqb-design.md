# 需求→NL用例 管道细化设计 (ISTQB 驱动)

## 核心理念

将 ISTQB 的 **Fundamental Test Process** 映射到多 Agent 管道中，每个阶段由一个模拟 ISTQB 角色的 Agent 负责，Agent 之间的交接就是 ISTQB 测试流程的交付物传递。

```
传统 ISTQB:  Test Analysis → Test Design → Test Implementation
我们的Agent管道: [Test Analyst] → [Test Designer] → [Quality Manager] → 产出高质量NL用例
```

## 管道架构：3 个 Agent 角色 + 3 个检查点

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              需求 → NL用例 管道 (ISTQB-aligned Multi-Agent)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Agent 1: Test Analyst (测试分析师)                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  输入: 需求树 (Epic → Feature → Story → AC) + 项目上下文(POM/API列表)    │   │
│  │                                                                          │   │
│  │  职责 (合并 Test Manager + Test Analyst + Technique Selector):             │   │
│  │  1. 评估需求风险/优先级，按风险+业务价值排序                                 │   │
│  │  2. 提取 Test Conditions(原子化可测试目标)                                  │   │
│  │  3. 为每个条件选择 ISTQB 设计技术 (EP/BVA/DecisionTable/StateTrans/UseCase) │   │
│  │                                                                          │   │
│  │  输出: TestConditions[] (含 riskLevel + techniqueAssignments)             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                     [Checkpoint 1: 审核测试条件]                               │
│                     审核/编辑 Test Conditions                                  │
│                    + 确认技术选择 + 覆盖维度                                    │
│                              │                                               │
│  Agent 2: Test Designer (测试设计师)                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  输入: approved TestConditions[] + 项目上下文(POM/API)                    │   │
│  │                                                                          │   │
│  │  职责 (合并 Test Design Engineer):                                        │   │
│  │  1. 按 ISTQB 标准格式设计用例 (preconditions→steps+expected→postconditions)│   │
│  │  2. 应用指定的设计技术，覆盖 正/反/边界/异常                                │   │
│  │  3. 自动执行质量自审(原子性/可测性/覆盖完整性)                               │   │
│  │                                                                          │   │
│  │  输出: DraftNlTestCases[] + QualitySelfReview                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                     [Checkpoint 2: 审核草稿用例]                               │
│                     审核/编辑 Draft 用例                                       │
│                    + 查看 Quality Self-Review                                 │
│                              │                                               │
│  Agent 3: Quality Manager (质量经理)                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  输入: DraftNlTestCases[] + qualitySelfReview + 人工修改                │   │
│  │                                                                          │   │
│  │  职责 (合并 Quality Reviewer + Finalizer):                                │   │
│  │  1. 从 ISTQB 质量维度审阅所有用例                                          │   │
│  │  2. 吸收自审意见+人工反馈→修正用例                                         │   │
│  │  3. 输出 Final NL Test Cases                                              │   │
│  │  4. 生成覆盖矩阵 (Requirement→Condition→Technique→Case)                   │   │
│  │                                                                          │   │
│  │  输出: FinalNlTestCases[] + CoverageMatrix + TraceabilityMap            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                     [Checkpoint 3: 最终审核]                                   │
│                     审核 Final 用例 + 确认覆盖矩阵                              │
│                     → 保存到 DB，标记 ready 状态                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
---

## 各 Agent 详细定义

### Agent 1: Test Analyst (测试分析师)

**ISTQB 角色映射**: Test Manager + Test Analyst + Technique Selector 三合一

**输入**:
```typescript
interface TestAnalystInput {
  requirements: RequirementTree[];           // 完整需求树
  projectContext: {
    name: string;
    type: 'web' | 'api' | 'hybrid';
    existingPages: { name: string }[];
    existingEndpoints: { name: string; method: string }[];
  };
}
```

**输出**:
```typescript
interface TestCondition {
  id: string;
  requirementId: string;
  requirementLevel: 'epic' | 'feature' | 'story' | 'ac';
  condition: string;                         // 原子化的测试目标
  category: 'happy-path' | 'alternate' | 'error' | 'boundary' | 'non-functional';
  riskLevel: 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dataRequirements?: string;
  dependencies?: string[];

  // 内嵌技术选择
  primaryTechnique:
    | 'equivalence-partitioning'
    | 'boundary-value-analysis'
    | 'decision-table'
    | 'state-transition'
    | 'use-case';
  secondaryTechniques: string[];
  techniqueRationale: string;                 // 为什么选这个技术
  coverageDimensions: {
    dimension: string;                        // "有效输入分区" / "状态转换" / "决策列"
    variants: string[];                       // 需要覆盖的变体
  }[];
}

interface RequirementAnalysis {
  overallApproach: string;                    // 整体测试策略
  riskAssessmentSummary: string;              // 风险总览
  testConditions: TestCondition[];
}
```

**职责 (三合一)**:

1. **测试经理职责**: 
   - 分析需求树的复杂度/风险/业务价值, 按优先级排序
   - 识别高风险需求(复杂业务逻辑/核心路径)
   - 建议整体测试策略和覆盖深度

2. **测试分析师职责**: 
   - 从需求中提取可测试的条件, 每个必须原子化
   - 覆盖: 显性需求 + 隐性需求 + 业务规则 + 约束
   - 区分维度: 正向(功能应该工作) / 替代(不同路径) / 异常(错误输入) / 边界(极值)

3. **技术选择职责**:
   - 为每个 TestCondition 自动选择最合适的 ISTQB 设计技术
   - 生成具体的覆盖维度和变体列表

**技术选择规则 (内嵌于 Agent prompt)**:

| 需求特征 | 推荐技术 | 覆盖维度示例 |
|----------|---------|------------|
| 输入值有范围约束 | EP + BVA | 有效分区、无效分区、min/max边界 |
| 多条件组合决策 | Decision Table | 每条决策规则的组合 |
| 有状态切换/流转 | State Transition | 所有状态、转换路径、无效转换 |
| 用户交互/业务流程 | Use Case | 主流程、替代流程、异常流程 |
| API接口参数 | EP + BVA | 每个参数的有效/无效/边界值 |

**System Prompt 要素**:
- 你是 ISTQB 认证的资深测试分析师, 兼具测试经理和测试方法专家的视角
- 深入分析需求树, 先做风险评估和策略判断
- 从需求中提取所有可测试条件, 每个条件必须原子化
- 自动选择最合适的 ISTQB 设计技术, 列出覆盖维度
- 按风险+业务价值排优先级
- 输出包含决策理由, 便于人工审核理解

---

### Agent 2: Test Designer (测试设计师)

**ISTQB 角色映射**: Test Design Engineer

**输入**: approvedTestConditions[] + 项目上下文

**输出**:
```typescript
interface DraftNlTestCase {
  id: string;
  title: string;
  requirementId: string;
  conditionId: string;
  techniqueApplied: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'happy-path' | 'alternate' | 'error' | 'boundary';
  preconditions: string[];
  testData: { key: string; value: string; description: string }[];
  steps: { sequence: number; action: string; expected: string }[];
  postconditions: string[];
  tags: string[];
  // 内嵌质量自审
  selfReview: {
    score: number;                            // 0-100
    issues: {
      severity: 'blocker' | 'major' | 'minor';
      category: 'atomicity' | 'testability' | 'coverage' | 'repeatability' | 'clarity' | 'data-completeness';
      description: string;
      suggestion: string;
    }[];
    pass: boolean;
  };
}
```

**ISTQB 用例设计标准**:
1. **Each step is atomic**: 一个 step 做一个动作
2. **Expected result is measurable**: 必须是可观察/可度量的结果
3. **Precondition is explicit**: 系统状态、用户状态、数据状态
4. **Cover positive/negative/boundary/error**: 每个 TestCondition 至少1正+1反
5. **Repeatable**: 不依赖其他用例的执行结果
6. **Data is specific**: 不用模糊描述, 使用具体值

**质量自审 (Agent Self-Review) 维度**:
- 原子性: 每一步是否只做一件事
- 可测试性: 前置条件是否可达? 预期结果是否可验证?
- 覆盖完整性: 正/反/边界/异常 是否已覆盖 Condition 要求的所有变体
- 可重复性: 用例是否可以独立执行
- 清晰度: 描述是否无歧义
- 数据完整性: 所有测试数据是否已给出

**System Prompt 要素**:
- 你是 ISTQB 认证的测试设计工程师
- 按 ISTQB Foundation Level 标准格式设计用例
- 严格遵循: preconditions → test data → steps(action+expected) → postconditions
- 每个 TestCondition 根据其 coverageDimensions 生成适当数量的用例
- 边界用例必须使用边界值 (BVA)
- 设计完成后执行自我质量审查, 标注问题(不修改, 留给下一阶段处理)
- 参考项目已有 POM 元素和 API 端点名称, 但用业务语言描述

---

### Agent 3: Quality Manager (质量经理)

**ISTQB 角色映射**: Quality Reviewer + Test Case Finalizer 二合一

**输入**: DraftNlTestCases[] + selfReview + 人工编辑意见

**输出**: FinalNlTestCases[] + CoverageMatrix + TraceabilityMap

```typescript
interface FinalNlTestCase {
  id: string;
  title: string;
  requirementId: string;
  conditionId: string;
  techniqueApplied: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  preconditions: string[];
  testData: { key: string; value: string; description: string }[];
  steps: { sequence: number; action: string; expected: string }[];
  postconditions: string[];
  tags: string[];
  reviewSummary: string;                    // 审阅总结
  changeLog: {
    source: 'agent-self-review' | 'human-review' | 'final-review';
    changes: string;
  }[];
}

interface CoverageMatrix {
  rows: {
    requirementId: string;
    requirementTitle: string;
    level: string;
    totalConditions: number;
    testCaseCount: number;
    techniqueBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    coveragePercentage: number;
    uncoveredRisks: string[];
  }[];
}
```

**职责 (二合一)**:

1. **质量审阅职责**:
   - 从 ISTQB 质量维度审阅所有 Draft 用例
   - 检查: 原子性 / 可测试性 / 覆盖完整性 / 可重复性 / 清晰度 / 数据完整性
   - 合并 Agent 2 的自我审查意见, 交叉验证
   - 问题分级: blocker(必须改) / major(强烈建议改) / minor(酌情改)

2. **终审修正职责**:
   - 逐条修复质量审阅发现的问题
   - 吸收人工反馈(Checkpoint 2 的编辑)
   - 输出最终版用例(不再带 draft 标记)
   - 生成覆盖矩阵和溯源关系

**System Prompt 要素**:
- 你是 ISTQB 认证的测试质量经理
- 先审阅所有 Draft 用例, 标记质量问题
- 然后修复所有 blocker 和 major 问题
- 吸收人工编辑意见
- 确保每个 Final 用例通过所有 ISTQB 质量维度
- 输出覆盖矩阵: 哪些需求被完全覆盖, 哪些有缺口

---

## 管道执行流程 (LangGraph 编排)

```
              ┌─────────────┐
              │   开始       │
              │ 选择需求树    │
              └──────┬──────┘
                     │
              ┌──────▼────────────────────────┐
              │ Agent 1: Test Analyst         │
              │                               │
              │ 步骤:                          │
              │ 1. 评估风险 + 排序优先级        │
              │ 2. 提取 TestConditions         │
              │ 3. 选择 ISTQB 设计技术          │
              │                               │
              │ 输出: TestConditions[]         │
              │ (含 riskLevel + technique)     │
              └──────────┬───────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  Checkpoint 1               │
          │  审核 TestConditions         │
          │  + 确认技术选择 + 覆盖维度    │
          │  [approve / edit / retry]   │
          └──────────────┬──────────────┘
                         │ (approved)
              ┌──────────▼───────────────────┐
              │ Agent 2: Test Designer       │
              │                              │
              │ 步骤:                         │
              │ 1. 按 ISTQB 格式设计用例       │
              │ 2. 应用指定的测试技术          │
              │ 3. 覆盖正/反/边界/异常         │
              │ 4. 执行自我质量审查            │
              │                              │
              │ 输出: DraftNlTestCases[]      │
              │ (含 selfReview)              │
              └──────────┬───────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  Checkpoint 2               │
          │  审核 Draft 用例             │
          │  + 查看 self-review          │
          │  + 人工编辑修改               │
          │  [approve / edit / retry]   │
          └──────────────┬──────────────┘
                         │ (approved)
              ┌──────────▼───────────────────┐
              │ Agent 3: Quality Manager     │
              │                              │
              │ 步骤:                         │
              │ 1. 质量审阅(6维度)             │
              │ 2. 修复所有问题                │
              │ 3. 吸收人工反馈                │
              │ 4. 生成覆盖矩阵                │
              │                              │
              │ 输出: FinalNlTestCases[]      │
              │      + CoverageMatrix        │
              └──────────┬───────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  Checkpoint 3               │
          │  最终审核 Final 用例          │
          │  + 确认覆盖矩阵               │
          │  → 保存到 DB, mark ready     │
          │  [confirm / edit / retry]   │
          └──────────────────────────────┘
```

---

## 关键技术实现细节

### 1. Agent 间上下文传递

```typescript
interface PipelineState {
  // 输入
  projectId: string;
  requirementIds: string[];

  // Agent 1 → 输出: TestConditions (含 riskLevel + technique)
  requirementAnalysis?: RequirementAnalysis;
  testConditions?: TestCondition[];

  // Checkpoint 1 → 人工编辑后的版本
  approvedConditions?: TestCondition[];

  // Agent 2 → 输出: Draft Test Cases + 质量自审
  draftTestCases?: DraftNlTestCase[];
  selfReview?: QualityReport;

  // Checkpoint 2 → 人工编辑后的版本 + 人工意见
  approvedDraftCases?: DraftNlTestCase[];
  humanReviewFeedback?: string;

  // Agent 3 → 输出: 最终用例 + 覆盖矩阵
  finalTestCases?: FinalNlTestCase[];
  coverageMatrix?: CoverageMatrix;

  // 管控
  phase: 'analysis' | 'review-conditions' | 'design' | 'review-draft' | 'quality' | 'final-review' | 'complete';
  errors: { phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[];
}
```

### 2. 人工审核机制

每个 Checkpoint 是 LangGraph 的 `interrupt()` 点。流程：

1. Pipeline 运行到 Checkpoint → `interrupt()` 暂停
2. 前端收到 SSE `human_review:required` 事件
3. 前端展示审核界面(当前阶段的输出)
4. 用户操作:
   - **Approve** → `POST /api/pipeline/:runId/continue` (approve)
   - **Edit** → `PATCH /api/pipeline/:runId/state` 修改 state → `POST /api/pipeline/:runId/continue` (continue)
   - **Retry** → `POST /api/pipeline/:runId/continue` (retry) → 当前阶段的 Agent 重新运行
5. Pipeline 从暂停处恢复执行

### 3. Agent System Prompt 模板化

每个 Agent 的 system prompt 使用模板变量注入上下文:

```
You are an ISTQB-certified {role}.

{role_description}

Today you are working on project: {projectName}

The project has these existing UI pages: {pages}
And these API endpoints: {endpoints}

## Your task: {task_description}

## Input:
{input_json}

## Output format (MUST be valid JSON matching this schema):
{output_schema}
```

### 4. 前端审核 UI 概念

每个 Checkpoint 展示为:
- **顶部**: 当前阶段 Agent 角色名称 + 任务说明
- **中部**: 结构化数据展示 (TestConditions 表格 / Draft 用例卡片 / QualityReport 面板)
- **底部**: 操作栏 [Approve] [Edit & Continue] [Retry Agent] [Abort Pipeline]
- 编辑模式下，数据变为可编辑表单，修改后点击 Continue

---

## DB 变更

**新增表: `test_conditions`** (Agent 1 输出)
```sql
CREATE TABLE IF NOT EXISTS test_conditions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  condition TEXT NOT NULL,                   -- 原子化的测试目标
  category TEXT NOT NULL DEFAULT 'happy-path',
  data_requirements TEXT,                    -- 所需测试数据
  dependencies TEXT,                         -- JSON array
  risk_level TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  -- 内嵌技术选择
  primary_technique TEXT NOT NULL,
  secondary_techniques TEXT,                 -- JSON array
  technique_rationale TEXT,
  coverage_dimensions TEXT,                  -- JSON [{dimension, variants[]}]
  status TEXT NOT NULL DEFAULT 'DRAFT'
);
```

**修改表: `natural_language_test_cases`** (Agent 2/3 输出，扩展现有 PRD 定义)
```sql
CREATE TABLE IF NOT EXISTS natural_language_test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requirement_id TEXT,
  condition_id TEXT REFERENCES test_conditions(id),
  technique_applied TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  preconditions TEXT NOT NULL DEFAULT '[]',   -- JSON array
  test_data TEXT NOT NULL DEFAULT '[]',       -- JSON [{key, value, description}]
  steps TEXT NOT NULL DEFAULT '[]',           -- JSON [{sequence, action, expected}]
  postconditions TEXT NOT NULL DEFAULT '[]',  -- JSON array
  tags TEXT NOT NULL DEFAULT '[]',            -- JSON array
  self_review TEXT,                           -- JSON: Agent 2's self-review {score, issues[]}
  review_summary TEXT,                        -- 质量经理审阅总结
  change_log TEXT,                            -- JSON [{source, changes}]
  status TEXT NOT NULL DEFAULT 'DRAFT',       -- DRAFT/APPROVED/FINAL
  generated_suite_id TEXT,                    -- 后续自动化生成后关联
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Out of Scope for this Refinement

- Phase 5 之后的"NL用例→自动化用例"流程(下一阶段细化)
- 覆盖矩阵的图表可视化(前端实现细节)
- Agent 运行日志和调试工具(后续迭代)
- 批量需求选择时 Agent 间的并行优化