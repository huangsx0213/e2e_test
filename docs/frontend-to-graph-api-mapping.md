# 前端流程 → Graph API 映射

## 流程总览

```
FRONTEND (用户操作)       →  BACKEND API           →  LANGGRAPH API
```

---

## 1. 启动 Pipeline

```
用户: 点击 "Start"
  → POST /{projectId}/start
  → TestGenService.startPipeline()
  → session.startBatch(inputState)
    → pipeline.stream(inputState, { thread_id })
    → 无 graph API 调用 (首次 invoke 由 stream 触发)
    → stream 产出 __interrupt__ → 检测到中断 → 返回 payload

  → InteractiveResolver.onInterrupt(runId, cpNum, phase, payload)
    → [删除] pipelineRepo.setCheckpointData()  ← 不再写入 DB
    → SSE emit 'checkpoint:waiting' { payload }  ← 保留

前端收到 SSE 'checkpoint:waiting'
  → reducer: state.checkpointData = event.payload
  → UI 展示 payload.conditions / payload.cases
```

**涉及 Graph API: 无**（pipeline.stream 是内部调用）

---

## 2. 编辑 Checkpoint 数据

```
用户: 在 CheckpointEditView 中编辑 → 点击 "Save Edits"

  → POST /{runId}/checkpoint-update
     body: { editedData: { conditions: [...], analysis: {...} },
             checkpointNumber: 1 }

  → 服务端:
      // 1. 获取 thread_id
      const run = pipelineRepo.getRunWithThreadId(runId)

      // 2. 新建 graph 实例
      const graph = await pipelineFactory()
      const config = { configurable: { thread_id: run.thread_id } }

      // 3. 映射前端 payload key → graph state key
      const stateUpdate = mapPayloadToState(checkpointNumber, editedData)
      // cp1: { testConditions: editedData.conditions,
      //        requirementAnalysis: editedData.analysis }
      // cp2: { draftTestCases: editedData.cases }
      // cp3: { finalTestCases: editedData.cases,
      //        coverageMatrix: editedData.matrix }

      // 4. ★★★ 直接写入 checkpointer ★★★
      await graph.updateState(config, stateUpdate)
```

**涉及 Graph API: `updateState(config, stateKeys)`**

---

## 3. Approve Checkpoint

```
用户: 点击 "Approve"

  → POST /{runId}/resume
     body: { action: 'approve' }
     // ★ 注意: 不再传 editedData

  → TestGenService.resumePipeline(runId, 'approve')
    → session.resumeBatch(threadId, { action: 'approve' })
      → new Command({ resume: "approved" })
      → pipeline.stream(Command({ resume: "approved" }), config)

  → Graph resume:
      interrupt() 返回 "approved"
      → onResolve(state, "approved"):
          // ★★★ 改为从 state 读取 ★★★
          approvedConditions = state.testConditions
          // ← 如果用户编辑过, 已由 updateState 写到 state 中
          // ← 如果未编辑, 是 LLM 原始输出
          humanReviewFeedback = ""
          phase = "design"
```

**涉及 Graph API: `Command({ resume })` + `onResolve` 内部读 state**

---

## 4. Retry Checkpoint

```
用户: 点击 "Retry" (带反馈)

  → POST /{runId}/resume
     body: { action: 'retry', feedback: '请调整 X' }

  → session.resumeBatch(threadId, { action: 'retry', feedback })
    → new Command({ resume: { retry: true, feedback } })
    → pipeline.stream(Command, config)

  → Graph resume:
      interrupt() 返回 { retry: true, feedback: '请调整 X' }
      → onRetry(state, response):
          humanReviewFeedback = response.feedback
          phase = 'analysis'  // 退回 agent 重新执行
```

**涉及 Graph API: `Command({ resume })` + `onRetry` （不变）**

---

## 5. 自动模式 (Auto Mode)

```
后端自动执行，无前端操作:

  TestGenSession.startBatch() while-loop:

    [第 1 次] stream(inputState)
      → 中断 cp1 → payload1

    [构建 resumeState]
      → buildResumeState(1, { action: 'approve' }, payload1)
      → { conditions: payload1.conditions, ... }

    [第 2 次] stream(Command({ resume: resumeState }))
      → ★★ onResolve(state, resumeState):
          approvedConditions = state.testConditions  ← 不读 resumeState
          // ...
          phase = 'design'
      → test_designer 执行 → 中断 cp2 → payload2

    [第 3 次] stream(Command({ resume: resumeState2 }))
      → approvedDraftCases = state.draftTestCases  ← 不读 resumeState
      → phase = 'quality'
      → quality_manager 执行 → 中断 cp3 → payload3

    [第 4 次] stream(Command({ resume: resumeState3 }))
      → phase = 'complete'  (cp3 本来就忽略 response)
      → END
```

**涉及 Graph API: 同上 `Command({ resume })` + 修改后的 `onResolve`**

---

## 6. 加载历史 (history reload)

```
用户: 从 History 面板选择一条 run

  → pipeline.loadRun(runId)
    → api.get(runId)
        ← 返回 { id, status, phase, thread_id, ... }
           // ★ 不再包含 checkpoint_data

    → 如果 thread_id 存在:
        → GET /{runId}/checkpoint-state?thread_id=xxx
        → 服务端:
            const graph = await pipelineFactory()
            const snapshot = await graph.getState({
              configurable: { thread_id }
            })
            // snapshot.values === 全量 graph state

            // 根据 phase 映射到前端需要的形状:
            const mapped = mapStateToPayload(snapshot.values, phase)
            // phase='review-conditions':
            //   { conditions: values.testConditions,
            //     analysis: values.requirementAnalysis }
            // phase='review-draft':
            //   { cases: values.draftTestCases }
            // phase='final-review':
            //   { cases: values.finalTestCases,
            //     matrix: values.coverageMatrix }

            ← { checkpointData: mapped }

前端收到
  → RESTORE_RUN: checkpointData = response.checkpointData
  → CheckpointEditView 显示数据

  // 如果 thread_id 不存在 (数据库被清理等):
  → 回退到 agent_logs (与当前逻辑一致)
```

**涉及 Graph API: `getState(config).values`**

---

## 7. 加载 Checkpoint 历史 (查看所有阶段的快照)

```
用户: 在 history 中点击不同 checkpoint 节点

  → GET /{runId}/checkpoint-history?thread_id=xxx
  → 服务端:
      const graph = await pipelineFactory()
      const history = []
      for await (const state of graph.getStateHistory({
        configurable: { thread_id }
      })) {
        // state.values  — 该超步的全量 state
        // state.next    — 后续要执行的节点
        // state.createdAt — 时间戳

        // 识别这是哪个 checkpoint:
        if (state.values.testConditions && !state.values.approvedConditions) {
          history.push({
            phase: 'review-conditions',
            checkpointData: {
              conditions: state.values.testConditions,
              analysis: state.values.requirementAnalysis
            },
            timestamp: state.createdAt
          })
        }
        if (state.values.draftTestCases && !state.values.approvedDraftCases) {
          // ...
        }
        if (state.values.finalTestCases) {
          // ...
        }
      }

      ← history[]

  → 前端按 checkpoint 序号索引
  → 用户切换节点时直接显示对应快照
```

**涉及 Graph API: `getStateHistory(config)` → 遍历查找对应快照**

---

## 8. 服务重启后恢复

```
服务器重启
  → TestGenService.recoverInterruptedRuns()
  → pipelineRepo.getWaitingRuns()  (删除 checkpoint_data 读取)
  → 对每个 run:
      const graph = await pipelineFactory()
      const snapshot = await graph.getState({
        configurable: { thread_id: run.thread_id }
      })

      // 从 state 提取 payload 形状的数据
      const phase = snapshot.next?.[0] 或从 run.phase 判断
      const payload = mapStateToPayload(snapshot.values, phase)

      SSE emit 'checkpoint:waiting' { payload, recovered: true }
```

**涉及 Graph API: `getState(config).values`**

---

## 9. 超时监控

```
startCheckpointTimeoutMonitor()
  → 每 60s 轮询 getWaitingRuns()
  → 比较 updated_at 是否超时
  → 超时则调用 abortRun()

  // 不再需要 checkpoint_data 来更新 TTL
  // touchRun() 仅更新 updated_at 字段
  // (thread_id 不变, checkpointer 数据不受影响)
```

**涉及 Graph API: 无**

---

## 10. 对应关系速查表

| # | 前端操作 | 当前 API | 新 API | Graph API |
|---|---------|---------|--------|-----------|
| 1 | 启动 | POST /start | 不变 | 内部 `.stream()` |
| 2 | 编辑 | PATCH /checkpoint-data | **POST /checkpoint-update** | **`updateState()`** |
| 3 | Approve | POST /resume { editedData } | POST /resume (无 editedData) | `Command({resume})` + **onResolve 读 state** |
| 4 | Retry | POST /resume { action:'retry' } | 不变 | `Command({resume})` + onRetry |
| 5 | 加载历史 | api.get() 返回 checkpoint_data | **GET /checkpoint-state** | **`getState().values`** |
| 6 | 切换历史节点 | 无（只有最新） | **GET /checkpoint-history** | **`getStateHistory()`** |
| 7 | 重启恢复 | getWaitingRuns 读 checkpoint_data | 同上 GET /checkpoint-state | **`getState().values`** |
| 8 | 自动模式 | buildResumeState + Command | **onResolve 改读 state** | 无新增 |

## 关键变化总结

```
写入路径:
  [旧] 编辑 → PATCH → DB checkpoint_data → resume → Command({resume}) → onResolve(response)
  [新] 编辑 → POST /checkpoint-update → updateState(config, stateKeys) → ★ 直接进 checkpointer ★
       批准 → POST /resume → Command({resume:"approved"}) → onResolve(state) ← 从 state 读

读取路径:
  [旧] 历史加载 → api.get() → DB checkpoint_data → RESTORE_RUN
  [新] 历史加载 → GET /checkpoint-state → getState(config).values → RESTORE_RUN

删除:
  setCheckpointData()       — DB 写入 (不再需要)
  updateCheckpointData()    — DB 写入 (不再需要)
  PATCH /checkpoint-data    — 路由 (不再需要)
  checkpoint_data 列         — 迁移删除
  buildResumeState() approve 路径 — 数据不再被读取
  checkpointData fallback to agent_logs — 由 getState API 替代
```
