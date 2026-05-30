# Checkpoint Data Refactor 实施计划

> **Goal:** 删除 `test_gen_runs.checkpoint_data` 及其所有 CRUD，改用 `graph.updateState()` 做编辑持久化、`graph.getState()` 做历史读取

**架构变化:**
- 编辑：PATCH `/checkpoint-data` → DB 列 → 替换为 POST `/checkpoint-update` → `updateState()`
- 历史：`getRunInfo().checkpoint_data` → 替换为 GET `/checkpoint-state` → `getState().values`
- 恢复：`getWaitingRuns().checkpoint_data` → 替换为 `getState().values`
- `onResolve`：不再从 `response` 读数据，改为从 `state` 读
- `resumeBatch`：approve 路径不再传 `originalPayload`

**文件变更清单:**

| 文件 | 改动 |
|------|------|
| `shared/ai-test-gen/test-generation.ts` | `onResolve` cp1/cp2 改读 state |
| `shared/ai/pipeline-nodes.ts` | 无变化（泛型逻辑不变） |
| `server/.../test-gen-repository.ts` | 删除 `checkpoint_data` 字段/方法/查询 |
| `server/.../checkpoint-resolver.ts` | 删除 `saveCheckpoint` 回调 |
| `server/.../test-gen-session.ts` | 简化 `resumeBatch`，删除 `originalPayload` |
| `server/.../test-gen-service.ts` | 删除 `checkpoint_data` 引用 + 添加新端点逻辑 |
| `server/.../index.ts` | 删除 PATCH，添加 POST /checkpoint-update + GET /checkpoint-state |
| `server/.../__tests__/checkpoint-persistence.test.ts` | 删除（覆盖旧流程） |
| `client/.../types.ts` | `buildRestoredNodes` 简化 |
| `client/.../useTestGenRun.ts` | `loadRun`/`refresh` 改调新 API |
| `client/.../AiTestGenPage.tsx` | `handleDoneReviewing` 改调新 API |
| `server/migrations/023_drop_checkpoint_data.ts` | 新建迁移删除列 |

---

### Task 1: 修改 onResolve — cp1/cp2 从 state 读取数据

**Files:**
- Modify: `shared/ai-test-gen/test-generation.ts:114-117,167-170`

- [ ] **修改 cp1 onResolve**

`shared/ai-test-gen/test-generation.ts`:
```
// 旧:
approvedConditions: response?.conditions ?? state.testConditions,

// 新:
approvedConditions: state.testConditions,
```

- [ ] **修改 cp2 onResolve**

```
// 旧:
approvedDraftCases: response?.cases ?? state.draftTestCases,

// 新:
approvedDraftCases: state.draftTestCases,
```

---

### Task 2: 删除 checkpoint_data 仓库方法

**Files:**
- Modify: `server/.../infrastructure/db/test-gen-repository.ts`

- [ ] **从 `TestGenRunRow` 接口删除 `checkpoint_data` 字段**

- [ ] **删除 `setCheckpointData()` 方法（第 156-159 行）**

- [ ] **删除 `updateCheckpointData()` 方法（第 161-164 行）**

- [ ] **从 `getActiveRun()` 的 SELECT 和 JSON.parse 中移除 `checkpoint_data`**

```
SELECT: ...checkpoint_data, → 删除
JSON.parse: checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null, → 删除
```

- [ ] **从 `getRunInfo()` 的 SELECT 和 JSON.parse 中移除 `checkpoint_data`**

同上，删除 checkpoint_data 列和对应的 JSON.parse

- [ ] **从 `getWaitingRuns()` 的 SELECT 和 JSON.parse 中移除 `checkpoint_data`**

同上

- [ ] **从 `getRunWithThreadId()` 的 SELECT 和 JSON.parse 中移除 `checkpoint_data`**

同上

---

### Task 3: 删除 InteractiveResolver 中的 DB 写

**Files:**
- Modify: `server/.../application/checkpoint-resolver.ts`

- [ ] **删除 `saveCheckpoint` 回调参数**

`InteractiveResolver` 构造函数从 `(saveCheckpoint, sseGateway)` 改为 `(sseGateway)`

- [ ] **`onInterrupt` 中删除 `this.saveCheckpoint(payload, phase)` 调用**

只保留 `this.sseGateway.emit(...)` 

---

### Task 4: 简化 resumeBatch — 删除 originalPayload

**Files:**
- Modify: `server/.../application/test-gen-session.ts`
- Modify: `server/.../application/test-gen-service.ts`（调用方）

- [ ] **修改 `resumeBatch` 签名，删除 `originalPayload` 参数**

```ts
async resumeBatch(
  batchIndex: number,
  threadId: string,
  resolution: { action: string; feedback?: string; },
): Promise<...>
```

注意: 同时删除 `edits?` 字段，因为编辑不再通过 `Command({resume})` 传递

- [ ] **修改 `resumeBatch` 内部逻辑，简化 resumeState 构建**

```ts
// 删除:
let resumeState = buildResumeState(
  detectCheckpointNumber(originalPayload),
  resolution,
  originalPayload,
);

// 改为:
let resumeState: Record<string, unknown>;
if (resolution.action === 'retry') {
  resumeState = { retry: true, feedback: resolution.feedback ?? '' };
} else {
  resumeState = "approved" as unknown as Record<string, unknown>;
}
```

注意：后续自动模式的循环中 `interruptPayload` 仍有真实数据，`buildResumeState` 在那路径中继续使用

- [ ] **修改 `resumePipeline` 中调用 `resumeBatch` 的地方**

删除 `editedData` 相关逻辑，删除 `originalPayload` 参数

```ts
const outcome = await session.resumeBatch(
  runRow.current_batch || 0,
  runRow.thread_id,
  { action, feedback },
);
```

注意: 同时删除 for approve 时 merge checkpoint_data 的代码块（test-gen-service.ts:497-500）

- [ ] **修改 `test-gen-session.ts:startBatch()` 中 approve 路径的 resumeState**

```ts
// 旧:
currentState = buildResumeState(cpNum, { action: 'approve' }, interruptPayload);

// 新: (仍调用 buildResumeState，但 onResolve 不再读结果，所以不影响)
// 保留原代码，不需要改动
```

实际上 `startBatch` 可以保持原样，因为 `interruptPayload` 始终有值。

---

### Task 5: 删除服务中的 checkpoint_data 引用

**Files:**
- Modify: `server/.../application/test-gen-service.ts`

- [ ] **`recoverInterruptedRuns()` — 用 `getState()` 替代 `checkpoint_data`**

```ts
// 对每个 waiting run:
const graph = await pipelineFactory();
const snapshot = await graph.getState({
  configurable: { thread_id: run.thread_id }
});
const payload = mapStateToPayload(snapshot.values, run.phase);

// 用 payload 替代 run.checkpoint_data 构建 SSE 事件
```

注意: 需要添加 `mapStateToPayload` 辅助函数

- [ ] **`resumePipeline` 参数类型中删除 `checkpoint_data`**

```ts
// 旧:
runRow: { thread_id: string; phase: string; checkpoint_data: any; config: any; project_id: string; mode: string; current_batch: number },

// 新:
runRow: { thread_id: string; phase: string; config: any; project_id: string; mode: string; current_batch: number },
```

---

### Task 6: 添加新端点

**Files:**
- Modify: `server/.../index.ts`

- [ ] **删除 `PATCH /:runId/checkpoint-data`**

整体删除第 77-92 行

- [ ] **添加 `POST /:runId/checkpoint-update`**

```ts
router.post('/:runId/checkpoint-update', withErrorHandling(async (req, res) => {
  const { editedData, checkpointNumber } = validateWithSchema(z.object({
    editedData: z.record(z.string(), z.unknown()),
    checkpointNumber: z.number().min(1).max(3),
  }), req.body);

  const run = pipelineRepo.getRunWithThreadId(p(req.params.runId));
  if (!run?.thread_id) {
    res.json({ success: false, error: 'No active thread' });
    return;
  }

  // 映射前端 payload key → graph state key
  const stateKeys: Record<string, unknown> = {};
  if (checkpointNumber === 1) {
    if (editedData.conditions) stateKeys.testConditions = editedData.conditions;
    if (editedData.analysis) stateKeys.requirementAnalysis = editedData.analysis;
  } else if (checkpointNumber === 2) {
    if (editedData.cases) stateKeys.draftTestCases = editedData.cases;
  } else if (checkpointNumber === 3) {
    if (editedData.cases) stateKeys.finalTestCases = editedData.cases;
    if (editedData.matrix) stateKeys.coverageMatrix = editedData.matrix;
  }

  // 新建 graph 写入 checkpointer
  const provider = createAIProviderWithFallback(/* 需要从 run.config 重建 */);
  // ... 重建 provider 的逻辑从 resumePipeline 复制
  const graph = createTestGenerationPipeline(provider, roles, {}, {}, new SqliteSaver(db));
  await graph.updateState(
    { configurable: { thread_id: run.thread_id } },
    stateKeys,
  );

  res.json({ success: true });
}));
```

注意: 重建 provider 需要 run.config 中的 providerConfigName/type 信息

- [ ] **添加 `GET /:runId/checkpoint-state`**

```ts
router.get('/:runId/checkpoint-state', withErrorHandling(async (req, res) => {
  const runId = p(req.params.runId);
  const run = pipelineRepo.getRunWithThreadId(runId);
  if (!run?.thread_id) {
    res.json({ checkpointData: null });
    return;
  }

  // TTL touch
  pipelineRepo.touchRun(runId);

  const provider = createAIProviderWithFallback(/* 从 run.config 重建 */);
  const graph = createTestGenerationPipeline(provider, roles, {}, {}, new SqliteSaver(db));
  const snapshot = await graph.getState({
    configurable: { thread_id: run.thread_id }
  });

  const checkpointData = mapStateToPayload(snapshot.values, run.phase);
  res.json({ checkpointData });
}));
```

- [ ] **添加 `mapStateToPayload` 辅助函数**

放在 `test-gen-service.ts` 或 `index.ts` 顶部：

```ts
function mapStateToPayload(state: any, phase: string): any {
  switch (phase) {
    case 'review-conditions':
      return {
        conditions: state.testConditions ?? [],
        analysis: state.requirementAnalysis ?? null,
      };
    case 'review-draft':
      return { cases: state.draftTestCases ?? [] };
    case 'final-review':
      return {
        cases: state.finalTestCases ?? [],
        matrix: state.coverageMatrix ?? null,
      };
    default:
      return null;
  }
}
```

---

### Task 7: 简化 startPipeline 中的 checkpoint 存储

**Files:**
- Modify: `server/.../application/test-gen-service.ts`

- [ ] **删除 `startPipeline` 中的 `setCheckpointData` 调用**

两处:
1. `startPipeline` 中 `outcome.type === 'interrupt'` 后的 `pipelineRepo.setCheckpointData(runId, outcome.interrupt.payload, outcome.interrupt.phase);`
2. `onBatchInterrupt` 回调中的 `pipelineRepo.setCheckpointData(runId, interrupt.payload, interrupt.phase);`

只保留 `pipelineRepo.updateThreadId(runId, outcome.interrupt.threadId);`

- [ ] **更新 `InteractiveResolver` 构造（不再传 saveCheckpoint 回调）**

```ts
const resolver = runMode === 'interactive'
  ? new InteractiveResolver(this.sseGateway)
  : new AutoResolver();
```

---

### Task 8: 前端 — 简化 buildRestoredNodes

**Files:**
- Modify: `client/.../types.ts`

- [ ] **删除 `checkpointData` 参数和返回值**

```ts
// 旧签名:
export function buildRestoredNodes(
  phase: string, status: string, checkpointData?: any, totalBatches?: number,
): { nodes: TestGenNode[]; checkpointDataResult: any | null }

// 新签名:
export function buildRestoredNodes(
  phase: string, status: string, totalBatches?: number,
): TestGenNode[]
```

- [ ] **删除 checkpointDataResult 相关逻辑**

删除第 172-183 行的 `let checkpointDataResult` 和 if/else 块

- [ ] **更新返回值**

```ts
return nodes;
```

---

### Task 9: 前端 — 更新 reducer

**Files:**
- Modify: `client/.../test-gen-reducer.ts`
- Modify: `client/.../types.ts`（状态接口）

- [ ] **从 `TestGenRunState` 接口删除 `checkpointData` 字段**

- [ ] **从 `RESTORE_RUN` action 类型中删除 `checkpointData`**

- [ ] **更新 reducer 中的 `RESTORE_RUN` 处理**

```ts
case 'RESTORE_RUN': {
  const restoredNodes = buildRestoredNodes(
    action.phase, action.status, action.totalBatches,
  );
  ...
  return {
    ...state,
    runId: action.runId,
    mode: action.mode ?? state.mode,
    nodes: restoredNodes,
    isRunning,
    // 不再设置 checkpointData
    ...
  };
}
```

- [ ] **更新 `SSE_EVENT` 中的 `checkpoint:waiting` 处理**

目前：`checkpointData = data.payload;` → 删除赋值，改用独立字段或直接使用

注意: 这会影响 `CheckpointEditView` 的 `checkpointData` prop。我们需要一个替代方案来传递实时 SSE 数据。

最简单的方案: 添加一个独立的 `liveCheckpointData` 到 state，仅由 SSE 设置，不作为持久状态。

或者更好: 让前端通过新 API `GET /checkpoint-state` 获取 checkpoint 数据，SSE `checkpoint:waiting` 只用来通知 UI 刷新。

让我重新设计这个流程...

实际上，对于实时流 (SSE)，`checkpoint:waiting` 事件 payload 直接包含了需要展示的数据。我们可以：
1. 在 reducer 中把 payload 存到一个 `liveData` 字段
2. `selectedCheckpointData` 从 `liveData` 读取
3. 历史加载时从 API 获取

或者更简单: 保留 `checkpointData` 作为纯 transient 字段，但只由 SSE 设置，不由 `RESTORE_RUN` 设置。

让我重建设计方案:

在 `TestGenRunState` 中保留 `checkpointData` 字段，但:
- 只由 SSE `checkpoint:waiting` 设置 (reducer 第 142 行)
- 不由 `RESTORE_RUN` 设置
- `createInitialState` 为 null
- `RUN_STARTED` 重置为 null

这样需要改动:
- `types.ts`: 保留 `checkpointData` 字段 (但注释改为 "仅 SSE 使用")
- `types.ts`: `buildRestoredNodes` 删除相关逻辑
- `test-gen-reducer.ts`: `RESTORE_RUN` 不设 `checkpointData`
- `useTestGenRun.ts`: `loadRun`/`refresh` 中调新 API 获取 checkpoint 数据

---

### Task 10: 前端 — 更新 useTestGenRun

**Files:**
- Modify: `client/.../useTestGenRun.ts`

- [ ] **修改 `refresh()` — 调新 API 获取 checkpoint 数据**

```ts
const refresh = useCallback(async () => {
  if (!state.runId) return;
  try {
    const runInfo = await api.get(state.runId);
    if (runInfo) {
      dispatch({
        type: 'RESTORE_RUN',
        runId: runInfo.id,
        phase: runInfo.phase,
        status: runInfo.status,
        mode: runInfo.mode ?? state.mode,
        totalBatches: runInfo.total_batches,
      });
      
      // 如果有 thread_id, 获取 checkpoint state
      if (runInfo.thread_id && runInfo.status === 'WAITING_REVIEW') {
        const cpState = await api.testGen.getCheckpointState(state.runId);
        if (cpState?.checkpointData) {
          dispatch({ type: 'SSE_EVENT', event: {
            type: 'checkpoint:waiting',
            data: {
              payload: cpState.checkpointData,
              checkpointNumber: /* 从 phase 推断 */,
            }
          }});
        }
      }
    }
  } catch {}
}, [state.runId, state.mode, api]);
```

- [ ] **修改 `loadRun()` — 同上**

- [ ] **修改 `selectedCheckpointData` — 移除 agent_logs fallback**

因为现在 history 加载也会设置 checkpointData（通过 API），不再需要 fallback 到 agent_logs。

注意：需要保持 `useTestGenRun` 的 `checkpointData` 返回值

- [ ] **修改 `selectedCheckpointData` computed prop**

始终保持 `state.checkpointData` 作为唯一来源:
```ts
const selectedCheckpointData = (() => {
  if (selectedNode?.kind !== 'checkpoint') return null;
  return state.checkpointData;
})();
```

---

### Task 11: 前端 — 更新 AiTestGenPage

**Files:**
- Modify: `client/.../AiTestGenPage.tsx`

- [ ] **修改 `handleDoneReviewing` — 调新 API**

```ts
const handleDoneReviewing = useCallback(async () => {
  if (pipeline.selectedNode?.kind === 'checkpoint' && checkpointEditedData.current && pipeline.runId) {
    const { api } = await import('@/shared/services/api');
    const nodeId = pipeline.selectedNode.id;
    const cpMap: Record<string, number> = {
      checkpoint_1: 1, checkpoint_2: 2, checkpoint_3: 3,
    };
    const cpNum = cpMap[nodeId];
    if (cpNum) {
      await api.testGen.saveCheckpointUpdate(
        pipeline.runId,
        checkpointEditedData.current,
        cpNum,
      );
    }
  }
  setReviewMode(false);
}, [pipeline]);
```

---

### Task 12: 前端 — 添加新 API 方法

**Files:**
- Modify: `client/shared/services/api.ts` (或对应的 API 层)

- [ ] **添加 `saveCheckpointUpdate` 方法**

```ts
async saveCheckpointUpdate(runId: string, editedData: any, checkpointNumber: number) {
  return this.post(`/test-gen/${runId}/checkpoint-update`, { editedData, checkpointNumber });
}
```

- [ ] **添加 `getCheckpointState` 方法**

```ts
async getCheckpointState(runId: string) {
  return this.get(`/test-gen/${runId}/checkpoint-state`);
}
```

---

### Task 13: 迁移 — 删除 checkpoint_data 列

**Files:**
- Create: `server/migrations/023_drop_checkpoint_data.ts`

```ts
import { db } from '../../shared/db/client.ts';

export function up(): void {
  db.prepare('ALTER TABLE test_gen_runs DROP COLUMN checkpoint_data').run();
  console.log('[Migration 023] Dropped checkpoint_data column from test_gen_runs');
}

export function down(): void {
  db.prepare('ALTER TABLE test_gen_runs ADD COLUMN checkpoint_data TEXT').run();
  console.log('[Migration 023] Re-added checkpoint_data column to test_gen_runs');
}
```

测试验证:
```ts
// 验证列已删除
const columns = db.prepare("PRAGMA table_info('test_gen_runs')").all() as any[];
const hasCol = columns.some((c: any) => c.name === 'checkpoint_data');
console.log(`checkpoint_data column exists: ${hasCol}`); // false
```

---

### Task 14: 测试更新

**Files:**
- Delete: `server/.../__tests__/checkpoint-persistence.test.ts`（覆盖旧 DB 流程）
- Modify: `server/.../__tests__/test-gen-service.test.ts`

- [ ] **删除 `checkpoint-persistence.test.ts`**

- [ ] **添加新测试: `checkpoint-update-state.test.ts`**

```ts
// 1. 测试 updateState 写入 checkpointer 后 getState 能读到
// 2. 测试 编辑 → resume → onResolve 读到的是编辑后的 state
// 3. 测试 getStateHistory 能列出历史 checkpoint
```

---

### Task 15: 恢复流程中的 getState 替换

**Files:**
- Modify: `server/.../application/test-gen-service.ts`

- [ ] **重构 `recoverInterruptedRuns()` — 用 `getState` 替代 `checkpoint_data`**

```ts
async recoverInterruptedRuns(): Promise<void> {
  const waitingRuns = pipelineRepo.getWaitingRuns();
  if (waitingRuns.length === 0) return;

  for (const run of waitingRuns) {
    pipelineRepo.touchRun(run.id);

    let payload: any = null;
    try {
      const graph = await this.createPipelineFactory(/*...*/)();
      const snapshot = await graph.getState({
        configurable: { thread_id: run.thread_id }
      });
      if (snapshot?.values) {
        payload = mapStateToPayload(snapshot.values, run.phase);
      }
    } catch (err) {
      console.error(`[Recovery] Failed to get state for run ${run.id}:`, err);
      continue;
    }

    if (payload) {
      this.sseGateway.emit(run.id, 'checkpoint:waiting', {
        checkpointId: `${run.id}-cp-${run.phase}`,
        type: run.phase,
        summary: payload.conditions
          ? `${payload.conditions.length} Test Conditions`
          : payload.cases
            ? `${payload.cases.length} Draft Cases`
            : 'Final Review',
        payload,
        recovered: true,
      });
    }
  }
}
```

注意: `recoverInterruptedRuns` 在服务启动时调用，此时可能没有完整的 provider。可以考虑惰性创建 provider 或创建一个 mock provider 仅用于读 state。

更好的方案：延迟到 SSE 连接时再获取 state（前端连接 SSE 时触发一次读取），而非启动时强制创建 provider。

```ts
// 简化: recoverInterruptedRuns 只 touchRun + emit checkpoint:waiting (无 payload)
// 前端收到 checkpoint:waiting 后通过 GET /checkpoint-state 获取实际数据
```

这个方案更好 — `recoverInterruptedRuns` 不需要创建 graph，只需要通知前端重新连接。

---

### 执行顺序

1. Task 1: onResolve 修改（最内层，不影响其他）
2. Task 4: session.ts（删除 originalPayload）
3. Task 5 + Task 7: service.ts（删除 checkpoint_data 引用 + 简化）
4. Task 2: repository.ts（删除 checkpoint_data 方法）
5. Task 3: checkpoint-resolver.ts（删除 saveCheckpoint）
6. Task 6: index.ts（删除旧端点 + 添加新端点）
7. Task 13: migration
8. Task 8-12: 前端
9. Task 14: 测试
10. Task 15: 恢复流程
