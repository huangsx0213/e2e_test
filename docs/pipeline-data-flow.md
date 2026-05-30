# Pipeline Data Structure & Flow

## 1. Graph State Schema (LangGraph `TestGenStateAnnotation`)

定义源：`shared/ai-test-gen/test-generation.ts:13-35`

| Key | Type | Set by | Read by |
|---|---|---|---|
| `testConditions` | `TestCondition[]` | test_analyst output | checkpoint_1 payload |
| `requirementAnalysis` | `RequirementAnalysis` | test_analyst output | checkpoint_1 payload |
| `approvedConditions` | `TestCondition[]` | checkpoint_1 resolve | test_designer input |
| `draftTestCases` | `NlTestCase[]` | test_designer output | checkpoint_2 payload |
| `approvedDraftCases` | `NlTestCase[]` | checkpoint_2 resolve | quality_manager input |
| `finalTestCases` | `NlTestCase[]` | quality_manager output | checkpoint_3 payload |
| `coverageMatrix` | `CoverageMatrix` | quality_manager output | checkpoint_3 payload |
| `humanReviewFeedback` | `string` | checkpoint resolve/retry | agent inputs (feedback) |
| `phase` | `string` | every node output | conditional edges routing |

---

## 2. 完整类型定义

### RequirementAnalysis

定义源：`shared/ai-test-gen/test-generation.ts:22`

| 字段 | 类型 | 说明 | payload | PATCH | resume | agent input |
|------|------|------|:-------:|:-----:|:------:|:----------:|
| `overallApproach` | `string` | 整体测试策略描述 | ✅ `analysis` | ✅ `analysis` | ✅ `analysis` | ❌ |
| `riskAssessmentSummary` | `string` | 风险评估总结 | ✅ `analysis` | ✅ `analysis` | ✅ `analysis` | ❌ |

> `RequirementAnalysis` 作为 `analysis` 对象整体嵌入 cp1 的 payload/PATCH/resume 中，不传递到下游 agent input，仅用于检查点展示和评审。

---

### TestCondition

定义源：`shared/contracts/index.ts:508-522`

所有字段都出现在 payload `conditions[]` → PATCH `conditions[]` → resume `conditions[]` → agent input `conditions[]` 中。

| 字段 | 类型 | 说明 | payload / PATCH / resume / agent input |
|------|------|------|:----------------------------------------:|
| `id` | `string` | 唯一标识 | ✅ |
| `requirementId` | `string` | 关联需求 ID | ✅ |
| `requirementLevel` | `'epic' \| 'feature' \| 'story' \| 'ac'` | 需求级别 | ✅ |
| `condition` | `string` | 测试条件描述文本（前端编辑的主字段） | ✅ |
| `category` | `'happy-path' \| 'alternate' \| 'error' \| 'boundary'` | 测试分类 | ✅ |
| `riskLevel` | `'high' \| 'medium' \| 'low'` | 风险等级 | ✅ |
| `priority` | `'critical' \| 'high' \| 'medium' \| 'low'` | 优先级（前端可编辑） | ✅ |
| `dataRequirements` | `string` (optional) | 数据需求说明 | ✅ |
| `dependencies` | `string[]` (optional) | 依赖项 | ✅ |
| `primaryTechnique` | `'equivalence-partitioning' \| 'boundary-value-analysis' \| 'decision-table' \| 'state-transition' \| 'use-case'` | 主要测试技术 | ✅ |
| `secondaryTechniques` | `string[]` | 辅助测试技术 | ✅ |
| `techniqueRationale` | `string` | 技术选择理由 | ✅ |
| `coverageDimensions` | `{ dimension: string; variants: string[] }[]` | 覆盖维度 | ✅ |

`coverageDimensions[]` 每个元素的展开结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dimension` | `string` | 覆盖维度名（如 `"input"`, `"state"`, `"permission"`） |
| `variants` | `string[]` | 该维度下的变体值列表 |

---

### NlTestCase

定义源：`shared/contracts/index.ts:554-573`

子类型见下方 `NlTestCaseStep`, `NlTestCaseTestData`, `SelfReview`, `NlTestCaseChangeLog`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `projectId` | `string` | 所属项目 ID |
| `title` | `string` | 用例标题（前端编辑的主字段） |
| `requirementId` | `string` (optional) | 关联需求 ID |
| `conditionId` | `string` (optional) | 关联测试条件 ID |
| `techniqueApplied` | `string` (optional) | 应用的测试技术 |
| `priority` | `'critical' \| 'high' \| 'medium' \| 'low'` | 优先级（前端可编辑） |
| `category` | `string` (optional) | 分类 |
| `preconditions` | `string[]` | 前置条件（前端可编辑） |
| `testData` | `NlTestCaseTestData[]` | 测试数据 |
| `steps` | `NlTestCaseStep[]` | 测试步骤（前端可编辑） |
| `postconditions` | `string[]` | 后置条件 |
| `tags` | `string[]` | 标签 |
| `selfReview` | `SelfReview` (optional) | 智能体自评 |
| `reviewSummary` | `string` (optional) | 评审总结 |
| `changeLog` | `NlTestCaseChangeLog[]` | 变更记录 |
| `status` | `'DRAFT' \| 'APPROVED' \| 'FINAL'` | 用例状态 |
| `generatedSuiteId` | `string` (optional) | 生成的测试套件 ID |

#### NlTestCaseStep

| 字段 | 类型 | 说明 |
|------|------|------|
| `sequence` | `number` | 步骤序号 |
| `action` | `string` | 操作描述 |
| `expected` | `string` | 预期结果 |

#### NlTestCaseTestData

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 数据字段名 |
| `value` | `string` | 数据值 |
| `description` | `string` | 数据说明 |

#### SelfReview

| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | `number` | 自评分数 |
| `issues` | `SelfReviewIssue[]` | 自评问题列表 |
| `pass` | `boolean` | 是否通过自评 |

##### SelfReviewIssue

| 字段 | 类型 | 说明 |
|------|------|------|
| `severity` | `'blocker' \| 'major' \| 'minor'` | 严重程度 |
| `category` | `'atomicity' \| 'testability' \| 'coverage' \| 'repeatability' \| 'clarity' \| 'data-completeness'` | 问题类别 |
| `description` | `string` | 问题描述 |
| `suggestion` | `string` | 修改建议 |

#### NlTestCaseChangeLog

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `'agent-self-review' \| 'human-review' \| 'final-review'` | 变更来源 |
| `changes` | `string` | 变更描述 |

---

### CoverageMatrix

定义源：`shared/contracts/index.ts:587-589`

| 字段 | 类型 | 说明 |
|------|------|------|
| `rows` | `CoverageRow[]` | 覆盖率行列表 |

#### CoverageRow

| 字段 | 类型 | 说明 |
|------|------|------|
| `requirementId` | `string` | 需求 ID |
| `requirementTitle` | `string` | 需求标题 |
| `level` | `string` | 需求级别 |
| `totalConditions` | `number` | 总条件数 |
| `testCaseCount` | `number` | 已覆盖用例数 |
| `techniqueBreakdown` | `Record<string, number>` | 各测试技术覆盖数 |
| `categoryBreakdown` | `Record<string, number>` | 各分类覆盖数 |
| `coveragePercentage` | `number` | 覆盖率百分比 |
| `uncoveredRisks` | `string[]` | 未覆盖风险描述 |

---

### PipelineBusinessFlowBlueprint

定义源：`shared/contracts/index.ts:485-490`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 蓝图 ID |
| `name` | `string` | 名称 |
| `type` | `'happy-path' \| 'alternate' \| 'exception'` | 业务流程类型 |
| `steps` | `PipelineBusinessFlowBlueprintStep[]` | 步骤列表 |

#### PipelineBusinessFlowBlueprintStep

| 字段 | 类型 | 说明 |
|------|------|------|
| `sequence` | `number` | 步骤序号 |
| `requirementId` | `string` | 关联需求 ID |
| `requirementTitle` | `string` | 需求标题 |
| `requirementLevel` | `'epic' \| 'feature' \| 'story' \| 'ac'` | 需求级别 |
| `actionSummary` | `string` | 操作总结 |
| `acceptanceCriteria` | `string[]` | 验收标准 |

---

### projectContext

定义源：`shared/ai-test-gen/test-generation.ts:19`（内联类型）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 项目名称 |
| `pages` | `{ name: string }[]` | 页面列表 |
| `endpoints` | `{ name: string; method: string }[]` | API 端点列表 |

---

### BatchContext

定义源：`shared/ai-test-gen/test-generation.ts:7-11`

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentBatch` | `number` | 当前批次号 |
| `totalBatches` | `number` | 总批次数 |
| `processedCount` | `number` | 已处理条目数 |

---

### Requirement（`currentBatch` 的元素类型）

定义源：`shared/contracts/index.ts:445-458`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 需求 ID |
| `projectId` | `string` | 项目 ID |
| `parentId` | `string \| null` (optional) | 父需求 ID |
| `title` | `string` | 标题 |
| `description` | `string` | 描述 |
| `dependencies` | `string[]` (optional) | 依赖项 |
| `level` | `'epic' \| 'feature' \| 'story' \| 'ac'` | 需求级别 |
| `priority` | `'CRITICAL' \| 'HIGH' \| 'MEDIUM' \| 'LOW'` | 优先级 |
| `status` | `'DRAFT' \| 'APPROVED' \| 'IN_PROGRESS' \| 'DEPRECATED'` | 状态 |
| `tags` | `string[]` | 标签 |
| `position` | `number` | 排序位置 |
| `metadata` | `Record<string, unknown>` | 扩展元数据 |

---

### errors 元素类型

定义源：`shared/ai-test-gen/test-generation.ts:34`（内联类型）

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | `string` | 出错阶段 |
| `agent` | `string` | 出错的智能体 |
| `step` | `string` | 出错的步骤 |
| `message` | `string` | 错误消息 |
| `rawResponse` | `string` (optional) | 原始响应 |
| `timestamp` | `number` | 时间戳 |

---

## 3. 各边界数据形状速查

### Checkpoint 1 — 全链路形状

```
Graph state:
  testConditions:       TestCondition[]         (id, requirementId, requirementLevel, condition, category, riskLevel, priority, ...)
  requirementAnalysis:  { overallApproach, riskAssessmentSummary }

Checkpoint payload / checkpoint_data / Frontend state:
  ↓
  { conditions: [...TestCondition],  analysis: { overallApproach, riskAssessmentSummary } }

Frontend PATCH body (on Done Reviewing):
  ↓
  { conditions: [{ ...originalTestCondition, condition: "edited text" }],
    analysis: { overallApproach, riskAssessmentSummary } }

Resume state / interrupt response (on Approve):
  ↓
  { conditions: [...TestCondition],  analysis: { overallApproach, riskAssessmentSummary },  feedback: "" }

onResolve 写入 Graph state:
  ↓
  approvedConditions:   TestCondition[]
  humanReviewFeedback:  string
  phase:                "design"

Agent input (test_designer):
  ↓
  conditions:           TestCondition[]
  projectContext:       { name, pages, endpoints }
  businessFlowBlueprints: PipelineBusinessFlowBlueprint[]
  previousDraftCases:   NlTestCase[]
  humanFeedback:        string
```

### Checkpoint 2 — 全链路形状

```
Graph state:
  draftTestCases: NlTestCase[]     (id, projectId, title, priority, preconditions, steps, testData, ...)

Checkpoint payload / checkpoint_data / Frontend state:
  ↓
  { cases: [...NlTestCase] }

Frontend PATCH body:
  ↓
  { cases: [{ ...originalNlTestCase, title: "edited text" }] }

Resume state / interrupt response:
  ↓
  { cases: [...NlTestCase],  feedback: "" }

onResolve 写入 Graph state:
  ↓
  approvedDraftCases:   NlTestCase[]
  humanReviewFeedback:  string
  phase:                "quality"

Agent input (quality_manager):
  ↓
  draftCases:           NlTestCase[]
  humanFeedback:        string
  businessFlowBlueprints: PipelineBusinessFlowBlueprint[]
```

### Checkpoint 3 — 全链路形状

```
Graph state:
  finalTestCases: NlTestCase[]     (id, projectId, title, priority, preconditions, steps, ...)
  coverageMatrix: { rows: CoverageRow[] }   (requirementId, requirementTitle, level, totalConditions, ...)

Checkpoint payload / checkpoint_data / Frontend state:
  ↓
  { cases: [...NlTestCase],  matrix: { rows: [...CoverageRow] } }

Frontend PATCH body:
  ↓
  { cases: [{ ...originalNlTestCase, title: "edited text" }],
    matrix: { rows: [...CoverageRow] } }

Resume state / interrupt response:
  ↓
  { cases: [...NlTestCase],  matrix: { rows: [...CoverageRow] } }

onResolve 写入 Graph state:
  ↓
  phase: "complete"

注意: checkpoint_3 的 onResolve 不使用 response.cases / response.matrix
```

---

## 4. 流向图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LangGraph Pipeline                                     │
│                                                                                      │
│  ┌──────────┐    output:                  ┌──────────────┐    payload:              │
│  │ test_    │── testConditions[] ──────▶  │ checkpoint_1 │── { conditions[],    ──▶ │
│  │ analyst  │   requirementAnalysis        │  (interrupt) │    analysis }           │
│  └──────────┘                             └──────┬───────┘                         │
│                                                  │ resume:                         │
│                    ┌─────────────────────────────┤ { conditions[],                 │
│                    │ retry (phase=analysis)      │   analysis,                     │
│                    │                             │   feedback }                    │
│                    ▼                             │                                 │
│            ┌──────────────┐                      ▼                                 │
│            │ test_analyst │◀──────────────┐  ┌──────────┐                         │
│            └──────────────┘               │  │  approve │                         │
│                                           │  └────┬─────┘                         │
│                                           │       ▼                               │
│                                           │  ┌──────────┐                          │
│                                           │  │ onResolve│──▶ phase='design'       │
│                                           │  └──────────┘                          │
│                                           │        │                              │
│                                           │        │ approvedConditions[]          │
│                                           │        ▼                              │
│                                           │  ┌──────────────┐                     │
│                                           │  │ test_designer│                     │
│                                           │  └──────┬───────┘                     │
│                                           │         │                             │
│                                           │         │ output: draftTestCases[]     │
│                                           │         ▼                             │
│                                           │  ┌──────────────┐    payload:         │
│                                           │  │ checkpoint_2 │── { cases[] }    ──▶│
│                                           │  │  (interrupt) │                     │
│                                           │  └──────┬───────┘                     │
│                                           │         │                             │
│                    ┌──────────────────────┘         │ resume: { cases[],          │
│                    │ retry (phase=design)            │   feedback }               │
│                    │                                │                             │
│                    ▼                                ▼                             │
│            ┌──────────────┐              ┌──────────┐                             │
│            │test_designer │◀─────────┐   │  approve  │                             │
│            └──────────────┘          │   └────┬─────┘                             │
│                                      │        │                                   │
│                                      │        ▼                                   │
│                                      │  ┌──────────┐                              │
│                                      │  │ onResolve│──▶ phase='quality'           │
│                                      │  └──────────┘                              │
│                                      │        │                                   │
│                                      │        │ approvedDraftCases[]              │
│                                      │        ▼                                   │
│                                      │  ┌────────────────┐                        │
│                                      │  │ quality_manager│                        │
│                                      │  └───────┬────────┘                        │
│                                      │          │                                 │
│                                      │          │ output: finalTestCases[]         │
│                                      │          │         coverageMatrix          │
│                                      │          ▼                                 │
│                                      │  ┌──────────────┐    payload:              │
│                                      │  │ checkpoint_3 │── { cases[],         ──▶│
│                                      │  │  (interrupt) │    matrix }             │
│                                      │  └──────┬───────┘                         │
│                                      │         │                                  │
│                       ┌──────────────┘         │ resume: { cases[],               │
│                       │ retry (phase=quality)   │   matrix }                      │
│                       │                        │                                  │
│                       ▼                        ▼                                  │
│               ┌──────────────┐      ┌──────────┐                                  │
│               │quality_mgr   │◀───  │  approve  │                                  │
│               └──────────────┘      └────┬─────┘                                  │
│                                          │                                          │
│                                          ▼                                          │
│                                    ┌──────────┐                                    │
│                                    │ onResolve│──▶ phase='complete' ──▶ END       │
│                                    └──────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

外部数据流 (Edit → SSE → Frontend → saveCheckpointEdits):

             ┌──────────────────────────────────────┐
             │  SSE gateway                         │
             │  event: checkpoint:waiting            │
             │  data: { payload: {...} }             │
             └──────┬───────────────────────────────┘
                    │
                    ▼
             ┌──────────────────────────────────────┐
             │  Frontend reducer                    │
             │  state.checkpointData = payload      │
             │  → selectedCheckpointData()          │
             └──────┬───────────────────────────────┘
                    │
                    ▼
             ┌──────────────────────────────────────┐
             │  CheckpointEditView                  │
             │  user edits fields                   │
             │  → onDataChange({ conditions/        │
             │       cases, analysis, matrix })     │
             └──────┬───────────────────────────────┘
                    │
                    ▼
             ┌──────────────────────────────────────┐
             │  handleSave (saveCheckpointEdits)    │
             │  POST /:runId/checkpoint-update       │
             │  body: { editedData, checkpointNumber}│
             └──────┬───────────────────────────────┘
                    │
                    ▼
             ┌─────────────────────────────────────────────────┐
             │  Server: saveCheckpointEdits(runId, editedData, │
             │           checkpointNumber)                      │
             │                                                 │
             │  1. build stateKeys from editedData:             │
             │     cp1: { testConditions, requirementAnalysis } │
             │     cp2: { draftTestCases }                     │
             │     cp3: { finalTestCases, coverageMatrix }     │
             │                                                 │
             │  2. applyStateUpdate(threadId, stateKeys)       │
             │     → graph.updateState() → LangGraph SQLite    │
             │                                                 │
             │  3. on success (fire-and-forget async):         │
             │     a. getCheckpointState() → read back graph   │
             │     b. SSE emit checkpoint:waiting (update       │
             │        lastEvents for reconnect replay)          │
             │     c. pipelineRepo.updateAgentLogOutput() →     │
             │        merge edits into agent_logs.output_data   │
             └─────────────────────────────────────────────────┘

Resume 数据流 (Approve):

  Frontend handleApprove
    → resume('approve', { editedData: checkpointEditedData.current })
    → POST /:runId/resume { action, editedData }
    → server: resumeRun():
        1. insertAuditLog(runId, phase, action, editedData)
        2. setRunRunning(runId)
        3. SSE emit checkpoint:resolved                    ← NEW: clears client checkpointData
           { checkpointNumber, action }
        4. resumePipeline(runId, ...)
           → resumeBatch(edits: editedData)
           → buildResumeState(cpN, edits):
               cp1: { conditions, analysis, feedback }
               cp2: { cases, feedback }
               cp3: { cases, matrix }
           → Command({ resume: resumeState })
           → interrupt() returns resumeState as response
           → onResolve(state, response):
               cp1: approvedConditions = response.conditions
               cp2: approvedDraftCases = response.cases
               cp3: (ignores response, sets phase='complete')

---

## 5. 跨边界 Key 对齐表

| 边界 | Checkpoint 1 | Checkpoint 2 | Checkpoint 3 |
|------|-------------|-------------|-------------|
| **Graph state key** | `testConditions[]` | `draftTestCases[]` | `finalTestCases[]` + `coverageMatrix` |
| **Payload key** (interrupt) | `conditions[]` + `analysis` | `cases[]` | `cases[]` + `matrix` |
| **saveCheckpointEdits stateKeys** (→ `updateState()`) | `testConditions`, `requirementAnalysis` | `draftTestCases` | `finalTestCases`, `coverageMatrix` |
| **Agent log output_data key** (历史加载回退) | `testConditions`, `requirementAnalysis` | `draftTestCases` | `finalTestCases`, `coverageMatrix` |
| **前端读取 (运行时)** | `checkpointData.conditions` | `checkpointData.cases` | `checkpointData.cases` |
| **前端读取 (历史/已完成)** | agent_log: `testConditions` → `conditions` | agent_log: `draftTestCases` → `cases` | agent_log: `finalTestCases` → `cases`, `coverageMatrix` → `matrix` |
| **Resume state key** | `conditions`, `analysis`, `feedback` | `cases`, `feedback` | `cases`, `matrix` |
| **interrupt response key** | `conditions`, `analysis`, `feedback` | `cases`, `feedback` | `cases`, `matrix` |
| **onResolve 写入 state** | `approvedConditions` | `approvedDraftCases` | `phase` only |
| **下一 agent 读取 state** | `approvedConditions` → input `conditions` | `approvedDraftCases` → input `draftCases` | (END) |

---

## 6. Auto 模式 vs Interactive 模式处理逻辑

### 共同流程 (startBatch)

```
startBatch → stream → agent runs → checkpoint interrupt → resolve → stream → ...
```

两种模式共享同一个 `startBatch` / `resumeBatch` 循环，区别在于遇到 interrupt 时的行为。

### Interactive 模式

```
startBatch → ... → checkpoint_1 interrupt
  → checkpointResolver.onInterrupt() → SSE: checkpoint:waiting
  → return { type: 'interrupt', interrupt: { threadId, cpNum, phase, payload } }
  → startPipeline/resumePipeline 收到 interrupt，返回（await user action）
  → SSE：keepSse = true（不关连接）

User clicks Approve:
  → resumeRun(runId, 'approve', feedback?, editedData?)
    1. insertAuditLog
    2. setRunRunning(runId)
    3. SSE emit checkpoint:resolved        ← 清除客户端 checkpointData
    4. resumePipeline → resumeBatch
       → Command({ resume: resumeState })
       → stream → next agent → next checkpoint → interrupt

User clicks Edit + Save:
  → saveCheckpointEdits(runId, editedData, cpNum)
    1. applyStateUpdate → graph.updateState()  → LangGraph SQLite
    2. async: getCheckpointState() → SSE emit checkpoint:waiting (更新 lastEvents)
    3. async: updateAgentLogOutput() → 更新 agent_logs.output_data

Approval 后如果 pipeline 完成（no more interrupts）:
  → resumeBatch 返回 { type: 'complete', result }
  → scope.markComplete() → SSE: pipeline:complete
  → isRunning = false
```

### Auto 模式

```
startBatch → ... → checkpoint_1 interrupt
  → checkpointResolver.onInterrupt() → SSE: checkpoint:waiting
  → mode === 'auto':
      currentState = buildResumeState(cpNum, { action: 'approve' }, payload)
      → continue loop (不返回给 user)
  → stream again → next agent → checkpoint_2 interrupt
  → same auto-approve loop
  → ... until complete
  → return { type: 'complete', result }
```

关键区别：Auto 模式在 server 端 `startBatch` 的 `while(true)` 循环中自动 approve，不会返回 interrupt 给前端，因此前端只看到快速连续的 `checkpoint:waiting` → `agent:start` 事件，没有用户交互。

---

## 7. SSE 事件流 & 重连机制

### 事件类型

| 事件 | 触发时机 | payload 包含 |
|------|---------|-------------|
| `heartbeat` | 每 15s | `{ ts }` |
| `phase:start` | batch/flow 开始 | `{ phase, message }` |
| `agent:start` | agent 开始执行 | `{ agentName, batch }` |
| `agent:step` | agent 步骤更新 | `{ agentName, stepIndex, stepName }` |
| `agent:thinking` | agent 思考过程 | `{ agentName, text }` |
| `agent:complete` | agent 完成 | `{ agentName, batch, tokenUsage, latencyMs }` |
| `checkpoint:waiting` | 到达 checkpoint (interrupt) | `{ checkpointNumber, type, summary, payload, recovered? }` |
| `checkpoint:resolved` | 用户批准/编辑 checkpoint | `{ checkpointNumber, action }` |
| `batch:start` | batch 开始 | `{ batch, total }` |
| `batch:complete` | batch 完成 | `{ batch, total, testCases }` |
| `pipeline:complete` | pipeline 完成 | `{ stats: { totalCases, totalTokens, ... } }` |
| `pipeline:error` | pipeline 出错 | `{ phase, message, recoverable }` |
| `pipeline:budget` | token 预算信息 | `{ estimated, limit, warning }` |
| `pipeline:context` | 上下文信息 | `{ flows, indexEntries }` |
| `pipeline:dedup` | 去重信息 | `{ removed, remaining, conflicts }` |

### 粘性事件 (Sticky Events) 与重连恢复

SSEGateway 维护 `lastEvents` Map：

```
checkpoint:waiting → 存储到 lastEvents
pipeline:complete / pipeline:error → 从 lastEvents 删除
```

重连时 `attachStream()` 逻辑：
1. 如果有未消费的 buffered events → 按序重放
2. 否则 → 重放 `lastEvents`（最近的 checkpoint:waiting）
3. 此后正常转发新事件

### `keepSse` 标志

当 pipeline 停在 checkpoint（`WAITING_REVIEW` 状态）时：
```
startPipeline/resumePipeline finally:
  if (!keepSse) sseGateway.cleanup(runId)
```

`keepSse = true` 的情况：
- Interactive 模式收到 interrupt 后（`pipelineRepo.setRunWaiting()`）
- SSE 连接保持打开，等待用户操作

`keepSse = false` 的情况：
- Pipeline 完成（pipeline:complete）
- Pipeline 出错（pipeline:error）
- Auto 模式完成所有 batch

---

## 8. 数据持久化策略

### 三层数据存储

```
┌────────────────────────────────────────────────────────────┐
│ 1. LangGraph SQLite Checkpointer (graph state)              │
│    表: checkpoint_blobs, checkpoint_writes, checkpoints     │
│    写入: graph.updateState(config, stateKeys)               │
│    读取: graph.getState(config).values                      │
│    用途: 运行时状态 + 编辑持久化                              │
├────────────────────────────────────────────────────────────┤
│ 2. agent_logs 表 (agent output_data)                        │
│    表: test_gen_agent_logs                                  │
│    写入: agent 完成时写入原始 output，编辑后 merge 更新       │
│    读取: getAgentLogs(runId)                                │
│    用途: 已完成运行的历史加载回退                              │
├────────────────────────────────────────────────────────────┤
│ 3. test_gen_runs 表 (run metadata)                          │
│    字段: status, phase, thread_id, current_batch, ...       │
│    用途: 运行状态跟踪, 历史列表                               │
└────────────────────────────────────────────────────────────┘
```

### 编辑保存时的双写机制（async await）

> **v2 变更**：旧版是 `.then()` fire-and-forget，HTTP 响应在 DB 写完前就返回。
> 客户端随后调 `refresh()` 读到的可能是旧数据。新版用 `async await` 串行等待全部落盘后才返回。

```
saveCheckpointEdits(runId, editedData, checkpointNumber):

  [验证 runId, thread_id, 映射 stateKeys]

  1. await applyStateUpdate(threadId, stateKeys)
     → graph.updateState({ configurable: { thread_id } }, stateKeys)
     → 写入 LangGraph checkpointer (SQLite)

  2. [成功后仍在此 async 函数内]:
     a. getCheckpointState() → 读取回最新状态
     b. SSE emit checkpoint:waiting → 更新 lastEvents
     c. pipelineRepo.updateAgentLogOutput(runId, agentName, stateKeys)
        → 合并写入 agent_logs.output_data
        → SELECT id, output_data FROM test_gen_agent_logs
           WHERE run_id=? AND agent_name=? AND status='COMPLETED'
           ORDER BY batch DESC LIMIT 1
        → merged = { ...existing_output_data, ...stateKeys }
        → UPDATE SET output_data = JSON.stringify(merged)

  [所有写入完成 → HTTP 200 返回]
```

为什么需要双写：
- Auto/Interactive 运行时：从 graph state 读取（通过 `getCheckpointState`）
- 已完成运行加载历史：从 agent log 读取（因为 `getCheckpointState` 对 phase='complete' 返回 null）
- 编辑要同时反映在两种场景中

### Done Reviewing 后的数据刷新

> **关键优化**：旧版用 `refresh()`（内含 `RESTORE_RUN` → 清空 `checkpointData/agentLogs` → 再通过 API
> 恢复），存在空窗期，组件渲染为 "No checkpoint data available"。
> 新版改用 `refreshCheckpointData()`，不重置 reducer 状态，只并行补充数据。

```
handleDoneReviewing (AiTestGenPage.tsx):

  1. await api.testGen.saveCheckpointEdits(runId, editedData, cpNum)
     [服务器 async await 写完 DB 才返回]

  2. await pipeline.refreshCheckpointData()  ← 取代旧的 refresh()
     ┌──────────────────────────────────────────────────────┐
     │ refreshCheckpointData():                             │
     │   Promise.all([                                      │
     │     api.logs(runId),               → 拉取 agent logs │
     │     api.testGen.getCheckpointState(runId) → 拉取 graph state   │
     │   ])                                                  │
     │                                                       │
     │   a. dispatch MERGE_AGENT_LOGS (logs)                │
     │                                                       │
     │   b. if (cpState?.checkpointData):                   │
     │        → dispatch SET_CHECKPOINT_DATA (WAITING_REVIEW)│
     │        → return                                      │
     │                                                       │
     │   c. [COMPLETED fallback]:                           │
     │       从 logs 中过滤当前 agent 的 output_data        │
     │       → mergeOutputData(agentLogs)                   │
     │       → 映射为 display 格式                           │
     │       → dispatch SET_CHECKPOINT_DATA                 │
     │         (state.checkpointData 保持设置，不经过 agent │
     │           log fallback，避免竞态)                     │
     └──────────────────────────────────────────────────────┘

  3. setReviewMode(false) → isEditing = false → readOnly
```

**关键差异** vs `refresh()`：

| 方面 | `refresh()` | `refreshCheckpointData()` |
|------|------------|--------------------------|
| `RESTORE_RUN` | ✅ 重置节点状态 | ❌ 不重置 |
| `checkpointData` | 清空 → 恢复 | 直接设置，不清空 |
| `agentLogs` | 清空 → 恢复 | 增量更新 |
| 适用场景 | 手动 Refresh、恢复中断 | Done Reviewing 后刷新数据 |

### 编辑可用性 (COMPLETED 运行也支持编辑)

`saveCheckpointEdits` 不再限制 `status === 'WAITING_REVIEW'`。COMPLETED 运行同样可以编辑 checkpoint：

```
检查 → 有无 row?          → 无: return error
     → 有无 thread_id?    → 无: return error
     → 任何 status        → 允许编辑（COMPLETED 也放行）
     → 写 graph state + agent log
```

前端 `TestGenDetailPanel.tsx:1586` ⬇
```
node.status === 'waiting' || 'auto-passed' || 'completed'
  → 显示 Review / Done Reviewing 按钮
```

COMPLETED 时只有 Review 按钮（没有 Approve/Retry），因为 pipeline 不会再恢复执行。编辑只更新已持久化的数据。不支持编辑的运行：无 thread_id 的运行（如失败未创建 checkpoint 的）。

---

## 9. 历史加载流程 (loadRun)

### 对于已完成运行 (COMPLETED)

```
loadRun(runId):
  → api.get(runId) → { status: 'COMPLETED', phase: 'complete', thread_id }
  → dispatch RESTORE_RUN
      → state.checkpointData = null
      → state.isRunning = false
      → buildRestoredNodes('complete', 'COMPLETED')
  → if (runInfo.thread_id):
      getCheckpointState(runId)
        → phase === 'complete' → switch default → return null
      → SET_CHECKPOINT_DATA NOT dispatched
  → api.logs(runId) → 返回所有 agent_logs (with parsed output_data)
  → dispatch MERGE_AGENT_LOGS
      → state.agentLogs = logs
  → queryClient.setQueryData(queryKeys.testGen.logs(runId), logs)
      → 同步 React Query 缓存，防止 useAgentLogs effect
        用过期数据覆盖刚刷新的 agentLogs

用户点击 checkpoint_1 节点:
  → selectedCheckpointData()
      → state.checkpointData = null (跳过)
      → !state.isRunning = true
      → getMergedAgentLog('test_analyst')
          → 从 state.agentLogs 过滤 agent_name='test_analyst'
          → merge 所有 batch 的 output_data
          → return { testConditions: [...], requirementAnalysis: {...} }
      → 映射为 { conditions: od.testConditions, analysis: od.requirementAnalysis }
  → 显示编辑后的数据（因为 saveCheckpointEdits 更新了 agent log）
```

### 对于等待中的运行 (WAITING_REVIEW)

```
loadRun(runId):
  → api.get(runId) → { status: 'WAITING_REVIEW', phase, thread_id }
  → dispatch RESTORE_RUN
      → state.checkpointData = null
      → state.isRunning = true
  → if (runInfo.thread_id):
      getCheckpointState(runId)
        → phase === 'review-conditions' → return { conditions, analysis }
        → phase === 'review-draft' → return { cases }
        → phase === 'final-review' → return { cases, matrix }
      → dispatch SET_CHECKPOINT_DATA with the payload
  → SSE 重连:
      attachStream → lastEvents 重放 checkpoint:waiting
      → reducer 收到 checkpoint:waiting
      → checkpointData = data.payload (可能覆盖 SET_CHECKPOINT_DATA)
      → 但数据一致（都来自 graph state）
```

### 重新连接的差异

| 场景 | 数据来源 | checkpointData |
|------|---------|---------------|
| 初次连接 (interrupt) | SSE `checkpoint:waiting` payload | 当前 checkpoint 数据 |
| 页面刷新后恢复 | `getCheckpointState()` API → `SET_CHECKPOINT_DATA` | 同上 |
| SSE `lastEvents` 重放 | 覆盖 `SET_CHECKPOINT_DATA`（数据一致） | 同上 |
| 已完成运行加载历史 | agent_logs（`getMergedAgentLog`） | null（不在运行时） |

### 防止 lastEvents 覆盖编辑

`saveCheckpointEdits` 成功后：
1. `getCheckpointState()` 读取 graph state 的最新值（含编辑）
2. `SSE emit checkpoint:waiting` → 更新 `SSEGateway.lastEvents`
3. 重连时 `lastEvents` 重放的是编辑后的数据

同时 agent_log 也被更新，已完成运行加载历史时读到编辑后的数据。两个路径都保证用户看到编辑内容。

### 防止 React Query 缓存覆盖 (C→R 竞态)

> 问题：`saveCheckpointEdits` 更新了 agent_log 的 `output_data`。随后 `refresh()` 或 `loadRun()`
> 调用 `api.logs()` 读到最新数据并 `dispatch MERGE_AGENT_LOGS`。但紧接着 `useAgentLogs` 的
> `useEffect` 从 React Query 缓存返回过期数据，再次 `dispatch MERGE_AGENT_LOGS` 覆盖掉刚刷新的数据。

**解法**：在 `dispatch MERGE_AGENT_LOGS` 后同步 React Query 缓存：

```
queryClient.setQueryData(queryKeys.testGen.logs(runId), logs)
```

这样 `useAgentLogs` 返回的是同一份最新数据，effect 的 dispatch 是幂等的。

### 避免 done-reviewing 空窗期 (RESTORE_RUN 竞态)

> 问题：`refresh()` 内 `RESTORE_RUN` 清空 `checkpointData: null` 和 `agentLogs: []`，
> 组件立即渲染为 "No checkpoint data available"。后续 API 完成后才恢复数据。

**解法**：`handleDoneReviewing` 不再调用 `refresh()`，改用 `refreshCheckpointData()`，
它跳过 `RESTORE_RUN`，只并行拉取 checkpoint state + agent logs 并 dispatch。
`state.checkpointData` 在刷新过程中始终不为 null。
