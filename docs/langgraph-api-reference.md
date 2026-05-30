# LangGraph API 方法参考

适用于 `@langchain/langgraph` v1.3.0。  
标注说明：✅ 已使用　🔶 未使用但适合我们项目　❌ 不适用

---

## 1. StateGraph（构建时 API）

`new StateGraph(StateAnnotation)` — 创建图

| 方法 | 用途 | 状态 | 说明 |
|------|------|:----:|------|
| `addNode(name, nodeFn)` | 添加节点 | ✅ | |
| `addEdge(from, to)` | 添加固定边 | ✅ | |
| `addConditionalEdges(source, router)` | 添加条件边 | ✅ | |
| `addSequence(nodes[])` | 添加顺序节点链 | ❌ | 不如 addEdge 灵活 |
| `setEntryPoint(node)` | 设置入口点 | ❌ | 用 `addEdge(START, node)` 代替 |
| `setFinishPoint(node)` | 设置结束点 | ❌ | 用 `addEdge(node, END)` 代替 |
| `compile(config?)` | 编译为可执行图 | ✅ | 可传 `{ checkpointer, interruptBefore?, interruptAfter? }` |

### compile 配置选项

| 参数 | 类型 | 用途 | 状态 |
|------|------|------|:----:|
| `checkpointer` | `BaseCheckpointSaver` | 持久化 checkpointer（必传才能用 interrupt） | ✅ |
| `interruptBefore` | `string[]` | 在指定节点**之前**自动中断（静态断点） | 🔶 |
| `interruptAfter` | `string[]` | 在指定节点**之后**自动中断（静态断点） | 🔶 |

> 我们当前用 `interrupt()` 动态中断，而非编译期静态中断。两者可共存。

---

## 2. CompiledStateGraph（运行时 API）

`graph.compile()` 的返回值。

### 2.1 核心执行

| 方法 | 签名 | 用途 | 状态 |
|------|------|------|:----:|
| `invoke(input, config?)` | `input: T \| Command \| null` | 同步执行到结束或首次中断 | 🔶 可替代 stream |
| `ainvoke(input, config?)` | async 版本 | 异步执行 | 🔶 可替代 stream |
| `stream(input, config?)` | 返回 `AsyncIterable<StreamChunk>` | 流式执行，每步产出 | ✅ |
| `astream(input, config?)` | async 版本 | 异步流式 | ❌ 用 stream 即可 |

### 2.2 状态查询

| 方法 | 签名 | 用途 | 状态 |
|------|------|:----:|------|
| `getState(config)` | → `StateSnapshot` | 获取指定 thread 的**最新** checkpoint 快照 | 🔶 |
| `getStateHistory(config)` | → `AsyncIterable<StateSnapshot>` | 获取指定 thread 的**所有历史** checkpoint | 🔶 |

### 2.3 状态修改

| 方法 | 签名 | 用途 | 状态 |
|------|------|:----:|------|
| `updateState(config, values, options?)` | → `RunnableConfig`（新 checkpoint 的 config） | **直接写入** checkpoint state，可指定 `asNode` | 🔶 |

### 2.4 工具/调试

| 方法 | 用途 | 状态 |
|------|------|:----:|
| `getGraph()` / `getGraphAsync()` | 返回图结构定义 | ❌ 调试用 |
| `getSubgraphs()` / `getSubgraphsAsync()` | 返回子图 | ❌ 子图场景 |
| `isInterrupted(config)` | 检查线程是否中断 | 🔶 |
| `getName()` | 返回状态图名称 | ❌ |

---

## 3. StateSnapshot（getState / getStateHistory 的返回值）

| 字段 | 类型 | 说明 |
|------|------|------|
| `values` | `State` (TypedDict) | **全量 state**，包含所有 key |
| `next` | `string[]` | 下一个要执行的节点名列表 |
| `config` | `RunnableConfig` | **该 checkpoint 的 config**（含 thread_id / checkpoint_id），可用于 fork |
| `metadata` | `CheckpointMetadata` | 元数据（来源 step、来源节点等） |
| `createdAt` | `Date` | 创建时间 |
| `parentConfig` | `RunnableConfig \| undefined` | 父 checkpoint config |
| `tasks` | `PregelTask[]` | 当前挂起的任务（中断时包含 interrupt 信息） |

---

## 4. 核心函数/类

### `interrupt(value)`

| | |
|---|---|
| 包 | `@langchain/langgraph` |
| 签名 | `interrupt<T>(value: T): T` |
| 用途 | 暂停图执行，序列化 state，返回给调用方。resume 时返回传给 `Command({resume})` 的值 |
| 外部数据 | `stream()` 输出的 chunk 含 `__interrupt__` 字段 |
| 状态 | ✅ 已使用 |

### `Command`

| | |
|---|---|
| 包 | `@langchain/langgraph` |
| 签名 | `new Command({ resume?: T, update?: Partial<State>, goto?: string })` |
| 用途 | resume 中断 / 修改 state 并跳转节点 |
| 关键字段 | • `resume` — interrupt() 的返回值<br>• `update` — 直接写 state（同 updateState）<br>• `goto` — 指定下一个节点（跳转） |
| 状态 | ✅ 已使用（仅 `resume`） |

### `updateState` vs `Command({update})`

两者功能重叠。区别：

| | `graph.updateState(config, values, options?)` | `new Command({ update: values, goto: node })` |
|---|---|---|
| 调用方 | 外部代码（API、测试） | 节点内部 / resume 入口 |
| 写入时机 | 在下次 invoke/resume 前 | 作为 graph stream 的一部分 |
| 持久化 | ✅ 写入 checkpointer | ✅ 写入 checkpointer |
| 适用场景 | 前端编辑后直接写入 state | 节点内或 resume 时同时修 state + 跳转 |

---

## 5. Checkpointer

### SqliteSaver（我们用的）

| 包 | `@langchain/langgraph-checkpoint-sqlite` v1.0.1 |
| 构造 | `new SqliteSaver(db: BetterSqlite3.Database)` |
| 状态 | ✅ 已使用 |

### 其他 checkpointer

| 类 | 用途 | 适用场景 |
|----|------|---------|
| `MemorySaver` | 内存，重启丢失 | 开发/测试 |
| `SqliteSaver` | 单文件 SQLite，单进程 | 本地/单实例生产 |
| `PostgresSaver` | PostgreSQL，支持并发 | 多实例/生产部署 |
| `AsyncPostgresSaver` | 异步版 Postgres | FastAPI 等异步场景 |
| `RedisSaver` | Redis | 低延迟场景 |

---

## 6. 构建时 API（Annotation）

| 函数 | 用途 | 状态 |
|------|------|:----:|
| `Annotation<T>()` | 定义 state 字段 | ✅ |
| `Annotation.Root({...})` | 定义根 state schema | ✅ |
| `Annotation<T>({ reducer, default })` | 自定义 reducer | ❌ 暂未用 |

---

## 7. 对我们项目最关键的未使用 API

以下是我们项目当前缺失、但对 HITL 完整的方案至关重要的 API：

### `graph.getState(config)`

```ts
const snapshot = await graph.getState({
  configurable: { thread_id: run.thread_id }
});
// snapshot.values  → 全量 graph state (testConditions, draftTestCases, finalTestCases...)
// snapshot.next     → 下一个执行的节点
// snapshot.config   → 含 checkpoint_id，可用于 fork
```

### `graph.getStateHistory(config)`

```ts
const history = [];
for await (const state of graph.getStateHistory({
  configurable: { thread_id: run.thread_id }
})) {
  history.push(state);
  // state.values      — 该节点的全量 snapshot
  // state.createdAt   — 时间戳
  // state.next[0]     — 之后要执行的节点
  // state.tasks       — 中断时的任务信息（含 interrupt value）
}
```

### `graph.updateState(config, values, options?)`

```ts
// 方案 A：直接写 state（推荐用于编辑持久化）
await graph.updateState(
  { configurable: { thread_id: run.thread_id } },
  { testConditions: editedConditions, phase: "analysis" }
);

// 方案 B：指定 asNode，影响 reducer 行为
await graph.updateState(
  { configurable: { thread_id: run.thread_id } },
  { testConditions: editedConditions },
  { asNode: "checkpoint_1" }
);

// 方案 C：fork — 从历史 checkpoint 创建分支（time travel）
await graph.updateState(
  historicalCheckpoint.config,   // 来自 getStateHistory 的某条
  { testConditions: forkedConditions }
);
```

### `graph.isInterrupted(config)`

```ts
if (await graph.isInterrupted({ configurable: { thread_id } })) {
  // 线程处于中断状态
}
```

### `interruptBefore` / `interruptAfter`（编译期静态断点）

```ts
const compiled = graph.compile({
  checkpointer,
  interruptAfter: ["agent_test_analyst"]  // 自动在 analyst 之后中断
});
```

### `StateSnapshot.tasks` 提取 interrupt payload

```ts
// 从 state snapshot 直接取出中断时的 payload，无需读取 checkpoint_data
const snapshot = await graph.getState(config);
const interruptPayloads = snapshot.tasks
  .filter(t => t.interrupts?.length > 0)
  .map(t => t.interrupts[0].value);
```

---

## 8. 我们当前的数据流 vs 原生 API 方案对比

| 场景 | 当前方案 | 原生 API 方案 |
|------|---------|-------------|
| **持久化全量 state** | ❌ 仅存 `checkpoint_data` 子集 | ✅ `SqliteSaver` 已自动做 |
| **编辑后保存** | PATCH → `checkpoint_data` 覆盖 | 🔄 `updateState()` → 直接写入 checkpointer |
| **历史回溯** | ❌ 单列覆盖，无历史 | ✅ `getStateHistory()` 列出所有 checkpoint |
| **加载历史查看** | `getRunInfo().checkpoint_data` | `getState(historicalConfig).values` 取全量 |
| **Fork 重跑** | ❌ 不支持 | ✅ `updateState(historicalConfig) → invoke(null, forkConfig)` |

---

## 9. 完整工作流示例（基于原生 API）

```
1. 用户创建 run
   → startBatch() / pipeline.stream(input, config)

2. checkpoint_1 中断
   → stream 产出 __interrupt__[0].value === { conditions, analysis }
   → 保存 thread_id + checkpoint_data（快捷缓存）

3. 用户编辑 + Approve
   → graph.updateState(config, { testConditions: editedConditions })
   → graph.invoke(Command({ resume: "approved" }), config)

4. 历史查看 (用户 reload)
   → snapshot = await graph.getState({ configurable: { thread_id } })
   → snapshot.values.testConditions  // 包含用户的编辑
   → snapshot.values.requirementAnalysis

5. 回溯 cp1 (即使已到 cp3)
   → for await (const s of graph.getStateHistory(config)) { ... }
   → 找到 checkpoint_1 对应的 snapshot
   → snapshot.values === cp1 时的全量 state
```
