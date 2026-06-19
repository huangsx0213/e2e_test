# Plan: AI Test Gen -> Stagehand -> TestBuilder 链路统一（简化版）

Date: 2026-06-19
Status: Reviewed / simplified
Owner: TBD

## 1. 目标

把 AI Test Gen 产出的 `NlTestCase` 调整为“更适合 Stagehand 消费”的形态，但保持它仍然是**意图语义优先的 NL case**，而不是把它硬改成 Playwright/Executor 的结构化脚本。

这次只做最小必要设计：

- 让 LLM 产出的步骤更接近 Stagehand 可执行输入
- 让 `AIRecordingSession` 能优先消费结构化字段
- 不动 recorder/translater/refiner/TestBuilder 主链路
- 不引入新的评分系统、状态系统、或大范围 schema 重构

## 2. Review 结论

基于当前代码，原设计里有几处和实现现实不匹配，或者复杂度明显偏高：

1. `natural_language_test_cases` 不是分表存储。
   - 实际上 `test_data` 和 `steps` 都是整段 JSON 文本，见 `server/migrations/013_ai_test_gen_schema.ts`。
   - 所以 `testData[].secret`、`steps[].description/target/data` 不需要单独 SQL 列。

2. `startUrl` 是唯一真正需要单独持久化的新顶层字段。
   - 当前 `repository.save()` 只落已有列，见 `server/modules/nl-cases/repository.ts`。
   - 如果希望从已保存的 NL case 再次录制时也能稳定拿到起始地址，就需要单独加 `start_url` 列。

3. 把 `action` 收紧为 24 个枚举并配套 scorer / hard gate，属于过度设计。
   - 当前各处对 `action` 都按 `string` 处理。
   - 真正影响录制成功率的不是“类型是否是 enum”，而是步骤是否原子、目标是否明确、数据是否结构化。

4. 明确鼓励独立 `assert*` 步骤会放大 recorder 当前盲区。
   - `AIRecordingSession` 会在每个步骤后用 `expected` 做验证。
   - recorder 主链路不记录纯断言动作，若设计里鼓励 `assertText` / `assertUrl` 作为单独步骤，TestBuilder 仍然看不到这些断言。
   - 更简单的做法是：本轮不把“独立断言步骤”作为主设计，断言继续放在每个 action 步骤的 `expected`。

5. 新增 `StagehandQualityScore`、`stagehandScore`、新的 UI gating，收益不成比例。
   - 当前流程里已经有 `selfReview` 和 `quality_manager`。
   - 这一轮先把 case 结构做好，比再叠一层 scorer 更划算。

## 3. 设计原则

- **只扩现有 `NlTestCase`**，不引入 sibling type。
- **action 继续是 string**，不做 TS/DB 强枚举。
- **NL case 仍然是意图语义优先**，但补充 `description` / `target` / `data`，让 Stagehand 更容易理解。
- **优先表达用户动作，不鼓励独立 assert 步骤**。
- **只为 `startUrl` 增加持久化列**；其他新增字段继续放在现有 JSON 中。
- **保留旧路径 fallback**：老 case 仍可继续按原逻辑录制。

## 4. 目标契约

在 `shared/contracts/index.ts` 上做最小扩展：

```ts
export interface NlTestCaseTestData {
  key: string;
  value: string;
  description: string;
  secret?: boolean;
}

export interface NlTestCaseStep {
  sequence: number;
  description?: string;
  action: string;
  target?: string;
  data?: string;
  expected: string;
}

export interface NlTestCase {
  // existing fields...
  startUrl?: string;
}
```

说明：

- `action` 仍是开放字符串，兼容旧数据和自由表达。
- `description` 是一句给人看的摘要，优先用于 review / UI 展示。
- `target` 表达“操作对象”，例如 `username field`、`Login button`。
- `data` 表达输入值或参数，例如 `${username}`、`${password}`。
- `startUrl` 是顶层起始地址，优先级高于从 `preconditions` / `testData` 猜 URL。

## 5. Stagehand-Friendly Case Format

这轮不定义新的 sibling type，也不强制 24 个 action enum；只要求 prompt 明确引导一种更适合 Stagehand 的书写方式。

### 5.1 推荐动作词汇

优先使用少量高频动作：

- `goto`
- `click`
- `fill`
- `press`
- `selectOption`
- `check`
- `uncheck`
- `hover`
- `setInputFiles`

其他动作仍允许，但不是本轮主优化对象。

### 5.2 约束规则

1. 一步一动作，避免 `and` / `then` 连接两个动词。
2. `description` 用一句话概括这个步骤给人看的意图。
3. `action` 写动作意图，`target` 写元素或页面对象，`data` 写输入值。
4. 对 `fill` / `press` / `selectOption` / `setInputFiles`，优先使用 `${key}` 引用 `testData`。
5. `expected` 必须是可观察结果。
6. 不鼓励独立 `assert*` 步骤；优先把校验写进前一个动作的 `expected`。
7. `startUrl` 有值时优先使用；否则才依赖首步 `goto` 或旧 fallback。

### 5.3 示例

```json
{
  "startUrl": "${loginUrl}",
  "testData": [
    { "key": "loginUrl", "value": "https://app.example.com/login", "description": "Login page URL" },
    { "key": "username", "value": "alice@example.com", "description": "Valid username" },
    { "key": "password", "value": "P@ssw0rd!", "description": "Valid password", "secret": true }
  ],
  "steps": [
    {
      "sequence": 1,
      "description": "Enter the valid username into the username field.",
      "action": "fill",
      "target": "username field",
      "data": "${username}",
      "expected": "username field shows the entered value"
    },
    {
      "sequence": 2,
      "description": "Enter the valid password into the password field.",
      "action": "fill",
      "target": "password field",
      "data": "${password}",
      "expected": "password field keeps the value masked"
    },
    {
      "sequence": 3,
      "description": "Click the Login button.",
      "action": "click",
      "target": "Login button",
      "expected": "dashboard page is shown"
    }
  ]
}
```

## 6. Stagehand 消费方式

`agent/recorder/ai-recording-session.ts` 做最小升级：

### 6.1 URL 解析优先级

1. `nlCase.startUrl`
2. 首步 `goto` 的 `data` 或 `target`（若是 URL）
3. 现有 `resolveStartUrl()` fallback

不再因为“没有 URL”直接抛错；如果三者都没有，就沿用当前页面继续执行。

### 6.2 指令合成

在 `AIRecordingSession` 内部增加一个本地 helper，用结构化字段优先合成 Stagehand instruction：

| action | instruction |
|---|---|
| `goto` | `Navigate to ${dataOrTarget}.` |
| `click` | `Click ${target}.` |
| `fill` | `Type "${data}" into ${target}.` |
| `press` | `Press ${data ?? 'Enter'} on ${target}.` |
| `selectOption` | `Select "${data}" in ${target}.` |
| `check` | `Check ${target}.` |
| `uncheck` | `Uncheck ${target}.` |
| `hover` | `Hover over ${target}.` |
| `setInputFiles` | `Upload ${data} to ${target}.` |
| other | fallback 到现有 `act(nlStep.action)` |

`description` 不作为 Stagehand 指令主输入，优先用于 review、日志和生成提示上下文。

### 6.3 数据解析

在调用 `act()` 前，把 `${key}` 替换为 `testData[key].value`。

### 6.4 验证

保持现有 `expected -> extract()` 路径，不新增 `assertionStrategy`，也不引入独立 assertion composer。

### 6.5 脱敏

`secret: true` 优先用于脱敏；旧 case 继续保留 `password|secret|token|key` 的 regex backstop。

## 7. Repository 与 Migration

### 7.1 只加一个列

新增 migration：

- `natural_language_test_cases.start_url TEXT NULL`

### 7.2 JSON 字段直接承载新增对象字段

以下字段不需要 SQL 列：

- `testData[].secret`
- `steps[].target`
- `steps[].data`
- `steps[].description`

因为 repository 已经直接 `JSON.stringify(record.testData)` / `JSON.stringify(record.steps)`。

### 7.3 不做历史回填

老数据继续走旧逻辑：

- 没有 `startUrl` -> fallback 猜 URL
- 没有 `secret` -> regex 判断敏感值
- 没有 `description/target/data` -> fallback 到原 `action`

## 8. 改造清单

### PR1 — 契约 + repository

- `shared/contracts/index.ts`
  - `NlTestCaseStep` 增加 `description/target/data`
  - `NlTestCaseTestData` 增加 `secret?`
  - `NlTestCase` 增加 `startUrl?`
- `server/modules/nl-cases/schema.ts`
  - 接受新字段
- `server/modules/nl-cases/mapper.ts`
  - 保留并透传新字段
- `server/modules/nl-cases/repository.ts`
  - 读写 `start_url`
  - `steps/testData` 继续 JSON 存储
- migration：新增 `start_url`

### PR2 — AI Test Gen prompt / schema

- `server/modules/ai-test-gen/graph/prompts.ts`
  - 增加简化版 Stagehand-friendly authoring guidance
  - 用例示例改为 `target/data/startUrl` 风格
  - 明确“不鼓励独立 assert 步骤”
- `server/modules/ai-test-gen/graph/nodes/designer.ts`
  - `steps` schema 接受 `description/target/data`
  - `testData` schema 从 `string[]` 改为对象数组
- `server/modules/ai-test-gen/graph/nodes/quality.ts`
  - 对齐同样的 step/testData 结构

### PR3 — Stagehand session

- `agent/recorder/ai-recording-session.ts`
  - `startUrl` 优先
  - `${key}` 替换
  - 结构化指令优先，未知 action fallback 旧路径
  - 无 URL 时不再抛错
  - `secret` 优先脱敏

## 9. 验证标准

只做有价值的代表性验证，不追求 96 case 这种机械矩阵：

1. repository round-trip
   - 新字段保存并读回
   - 老数据仍兼容

2. AI Test Gen schema
   - `testData` 支持对象数组
   - `steps` 支持 `description/target/data`

3. AI recording session
   - `startUrl` 优先于旧 fallback
   - `${key}` 替换正确
   - `fill/click/goto` 至少各覆盖 1 个结构化指令案例
   - 未识别 action 仍走 `act(nlStep.action)`
   - 无 URL 时不会抛错

## 10. 风险与回滚

| 风险 | 缓解 |
|---|---|
| LLM 仍输出自由文本 action | `AIRecordingSession` 保留原 `act(nlStep.action)` fallback |
| 老 case 缺新字段 | 所有新增字段 optional；旧路径继续工作 |
| 结构化指令表达不准 | 先只支持少量高频 action，未知动作回退 |
| `startUrl` 持久化变更引入 schema 风险 | migration 仅 1 列，可单独回滚 |

## 11. 不在本次范围

- `agent/recorder/{translator, consolidation, refiner, recording-bridge}.ts`
- `client/features/tests/TestBuilder.tsx`
- 新增独立 scorer / hard gate / `stagehandScore`
- 新增 `assertionStrategy` 等结构化断言协议
- 把 `action` 收紧为 enum 或增加 DB enum 约束
- 鼓励独立 `assert*` 步骤并修复 recorder assertion 盲区

## 12. 结论

这次设计应该聚焦在：

- **补充结构，而不是重写语义模型**
- **让 Stagehand 更容易消费，而不是把 NlTestCase 变成脚本 AST**
- **只持久化真正需要持久化的 `startUrl`**
- **避免把独立 assertion 设计成主路径**

如果后续证明 prompt 约束仍不足，再考虑额外的 lightweight lint / scorer；但不应该在这一轮先把这些复杂度引进来。
