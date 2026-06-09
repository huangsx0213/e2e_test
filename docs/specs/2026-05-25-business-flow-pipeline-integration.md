# Business Flow Pipeline Integration Spec

## 1. Overview

将 Business Flow 正式接入 AI 用例生成 pipeline，使 AI 在生成测试用例时感知完整的业务流程上下文，并能选择性地只生成端到端流程用例。

## 2. Design Decisions（已确认）

| # | Decision | Choice |
|---|---|---|
| Q1 | 注入层级 | Option 3: PipelineStateAnnotation + agent input 都加 |
| Q2 | 哪些 agent 感知 | 全部 3 个 agent |
| Q3 | Blueprint 过滤 vs 全量 | 保留 epic 分批，注入全局 flows |
| Q4 | Config toggle 位置 | PipelineConfigPanel（Run Mode / AI Provider 区域） |
| Q5 | Toggle 形态 | 简单 checkbox |
| Q6 | Flow Batch 的 requirement scope | 自动扩张到 flow 引用的所有需求 |
| Q7 | Flow Batch 的 agent 架构 | 完整 3-agent pipeline |
| Q8 | Flow Batch inputState | `currentBatch` = expanded requirements as `Requirement[]` + `businessFlowBlueprints` |
| Q9 | Flow Batch 批次粒度 | 1 batch（用户靠选多少个 flow 来控制） |
| Q10 | 数据流 | `startPipeline` 内部分支（不新增 route） |
| Q11 | Flow Batch 的 requirementIds | 忽略 UI 传入的，从 `flowIds` 反向扩张 |
| Q12 | Blueprint 格式 | JSON |

## 3. Behavior

### 3.1 两种模式

```
Unchecked（默认）: Epic Batches（按 epic 分批，flows 仅作上下文）
  → inputState: { currentBatch, batchContext, projectContext, businessFlowBlueprints, phase, errors }
  → AI prompt 中看到 blueprints 但不以它为主骨架
  → 产出: epic 内的功能用例

Checked: Flow Batch（一个 batch × 所有选中的 flows）
  → inputState: { currentBatch: expandedReqs, batchContext: {1/1}, projectContext,
                  businessFlowBlueprints: selectedBlueprints, phase: 'analysis', errors }
  → AI 以 blueprints 为主骨架设计用例
  → 产出: 端到端流程用例
```

### 3.2 Requirement 扩张逻辑（Flow Batch）

- 从 `flowIds` 反向查出所有 flow step 引用的 requirement IDs
- 递归加载这些 requirements 及其所有子孙（AC 级）
- 去重
- 完全不使用 UI 传入的 `requirementIds`

### 3.3 Blueprint 过滤逻辑

- Epic Batches 模式：blueprints 按 `flowIds` 筛选（只包含用户选中的 flows）
- Flow Batch 模式：同上

## 4. Data Flow

### 4.1 Client → Server

```
PipelineConfigPanel
  → PipelineStartConfig: { ..., flowIds, includeFlowCases: boolean }
  → AiTestGenPage.handleStart()
    → pipeline.start({ ..., flowIds, includeFlowCases })
    → api.testGen.start(projectId, { ..., flowIds, includeFlowCases })
      → POST /api/test-gen/:projectId/start
```

### 4.2 Server API Contract

```ts
// schema.ts
export const startPipelineSchema = z.object({
  requirementIds: z.array(z.string()).min(1, 'At least one requirement ID is required'),
  providerConfigName: z.string().min(1, 'Provider config name is required'),
  mode: z.enum(['auto', 'interactive']).default('auto'),
  flowIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  includeFlowCases: z.boolean().optional().default(false),  // NEW
});
```

### 4.3 Pipeline Service 分支

```ts
startPipeline(runId, projectId, params) {
  // ... existing init (provider, scope, etc.) ...

  if (params.includeFlowCases) {
    // Flow Batch mode
    // 1. Build blueprints from selected flowIds
    // 2. Expand requirementIds from flow steps
    // 3. Run 1 batch with expanded reqs + blueprints
    await this.processFlowBatch(pipeline, ...);
  } else {
    // Epic Batches mode
    // 1. Build blueprints from selected flowIds
    // 2. Group by epic (existing logic)
    // 3. Each batch gets blueprints as inputState
    for each epic batch: await this.processBatch(pipeline, inputState, ...);
  }
}
```

## 5. Changes by File

### 5.1 Shared Types

#### `shared/ai/pipeline.ts` — PipelineStateAnnotation

```ts
const PipelineStateAnnotation = Annotation.Root({
  // ... existing fields ...
  businessFlowBlueprints: Annotation<PipelineBusinessFlowBlueprint[] | undefined>,  // NEW
});
```

#### `shared/ai/pipeline.ts` — Agent state mappers

```ts
// node_analyst mapper:
(state) => ({
  requirements: state.currentBatch,
  batchContext: state.batchContext,
  projectContext: state.projectContext,
  businessFlowBlueprints: state.businessFlowBlueprints,  // NEW
})

// node_designer mapper:
(state) => ({
  conditions: state.approvedConditions,
  projectContext: state.projectContext,
  businessFlowBlueprints: state.businessFlowBlueprints,  // NEW
})

// node_reviewer mapper:
(state) => ({
  draftCases: state.approvedDraftCases,
  humanFeedback: state.humanReviewFeedback,
  businessFlowBlueprints: state.businessFlowBlueprints,  // NEW
})
```

#### `shared/ai/roles/test-analyst.ts` — BatchAnalystInputSchema

```ts
export const BatchAnalystInputSchema = z.object({
  requirements: z.array(...),
  batchContext: z.object(...),
  projectContext: z.object(...),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),  // NEW
});
```

#### `shared/ai/roles/test-designer.ts` — DesignerInputSchema

```ts
export const DesignerInputSchema = z.object({
  conditions: z.array(...),
  projectContext: z.object(...),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),  // NEW
});
```

#### QMInputSchema (removed — formerly in `shared/ai/nl-test-case-schema.ts`)

```ts
export const QMInputSchema = z.object({
  draftCases: z.array(...),
  humanFeedback: z.string().optional(),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),  // NEW
});
```

#### `shared/contracts/index.ts` — PipelineBusinessFlowBlueprint Zod Schema（NEW）

```ts
export const PipelineBusinessFlowBlueprintStepSchema = z.object({
  sequence: z.number(),
  requirementId: z.string(),
  requirementTitle: z.string(),
  requirementLevel: z.enum(['epic', 'feature', 'story', 'ac']),
  actionSummary: z.string(),
  acceptanceCriteria: z.array(z.string()),
});

export const PipelineBusinessFlowBlueprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['happy-path', 'alternate', 'exception']),
  steps: z.array(PipelineBusinessFlowBlueprintStepSchema),
});
```

### 5.2 Server

#### `server/modules/ai-test-gen/schema.ts`

- `startPipelineSchema` 加 `includeFlowCases: z.boolean().optional().default(false)`

#### `server/modules/ai-test-gen/index.ts`

- `startPipeline` route 传 `includeFlowCases` 给 `pipelineService.startPipeline`

#### `server/modules/ai-test-gen/application/test-gen-service.ts`

- `startPipeline` 方法签名加 `includeFlowCases` 参数
- 根据 `includeFlowCases` 分支：
  - `true` → 调 `processFlowBatch`
  - `false` → 走现有 epic batch 逻辑
- `buildBusinessFlowBlueprints` 改为按 `flowIds` 过滤（同时接收 selected flowIds）
- 新增 `processFlowBatch()`方法：
  1. 从 flowIds 查出所有引用的 requirement IDs
  2. 递归加载 descendants（含 AC）
  3. 去重
  4. 构造 inputState（含 businessFlowBlueprints）
  5. 走一次完整 pipeline stream（复用现有 `runBatch` 逻辑）

### 5.3 Client

#### `client/features/ai-test-gen/TestGenConfigPanel.tsx`

- Add checkbox in the bottom config area:
  ```tsx
  <label className="flex items-center gap-2 text-xs">
    <input type="checkbox" checked={includeFlowCases} onChange={...} />
    生成流程性用例 (Flow Batch)
  </label>
  ```
- `PipelineStartConfig` 加 `includeFlowCases: boolean`
- `handleStart` 传入 `includeFlowCases`

#### `client/features/ai-test-gen/AiTestGenPage.tsx`

- `handleStart` 透传 `includeFlowCases` 给 `pipeline.start()`

#### `client/shared/pipeline-run/usePipelineRun.ts`

- `StartConfig` 加 `includeFlowCases?: boolean`

## 6. InputState 对照

### Epic Batch（Unchecked）

```ts
{
  projectId,
  requirementIds: selectedReqs,
  currentBatch: epicDescendants,     // Requirement[]（当前 epic 的所有子孙）
  batchContext: { currentBatch, totalBatches, processedCount },
  projectContext: { name: epic.title, pages, endpoints },
  businessFlowBlueprints: filteredBlueprints,  // 用户选中的 flows
  phase: 'analysis',
  errors: [],
}
```

### Flow Batch（Checked）

```ts
{
  projectId,
  requirementIds: expandedReqIds,     // flow 引用的所有需求 ID（扩张后）
  currentBatch: expandedRequirements, // Requirement[]（flow 引用的所有需求 + 子孙 AC）
  batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
  projectContext: { name: 'Business Flow Batch', pages, endpoints },
  businessFlowBlueprints: selectedBlueprints,  // 用户选中的 flows（主骨架）
  phase: 'analysis',
  errors: [],
}
```

## 7. System Prompt 改动

三个 agent 的 `systemPromptTemplate` 需要追加一段关于 `businessFlowBlueprints` 的说明：

```
{{businessFlowBlueprints}}
```

在 prompt 底部的 `{{skills}}` 和 `{{input}}` 之间（或 input 内）注入一段结构化指引：

> 对于 Epic Batch（context 模式）：告诉 AI "以下业务流程作为参考上下文，帮助你理解需求的业务关系"
>
> 对于 Flow Batch（骨架模式）：告诉 AI "以下业务流程是设计用例的主依据，按 flow steps 设计端到端流程用例"

具体 wording 在实现时确定，不在此 spec 固定。

## 8. Dedup

Flow Batch 产出的用例和 Epic Batch 产出的用例可能互相冲突（例如同一功能既有原子用例又有流程用例）。但由于两者是互斥生成的（勾选 Flow Batch 则不跑 Epic Batch），不存在跨模式的去重问题。

如果未来需要同时生成，再考虑按 `(title, requirementId)` 去重。

## 9. 未涵盖（Future）

- Flow Batch 产出的流程用例如何在 UI 上区分标记（例如 tag = `flow:xxx`）
- Coverage Matrix 在 Flow Batch 模式下的行为（当前覆盖度矩阵以 requirement 为维度，flow 用例跨多个 req 可能不适用）
- Flow Batch 使用 Quality Manager 时的覆盖度矩阵格式调整
