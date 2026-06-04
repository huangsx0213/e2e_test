# AI Test Gen Skill 渐进式披露：实施方案 v2

> **文档类型**：实施 spec
> **创建日期**：2026-06-03
> **作者**：基于 2026-06-02 业界研究 + 现状对账 + 用户决策
> **目标读者**：架构师、Agent 实现者、Prompt 工程师
> **前置阅读**：[2026-06-02-test-gen-skill-progressive-disclosure-industry-research.md](./2026-06-02-test-gen-skill-progressive-disclosure-industry-research.md) — 业界研究
> **关联文档**：
> - [2026-05-31-interpreter-skill-progressive-discovery.md](./2026-05-31-interpreter-skill-progressive-discovery.md) — 初始架构定义
> - [skill-context-design.md](../skill-context-design.md) — Skill Context 设计
> - [skills-guide.md](../skills-guide.md) — Skill 编写指南
> - [ai-test-gen.md](../ai-test-gen.md) — AI Test Gen 功能说明

---

## 0. 术语

沿用 [2026-06-02 业界研究 §0](./2026-06-02-test-gen-skill-progressive-disclosure-industry-research.md#0-术语)，新增：

| 术语 | 定义 |
|------|------|
| **Mode B 残留** | 当前代码里 Mode B Orchestrator 相关的死代码：`test-orchestrator.ts` 角色、`spawn_subagent` 工具、`request_review` 工具、`tool-orchestrator.ts` 动态图包装。无 HTTP 路由调用。 |
| **Preload Skill** | role 启动时**自动**调用 `skill/index.ts` 主入口的 skill（结果注入 prompt，LLM 不用学工具）。本方案 v2 不引入——走"LLM 显式 `execute_skill_module`" 路径。 |
| **Skill-Aware Sub-Agent** | 内部启用 ReAct loop、暴露 skill 工具的固定角色（test_analyst / test_designer / quality_manager）。区别于 Mode B 的自由 Orchestrator。 |

---

## 1. 背景与现状对账

### 1.1 业界研究的核心目标

[2026-06-02 业界研究](./2026-06-02-test-gen-skill-progressive-disclosure-industry-research.md#1-背景与动机) 指出 Mode A 的 token 浪费问题：

| Agent | 当前 `requiredSkills` 全量加载 | 折算 tokens |
|-------|------------------------------|------------|
| `TestAnalystRole` | 5 个 skill SKILL.md + 59KB requirement-index/references/index.json | **~21,000** |
| `TestDesignerRole` | 2 个 skill | **~4,500** |
| `QualityManagerRole` | 2 个 skill | **~4,600** |
| **3 agent × N batch** | | **~30,100 × N** |

业界研究的 3 阶段路线（Phase 1 metadata-only → Phase 2 ReAct + skill/index.ts → Phase 3 MCP resources）是**通用方案**。本 v2 文档**把通用方案对齐到 QuantumQA 现状**。

### 1.2 当前代码现状（2026-06-03 实际查证）

| 模块 | 状态 | 文件 |
|------|------|------|
| **Skill 目录** | ✅ 7 个已存在（test-analyst / test-designer / quality-manager / flow-design / requirement-index / requirement-query / requirement-analysis），每个都有 `SKILL.md` + `index.ts` | `shared/ai/skills/*/` |
| **Skill 系统** | ✅ `skill-registry.ts` / `skill-loader.ts` / `skill-cache.ts` / `skill-tools.ts` 全部实现 | `shared/ai/skills.ts*` |
| **Skill 工具** | ✅ `search_skills` / `load_skill` / `execute_skill_module` / `request_review` 4 个工具已实现 | `shared/ai/skill-tools.ts:4-80` |
| **Deterministic 函数** | ✅ test-analyst/skill/index.ts 已实现 `analyzeConditions` / `inferRiskLevel` / `inferPriority` / `inferCategories` / `selectTechnique` / `buildCoverageDimensions`（覆盖业界研究 §4.1 表格的 5 项 deterministic 决策） | `shared/ai/skills/test-analyst/index.ts:34-112` |
| **ReAct loop** | ✅ 已实现（`maxIterations: 15`，但默认 `useReActLoop: false`） | `shared/ai/agent.ts:151` |
| **ReAct 工具执行器** | ✅ 已实现，4 个核心工具 + 1 个 `spawn_subagent` | `shared/ai/tool.ts:189-238` |
| **3 sub-agent role 启用 progressive disclosure** | ❌ **未启用**（`TestAnalystRole` / `TestDesignerRole` / `QualityManagerRole` 都没设 `useProgressiveDisclosure: true`） | `shared/ai/roles/{test-analyst,test-designer,quality-manager}.ts` |
| **3 sub-agent role 的 `allowedTools`** | ⚠️ 只声明 `['execute_skill_module']`，**没有 `search_skills` / `load_skill`**（LLM 看不到 skill 索引） | `shared/ai/roles/{test-analyst,test-designer,quality-manager}.ts` |
| **Mode B Orchestrator 角色** | ⚠️ 还在（`useProgressiveDisclosure: true` 但**无 HTTP 路由调用**） | `shared/ai/roles/test-orchestrator.ts` |
| **`spawn_subagent` 工具** | ⚠️ 还在（仅 Mode B 路径用） | `shared/ai/tool.ts:203-228` |
| **`request_review` 工具** | ⚠️ 还在（仅 Mode B 路径用） | `shared/ai/skill-tools.ts:65-80` |
| **`tool-orchestrator.ts` 动态图包装** | ⚠️ 还在（生产用 orchestrated pipeline，但内容是给 Mode B 的） | `shared/ai/tool-orchestrator.ts` |
| **`tool-converter.ts`** | ⚠️ 还在（tool-orchestrator 配套） | `shared/ai/tool-converter.ts` |
| **`react-loop-state.ts`** | ✅ 还在用（sub-agent 启用 ReAct 需要） | `shared/ai/react-loop-state.ts` |
| **requirement-index 59KB JSON** | ❌ **未拆**（`references/index.json` 仍是单文件，每次 Analyst 调用全量注入 prompt） | `shared/ai/skills/requirement-index/references/index.json` |

**关键洞察**：
1. **业界研究 §5 Phase 1 改 3 行代码**——指的是把 3 个 sub-agent role 加上 `useProgressiveDisclosure: true`。当前**确实没加**，所以 Phase 1 是 from-scratch。
2. **业界研究 §5 Phase 2 重开 ReAct + 利用 skill/index.ts**——ReAct loop 已实现，skill/index.ts deterministic 函数已实现，**只是没接起来**。所以 Phase 2 是"接线"，不是 from-scratch。
3. **业界研究 §5 Phase 3 拆 59KB JSON**——当前**完全没做**。
4. **Mode B 整套是 Mode A 演进过程中的过渡态**——业界研究没明说要砍，但当前代码里它是死代码（无路由调用）。用户已决策"砍 Mode B"。

### 1.3 三个症状（沿用业界研究 §1.2）

1. **Token 浪费**：每次调用都加载所有 `requiredSkills` 全文 + 所有 references
2. **违反 Progressive Disclosure 原则**：3 个 sub-agent role 的 `useProgressiveDisclosure` 默认 `false`，全量加载
3. **按需加载工具不可用**：`allowedTools` 只声明 `execute_skill_module`，且 `useReActLoop: false` 关闭了工具暴露

### 1.4 文档目标

1. 把业界研究的通用方案**对齐到 QuantumQA 现状**
2. **砍 Mode B**（业界研究没明说但用户已决策）
3. 解决"skill/index.ts 已实现但 LLM 不调"的接线问题
4. 拆 59KB requirement-index JSON

---

## 2. 范围与决策

### 2.1 决策表（grill 结果）

| 决策点 | 选择 | 备注 |
|--------|------|------|
| **Mode B 砍不砍** | ✅ 砍 | 删 `test-orchestrator.ts` + `spawn_subagent` 工具 + `request_review` 工具 + `tool-orchestrator.ts` + `tool-converter.ts` |
| **Phase 3 做不做** | ✅ 全做 | 拆 59KB requirement-index JSON 为按需 resource |
| **SKILL.md description 重写** | ✅ Phase 1 立即重写 | 改"做什么"为"什么时候用" |
| **Token 节省目标** | 🎯 不预设，跑数据 | Phase 1 采集基线 token，Phase 2 完成后比对 |
| **PR 节奏** | 一把梭 | 一个 PR 包含所有 phase |
| **`allowedTools` 粒度** | 显式白名单 | 见 §2.2.1 解析 |
| **Deterministic 暴露方式** | `execute_skill_module` 调用 | 见 §2.2.2 解析 |
| **Phase 2.5 react-loop.ts 替换** | ✅ 追加，用 LangGraph `createReactAgent` 替代自实现 | 删 ~700 行；用户 grill 后决策 |
| **Phase 3 manifest/fetch MCP 化** | ❌ 保持自实现 | QuantumQA 单机产品，MCP 化过度 |
| **LangGraph state 兼容** | ✅ 保持 `AgentRunResult` 接口 | 用户 grill 后决策 |

### 2.2 关键解析（用户问的开放问题）

#### 2.2.1 `allowedTools` 配置粒度

| 方案 | LLM 自由度 | 调试透明度 | 配置成本 | 适用场景 |
|------|----------|----------|----------|----------|
| **A. 全开 4 工具** | 高 | 中 | 0（默认） | 通用 agent，LLM 自主 |
| **B. 显式白名单** | 中 | 高 | 中 | 角色职责差异大 |
| **C. 类别白名单** | 低 | 低 | 高 | 强隔离场景 |

**推荐：B. 显式白名单**。理由：

1. **3 个 sub-agent 职责差异大**：
   - `test_analyst` 是**探索型**——先 `search_skills` 看可用能力，再 `load_skill` 读内容，再 `execute_skill_module` 调函数
   - `test_designer` / `quality_manager` 是**执行型**——上游 `test_analyst` 已经挑了 skill，designer/quality 只需要 `load_skill` 补充细节 + `execute_skill_module` 调函数
2. **"全开"对 designer/quality 是冗余**——`search_skills` 走一遍后上游已经挑了，designer 再 search 没意义
3. **"类别白名单"过度限制**——LLM 看不到 category 外的 skill 反而限制了发现能力，且 skill 数量不会爆炸到需要这种保护
4. **配置自描述**——code review 时一眼看出"test_designer 不会 search"

**改前 vs 改后**：

| 角色 | 改前 `allowedTools` | 改后 |
|------|-------------------|------|
| `test-analyst` | `['execute_skill_module']` | `['search_skills', 'load_skill', 'execute_skill_module']` |
| `test-designer` | `['execute_skill_module']` | `['load_skill', 'execute_skill_module']` |
| `quality-manager` | `['execute_skill_module']` | `['load_skill', 'execute_skill_module']` |

**具体配置**：

```ts
// shared/ai/roles/test-analyst.ts:96
allowedTools: ['search_skills', 'load_skill', 'execute_skill_module']

// shared/ai/roles/test-designer.ts:60
allowedTools: ['load_skill', 'execute_skill_module']

// shared/ai/roles/quality-manager.ts:33
allowedTools: ['load_skill', 'execute_skill_module']
```

注：`test-orchestrator.ts` 角色被砍，其 `allowedTools` 跟着删。

#### 2.2.2 Deterministic 暴露方式

业界研究 §4.1 表格列出 7 类决策的归属（5 个 deterministic + 2 个 LLM）：

| 决策类型 | 归属 | 现状 |
|---------|------|------|
| ISTQB 技术选择（EP/BVA/DT/ST/UC） | ✅ `skill/index.ts` | 已实现（`selectTechnique`） |
| 覆盖维度枚举（输入域） | ✅ `skill/index.ts` | 已实现（`buildCoverageDimensions`） |
| 风险评级 | ✅ `skill/index.ts` | 已实现（`inferRiskLevel`） |
| 步骤拆解（precondition/action/expected） | 🧠 LLM | 待 LLM 精炼 |
| 步骤排序/原子性 | ✅ `skill/index.ts` | 部分（ID 分配已实现） |
| 自然语言表达 | 🧠 LLM | 待 LLM 精炼 |
| HITL 反馈应用 | ✅ `skill/index.ts` 中间件 | 待实现 |

**3 种暴露方式对比**：

| 维度 | A. `execute_skill_module` 调用 | B. 框架内自动注入 | C. 混合 |
|------|-----------------------------|------------------|--------|
| LLM 学习成本 | 1 个工具 | 0 | 1+ |
| LLM 决策权 | 强（何时调、调什么） | 无（框架自动） | 中 |
| 工具集复杂度 | 低 | 0 工具 | 中 |
| `skill/index.ts` 改动 | 无 | 中（要加 `preload` 抽象） | 大 |
| Debug 难度 | 中（tool_history 可观测） | 易 | 中 |
| 业界契合度 | ✅ Anthropic Skills / LangChain SQL Assistant | 闭门造车 | 复杂 |
| 复用现有 `index.ts` | ✅ 直接 | ❌ 要改 | ⚠️ 部分 |

**推荐：A. `execute_skill_module` 调用**。理由：

1. **业界契合**——Anthropic Agent Skills 协议默认就这么用，LangChain SQL Assistant 范例就是这模式
2. **零 `skill/index.ts` 改动**——`test-analyst/skill/index.ts` 已实现的 `analyzeConditions` / `inferRiskLevel` 等函数，LLM 一行 `tool_call` 就能复用
3. **LLM 决策权 + 可观测**——LLM 决定何时调、调哪个、传什么 args；`tool_history` 自动记录每次调用
4. **LLM 创造力不被剥夺**——LLM 看到 deterministic 结果后，还能做**精炼 / 覆盖补全 / NL 表达 / HITL 反馈应用**（正是业界研究 §4.1 表格"LLM 工作"那一列）
5. **无新抽象**——不引入"preload"概念，避免和现有 `skill/index.ts` 接口冲突

**具体调用模式**（伪代码，仅说明 LLM 预期行为）：

```
LLM 看到 system prompt: "You are a Test Analyst. To generate base test conditions,
                         call execute_skill_module('test-analyst', 'analyzeConditions', [requirements, projectContext])."

LLM 第一轮 tool_call:
  execute_skill_module(
    skillName='test-analyst',
    functionName='analyzeConditions',
    args=[requirements, projectContext]
  )
  → 返回 [{ id, requirementId, condition, category, riskLevel, primaryTechnique, ... }, ...]

LLM 第二轮思考: "Base conditions 出来了，HITL feedback 是 X，我需要：
  - 保留 id 匹配的 condition
  - 根据 feedback 调整 category / riskLevel
  - 用 LLM 创造力补充 NL 表达"

LLM 第二轮 tool_call (可选):
  execute_skill_module(
    skillName='test-analyst',
    functionName='inferRiskLevel',
    args=[req, inFlow]
  )
  → 用于单独重算某个 riskLevel

LLM 最终响应: 符合 outputSchema 的 JSON

> **关于 `createService` 模式**：skill `index.ts` 同时导出了暴露给 LLM 调用的纯函数（如 `analyzeConditions`）和一个 `createService(deps)` 工厂。工厂版的 `analyzeConditions` 在 `deps.db` 存在时从 DB 补充 requirement 字段，不存在时只走纯函数。`execute_skill_module` 工具内部自动选择：`createService` 存在且 `deps` 非空 → 调工厂版；否则直接调纯函数。文档无需改代码，仅说明此模式共存。
```

### 2.3 PR 节奏 = 一把梭

一个 PR 包含：
- Phase 1（role 配置 + 砍 Mode B 部分 + SKILL.md 重写）
- Phase 2（sub-agent 启用 ReAct + allowedTools 调整 + system prompt 引导 deterministic 调用）
- Phase 3（requirement-index 拆 resource + fetch_requirement_resource 工具）

**风险对冲**：
- 每个 phase 在 PR 内**独立 commit**，方便 review
- 每个 phase 跑完 `vitest run` + `npm run lint` 再进下一个
- Phase 1 commit 跑通后再开始 Phase 2，依此类推
- PR 描述里明确标出 3 个 commit 的边界

---

## 3. 砍 Mode B 删除清单

> 决策：用户已确认砍 Mode B（Orchestrator 角色 + 配套工具代码）。以下逐文件列出删除范围。

### 3.1 整文件删除

| 文件 | 行数 | 理由 |
|------|------|------|
| `shared/ai/roles/test-orchestrator.ts` | 34 | Orchestrator 角色，无 HTTP 路由调用（其 4 个不存在的 skill 引用 `test-case-generation` / `assertion-design` / `data-preparation` / `risk-analysis` 一并清除） |

> ⚠️ 不删 `tool-orchestrator.ts` 和 `tool-converter.ts`：`ToolOrchestrator` 是 `createOrchestratedPipeline` 的核心（`test-generation.ts:328`），`zodToJsonSchema` 被 `tool.ts:5,128,132` 引用。生产路径依赖，非死代码。

**预计删除 1 个文件 / 34 行**

### 3.2 代码块删除（在 `shared/ai/tool.ts`）

| 行号 | 内容 | 理由 |
|------|------|------|
| `:203-228` | `spawnSubagentTool` 整块 | 仅 Mode B 路径用 |
| `:230-238` 中 `if (allowed.includes('spawn_subagent'))` 分支 | 6 行 | 注册逻辑 |
| `:_isSubagent` 标志相关 | 2 处 | 跟 spawnSubagent 配套 |

**预计删除 ~35 行**

### 3.3 代码块删除（在 `shared/ai/skill-tools.ts`）

| 行号 | 内容 | 理由 |
|------|------|------|
| `:65-80` | `createRequestReviewTool` 整块 | 仅 Mode B Orchestrator 用 |

**预计删除 16 行**

### 3.4 代码块删除（在 `shared/ai/agent.ts`）

| 行号 | 内容 | 理由 |
|------|------|------|
| AgentRunResult 中的 `requestedReview` 字段 | 1 行 | 跟 request_review 配套 |

**预计删除 1 行**

### 3.5 砍 Mode B 总账

| 项 | 数量 |
|---|---|
| 整文件 | 1 |
| 代码块 | 4 处（3 个文件） |
| 预计删除行数 | ~80 行 |

> 注意：之前估算的 ~300 行包含了 `tool-orchestrator.ts`(~183) + `tool-converter.ts`(~100)，实际这两文件不能删（见 §3.1 说明）。

### 3.6 验证：grep 确认无引用

砍前必须 `grep -r "OrchestratorRole\|spawn_subagent\|request_review\|test-orchestrator" --include="*.ts"` 确认：
- ✅ `server/modules/ai-test-gen/` 全部用 `createTestGenerationPipeline` 或 `createOrchestratedPipeline`，**不调** OrchestratorRole
- ✅ `shared/ai/roles/index.ts` 不 export OrchestratorRole
- ✅ `shared/ai-test-gen/test-generation.ts` 不引用 OrchestratorRole

如果 grep 出引用，**先改引用再砍**，不能边砍边改。

---

## 4. 实施路线

### Phase 1：Progressive Disclosure + 砍 Mode B 部分 + SKILL.md 重写

> **目标**：3 个 sub-agent role 启用 metadata-only 加载 + 删 Mode B 死代码 + 改 7 个 SKILL.md description 为"什么时候用"。零 LLM 行为风险（只改 role 配置和文件删除）。

#### 4.1.1 角色配置改动

```ts
// shared/ai/roles/test-analyst.ts
export const TestAnalystRole: AgentRole = {
  // ... 现有字段
  useProgressiveDisclosure: true,  // ← 新增（一行）
};

// shared/ai/roles/test-designer.ts
useProgressiveDisclosure: true,  // ← 新增

// shared/ai/roles/quality-manager.ts
useProgressiveDisclosure: true,  // ← 新增
```

#### 4.1.2 SKILL.md description 重写（7 个文件）

**改写原则**（沿用 Anthropic 官方推荐）：
- **写"什么时候用"，不是"能做什么"**
- 包含触发关键词（让 LLM 容易 match）
- 一句话长度（< 200 chars）

**重写模板**：

```yaml
---
name: <skill-name>
description: <when to use this skill, with trigger keywords>
---

# <Skill Name>

<detailed instructions - kept as-is>
```

**示例对比**：

| 旧（"做什么"） | 新（"什么时候用"） |
|---------------|------------------|
| `description: Searchable index of all project requirements with traversal and tag search` | `description: Use when you need to find requirements by module/priority/tag/status, or traverse parent-child requirement relationships. Triggers: "find requirements for module X", "what are the children of epic Y", "requirements tagged with Z".` |
| `description: Test condition analyzer for ISTQB techniques` | `description: Use when generating atomic test conditions from a list of requirements. Returns ID-assigned, ISTQB-technique-tagged, risk-rated conditions. Triggers: "generate test conditions", "analyze requirements for testing", "apply ISTQB techniques".` |
| `description: Quality review skill for test cases` | `description: Use when reviewing approved draft test cases for coverage gaps, traceability violations, or duplicate cases. Triggers: "review test cases", "check coverage", "find duplicate cases".` |

#### 4.1.3 砍 Mode B 死代码

按 §3 清单执行（1 整文件 + 4 代码块）。注意 `tool-orchestrator.ts` 和 `tool-converter.ts` 不在删除范围内——生产路径在用。

#### 4.1.4 Phase 1 验证

- [ ] 3 个 role 都有 `useProgressiveDisclosure: true`
- [ ] 7 个 SKILL.md description 改为"什么时候用"格式
- [ ] `grep -r "OrchestratorRole\|spawn_subagent\|request_review" --include="*.ts"` 无残留
- [ ] `npm run lint` 通过
- [ ] `vitest run` 全绿
- [ ] **采集基线 token 数据**：手动跑 1 个 batch，记录每个 sub-agent 的 `input tokens`（预期 Analyst 21k → 5-7k，节省 70%+）

**工期**：< 1d（含 SKILL.md 重写 + 砍 Mode B + 测试）

---

### Phase 2：Sub-agent 启用 ReAct + 利用 Deterministic 函数

> **目标**：3 个 sub-agent role 启用 `useReActLoop: true` + 调整 `allowedTools`（按 §2.2.1 白名单）+ system prompt 引导 LLM 调 `execute_skill_module` + 验证 `test-analyst/skill/index.ts` 的 `analyzeConditions` 被实际调用。

#### 4.2.1 启用 ReAct loop

**当前默认值**（`shared/ai/tool.ts:144`）：

```ts
const useReAct = ctx.useReActLoop ?? false;  // ← 默认 false
```

**改动方案**：

`createAgentNode` 的第 12 个参数是 `useReActLoop?: boolean`（`pipeline-nodes.ts:28`），在每个 sub-agent 节点调 `createAgentNode` 时显式传 `true`：

```ts
// 调用处（test-generation.ts ~340）
createAgentNode(
  ctx, agentName, buildInput, buildResult,
  preStep, postSteps, observer,
  timeoutMs, useCache, signal, logEnter, logExit,
  true,  // ← useReActLoop: true
)
```

**为什么不在 `tool.ts:144` 改默认值**：
- 改默认值影响所有 agent 调用，可能误伤其他用法
- 显式传参让"这个节点是 sub-agent 启用 ReAct"在调用处可见
- 跟 `subAgent.execute({ useReActLoop: true })` 现有模式一致（`tool.ts:223`）

#### 4.2.2 allowedTools 白名单

按 §2.2.1 推荐的配置：

```ts
// shared/ai/roles/test-analyst.ts:96
allowedTools: ['search_skills', 'load_skill', 'execute_skill_module']

// shared/ai/roles/test-designer.ts:60
allowedTools: ['load_skill', 'execute_skill_module']

// shared/ai/roles/quality-manager.ts:33
allowedTools: ['load_skill', 'execute_skill_module']
```

#### 4.2.3 system prompt 引导 deterministic 调用

**当前 test-analyst role 的 systemPrompt**（`shared/ai/roles/test-analyst.ts:52-91`）已经写"Use the skills below for ISTQB rules and domain knowledge"，但**没明示 LLM 怎么调**。

**新增段落**（伪代码，插入 systemPromptTemplate 末尾）：

```
## How to Use Skills (when ReAct loop is enabled)
You have 3 tools: search_skills, load_skill, execute_skill_module.

Workflow:
1. **First call**: search_skills(query) to find relevant skills
   Example: search_skills("test condition analysis")
2. **If a skill looks relevant**: load_skill(name) to read full SKILL.md
3. **For deterministic work**: execute_skill_module(skillName, functionName, args)
   Example: execute_skill_module("test-analyst", "analyzeConditions", [requirements, projectContext])
4. **Refine with LLM creativity**: After getting deterministic base, apply your judgment for:
   - HITL feedback (keep id matching conditions, rewrite others)
   - Natural language expression
   - Coverage gap filling
   - Test condition re-prioritization

⚠️ **Deterministic-first principle**: For test condition generation, ALWAYS start with
execute_skill_module('test-analyst', 'analyzeConditions', [requirements, projectContext])
to get the ID-assigned, ISTQB-tagged, risk-rated base. Then refine.
```

**同样段落**为 test-designer 和 quality-manager 定制（调对应的 skill 和函数）。

#### 4.2.4 `execute_skill_module` schema 注意

当前 `skill-tools.ts:40` 的 `args` schema 声明 `items: { type: 'string' }`，但实际传递的参数（如 `analyzeConditions` 的 `requirements: object[]`）是对象。需把 schema 改为 `items: {}`（接受任意 JSON 值），LLM 传参时不需额外序列化。

#### 4.2.5 ReAct 缓存策略

当前 `react-loop.ts:74-78` 已有操作级缓存（`useCache: true`），cache key 包含 `loadedSkills`。启用 ReAct 后**保持**缓存行为不变——同一 input + 同一 skill 加载序列命中缓存，不额外调 LLM。文档无需改代码，仅在 `runAgent` 调用处传 `useCache: true`。

#### 4.2.6 Phase 2 验证

- [ ] 3 个 sub-agent 节点 `useReActLoop: true` 显式传入
- [ ] 3 个 role 的 `allowedTools` 按白名单配置
- [ ] system prompt 引导 deterministic 调用的段落加好
- [ ] **端到端跑 1 个 batch**：
  - 观察 `tool_history`：`test-analyst` 调了 `execute_skill_module('test-analyst', 'analyzeConditions', ...)`
  - 观察 `tool_history`：`test-designer` / `quality-manager` 调了 `execute_skill_module` 至少 1 次
  - 跑批日志中实际工具调用轮次 < 3（防风暴；`maxIterations` 上限为 15 而非触发阈值）
- [ ] `vitest run` 全绿，新增测试覆盖：
  - mock LLM 强制走 `tool_call` 路径，断言 `tool_history` 包含 deterministic 函数名
  - 验证 `args` 传 JSON 而非 string（schema `items: {}` 兼容）
- [ ] **token 用量比对**：相比 Phase 1 基线，Analyst 的 token 是否增加（预期增加 1-2k 因为多了 tool_call），但生成的 testConditions 质量应该提升

**工期**：~2d

---

### Phase 2.5：用 LangGraph `createReactAgent` 替换自实现 react-loop

> **目标**：用 LangGraph v0.2+ 预构建的 `createReactAgent` + `ToolNode` 替代自实现的 `react-loop.ts`（497 行）+ `react-loop-state.ts`（14 行）+ `createReActToolExecutor`（`tool.ts:189-238` ~50 行）。净删 ~560 行自实现代码。对外保持 `AgentRunResult` 接口不变。

#### 4.3.1 为什么换

| 自实现 | LangGraph 替代 | 收益 |
|--------|---------------|------|
| `react-loop.ts:497` — ReAct 循环（工具调度、状态机、token 控制） | `createReactAgent`（`@langchain/langgraph/prebuilt`） | 官方维护，自动获取 bugfix/性能更新 |
| `react-loop-state.ts:14` — 状态序列化（tool_history 序列化、恢复） | 通过 `thread_id` + `getState()` 自动恢复 | 0 行替代 |
| `createReActToolExecutor`（`tool.ts:189-238` ~50 行）— `toolMap` + `allowed` 过滤 | `ToolNode`（自动从 `tools[]` 构造） | 0 行替代 |

#### 4.3.2 不改什么（兼容层）

- **`AgentRunResult` 接口**（`agent.ts:133-142`）—— 包装层从 LangGraph state 提取 messages → 解析为 `result` / `tokenUsage` / `latencyMs` / `toolHistory`。调用方无感。
- **`runAgent` 入口**（`agent.ts:144`）—— `AgentRunOptions` 接口不变。`useReActLoop` / `useCache` / `signal` 等参数语义保持。
- **`allowedTools` 白名单机制**—— 从 `role.allowedTools` 构造 `tools[]` 数组传给 `createReactAgent`，白名单逻辑不变。
- **`maxIterations: 15`**—— 通过 `createReactAgent` 的 `recursionLimit: 16` 控制（LangGraph 默认 25，设 16 = agent 循环 15 次 + 1 次 final）。

#### 4.3.3 改什么

1. **新建 `shared/ai/react-agent.ts`**（~50 行）：
   - `createSkillAwareSubAgent(role, provider, tools)` 工厂
   - 内部用 LangGraph `createReactAgent({ llm, tools, messageModifier })` 构造 agent
   - 返回 `(input) => AgentRunResult` 的兼容 wrap

2. **`shared/ai/agent.ts` 减负**：
   - 删 `:151-180` ReAct 入口块（`if (options.useReActLoop) { ... }` 分支）
   - 改为统一调 `react-agent.ts` 工厂
   - **删 `AgentRunResult.requestedReview` 字段**（LangGraph 用 `interrupt()` + `getState` 替代，该字段仅在 Mode B 路径用过）

3. **`shared/ai/tool.ts` 减负**：
   - 删 `:189-238` `createReActToolExecutor` 整块（含 `spawnSubagentTool`、`toolMap`、`allowed.includes()` 过滤）— 工具列表改为由 `createReactAgent` 内部接收 `tools[]` 处理
   - `ToolExecutor` 类型和 `createDefaultToolExecutor` 引用一并清理

4. **缓存集成**：`createReactAgent` 支持通过 `cacheMiddleware` 注入操作级缓存，保持现有 `useCache: true` 行为。

5. **测试迁移**：
   - 删 `shared/ai/__tests__/react-loop.test.ts`
   - `tool.test.ts` 中 ReAct 相关 case 移至 `react-agent.test.ts` 覆盖"LangGraph state → AgentRunResult 兼容"路径

#### 4.3.4 Resume 协议变化

| 协议 | 自实现 | LangGraph 替代 |
|------|--------|---------------|
| 状态主键 | `options.resumeState`（`SerializedReactLoopState`） | `thread_id` + `configurable`（已有，`test-gen-service.ts:502`） |
| 恢复方式 | 反序列化 → 注入 ReAct loop | `graph.invoke(input, { configurable: { thread_id } })` 自动从 checkpoint 恢复 |
| 兼容策略 | — | `runAgent` 保留 `resumeState` 参数但语义改为"取 thread_id 查 checkpoint"；调用端无感 |

#### 4.3.5 Phase 2.5 验证

- [ ] `shared/ai/react-agent.ts` 工厂通过 `createReactAgent` 产出 compiled graph
- [ ] 3 个 sub-agent 节点调新工厂，`AgentRunResult` 字段（`result` / `tokenUsage` / `latencyMs` / `toolHistory`）不变
- [ ] `AgentRunResult.requestedReview` 字段删了，编译期 `grep` 确认无外部引用
- [ ] `vitest run` 全绿（删旧测试 + 新增兼容层测试）
- [ ] 端到端：Auto 模式 3 agent + 3 checkpoint 跑通，tool_history 格式与旧版相同（`data-flow.test.ts` 断言通过）
- [ ] Peak memory & latency 不退化

**工期**：~1.5d（含工厂 + 兼容层 + 测试迁移）

---

### Phase 3：拆 59KB requirement-index JSON

> **目标**：把 `requirement-index/references/index.json`（59KB）从全量注入改为按 epic 拆分的 resource，LLM 通过 `fetch_requirement_resource` 工具按需取。

#### 4.4.1 拆分粒度

**按 epic 拆**（业界研究 §5 Phase 3 推荐）：

```
shared/ai/skills/requirement-index/
  SKILL.md
  index.ts                       # ← 已实现，扩展
  resources/                     # ← 新增
    manifest.ts                  # ← 新增：resource 注册表（auto-generated，提交到仓库）
    requirement-epic-001.json    # ← 按 epic 拆分
    requirement-epic-002.json
    ...
  references/
    index.json                   # ← 暂保留（skill-loader.ts 还读），后续拆分完成后弃用
```

**拆分方式**（一次性的 migration 脚本，非代码改动）：
- 读 `references/index.json`
- 按 `level === 'epic'`（或 `level: 0`）识别为 epic 边界
- 每个 epic 一个文件 `requirement-epic-{id}.json`（包含该 epic 下所有层级的条目）
- 生成 `resources/manifest.ts` 列出所有 resource URI（**提交到仓库**，非 gitignore，因为它是 schema 定义而非缓存）
- 原 `references/index.json` **暂保留**（`skill-loader.ts:loadContent` 仍读它），等 Phase 3 落地后再决定删除或转为 manifest 缓存代理

**生成的文件结构**：

```ts
// resources/manifest.ts (auto-generated，提交到仓库)
export const resources = {
  'requirement-epic-001': {
    uri: 'resource://requirement-index/requirement-epic-001.json',
    type: 'json',
    size: 4096,
    description: 'Requirements for epic 001 (Login & Auth): 5 features, 23 stories',
    crossRefs: ['requirement-epic-003'],  // ← 跨 epic 引用
  },
  // ...
} as const;
```

#### 4.4.2 新增 fetch_requirement_resource 工具

```ts
// shared/ai/skill-tools.ts (新增)
export function createFetchRequirementResourceTool(registry: SkillRegistry) {
  return {
    name: 'fetch_requirement_resource',
    description: 'Fetch a specific requirement resource by URI. Use when the skill summary is not enough and you need details for a specific epic.',
    parameters: {
      type: 'object' as const,
      properties: {
        uri: { type: 'string', description: 'Resource URI from manifest' },
      },
      required: ['uri'],
    } satisfies JsonSchema,
    execute: async (args: { uri: string }): Promise<unknown> => {
      return registry.loadResource('requirement-index', args.uri);
    },
  };
}
```

#### 4.4.3 role 配置加新工具

`test-analyst` 的 `allowedTools` 加 `fetch_requirement_resource`：

```ts
// shared/ai/roles/test-analyst.ts
allowedTools: ['search_skills', 'load_skill', 'execute_skill_module', 'fetch_requirement_resource']
```

`test-designer` / `quality-manager` 保持不变（不直接查 requirements）。

#### 4.4.4 Phase 3 验证

- [ ] `references/index.json` 不再被全量加载（grep 确认无 loadFullIndex 调用）
- [ ] `resources/manifest.ts` 自动生成
- [ ] `fetch_requirement_resource` 工具可在 test-analyst 节点调
- [ ] 端到端：跑 1 个 batch，Analyst 调 `fetch_requirement_resource` 拿到对应 epic 数据
- [ ] **token 用量最终对比**：Analyst 21k → 1-2k（节省 90%+）
- [ ] 100+ skill 场景预留：manifest 注册表模式可扩展

**工期**：~5d（含 migration 脚本 + 工具实现 + manifest 生成 + 测试）

---

## 5. 验证标准（汇总）

### 5.1 Phase 1

- [ ] 3 个 role 都设 `useProgressiveDisclosure: true`
- [ ] 7 个 SKILL.md description 改为"什么时候用"
- [ ] Mode B 死代码删除（grep 验证）
- [ ] `npm run lint` 通过
- [ ] `vitest run` 全绿
- [ ] 手动跑 1 个 batch 记录 token 基线

### 5.2 Phase 2

- [ ] 3 个 sub-agent 节点 `useReActLoop: true` 显式传入
- [ ] `allowedTools` 按白名单配置（analyst 3 工具，designer/quality 2 工具）
- [ ] system prompt 引导 deterministic 调用的段落加好
- [ ] 端到端跑 1 个 batch，`tool_history` 包含 deterministic 函数调用
- [ ] `maxIterations` 触发数 < 3（防风暴）
- [ ] `vitest run` 全绿
- [ ] token 用量比对：Analyst 增 1-2k（tool_call 成本）但质量提升

### 5.3 Phase 2.5

- [ ] `shared/ai/react-agent.ts` 工厂通过 `createReactAgent` 产出 compiled graph
- [ ] 3 个 sub-agent 节点调新工厂，`AgentRunResult` 字段不变
- [ ] `AgentRunResult.requestedReview` 字段编译期 `grep` 确认无外部引用
- [ ] `vitest run` 全绿（删旧测试 + 新增兼容层测试）
- [ ] 端到端：Auto 模式 3 agent + 3 checkpoint 跑通，tool_history 格式与旧版相同
- [ ] Peak memory & latency 不退化

### 5.4 Phase 3

- [ ] `references/index.json` 不再被全量加载
- [ ] `resources/manifest.ts` 自动生成
- [ ] `fetch_requirement_resource` 工具注册并可调
- [ ] 端到端：Analyst 调 `fetch_requirement_resource` 拿到 epic 数据
- [ ] **最终 token 对比**：Analyst 21k → 1-2k（节省 90%+）
- [ ] 100+ skill 扩展性预留

### 5.5 跨 Phase

- [ ] HTTP / SSE 协议字节级不变
- [ ] Auto / Interactive 模式行为不变
- [ ] 6 个 HTTP 端点用 Zod schema 反序列化无 diff
- [ ] checkpoint 编辑、resume、重启恢复、超时监控功能不变

---

## 6. 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| LLM 不调 deterministic 函数（system prompt 引导失效） | 中 | 高 | prompt 显式 "ALWAYS start with" + few-shot + 测试强制验证 |
| tool_call 风暴（ReAct 无限循环） | 中 | 中 | `recursionLimit: 16`（`createReactAgent` 上限）+ 实际工具调用轮次 < 3 |
| 砍 Mode B 后某个隐藏引用导致编译失败 | 低 | 中 | grep 预检 + 单文件 commit 验证 |
| Phase 2.5 `createReactAgent` 不兼容 `data-flow.test.ts`（tool_history 格式差）| 中 | 高 | 兼容层 wrap 保持 AgentRunResult 字段；先跑测试再合 |
| 59KB JSON 拆分后 epics 间交叉引用丢失 | 中 | 中 | manifest 包含 `crossRefs: string[]` 字段 + 测试覆盖 |
| 资源按需导致 LLM 多次 tool_call 增加 token | 中 | 低 | 已计入 Phase 2 预期（增 1-2k） |
| Phase 1 改 SKILL.md description 后 LLM 选错 skill | 低 | 中 | 端到端跑批验证 + 保留 description 旧版本做 A/B |
| 一把梭 PR 太大，难 review | 高 | 低 | PR 内 3 个独立 commit + 详细 commit message + PR 模板列 phase 边界 |

---

## 7. 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-06-03 | 采用业界研究 3 阶段路线 + 砍 Mode B | Mode B 是过渡态死代码；3 阶段风险递进可控 |
| 2026-06-03 | `allowedTools` 用显式白名单（不是全开 / 类别白名单） | 3 个 sub-agent 职责差异大；白名单让配置自描述 |
| 2026-06-03 | Deterministic 函数用 `execute_skill_module` 调用暴露（不是自动注入 / 混合） | 业界契合、零 index.ts 改动、LLM 决策权保留、可观测 |
| 2026-06-03 | PR 一把梭（3 phase 一个 PR） | 用户决策；通过 3 个独立 commit 缓解 review 难度 |
| 2026-06-03 | Token 节省目标不预设，跑数据 | Phase 1 采集基线，Phase 2/3 比对实测 |
| 2026-06-03 | Phase 1 立即重写 SKILL.md description | 跟 progressive disclosure 同步；避免 Phase 2 改两次 |
| 2026-06-03 | 追加 Phase 2.5：`react-loop.ts` 替换为 LangGraph `createReactAgent` | 用户 code review 确认自实现 ~560 行重复造轮子；用 LangGraph 预构建替代 |
| 2026-06-03 | Phase 3 manifest 保持自实现（不 MCP 化） | QuantumQA 单机产品，MCP 化需要起 server 进程，过度架构 |

---

## 8. 实施清单

| Phase | 任务 | 文件 | 优先级 | 风险 | 工期 |
|-------|------|------|--------|------|------|
| **1.1** | 3 个 role 加 `useProgressiveDisclosure: true` | `shared/ai/roles/{test-analyst,test-designer,quality-manager}.ts` | 高 | 极低 | 0.5h |
| **1.2** | 重写 7 个 SKILL.md description | `shared/ai/skills/*/SKILL.md` | 高 | 低 | 2h |
| **1.3** | 砍 Mode B（1 整文件 + 4 代码块） | `shared/ai/roles/test-orchestrator.ts` / `shared/ai/tool.ts` / `shared/ai/skill-tools.ts` / `shared/ai/agent.ts`（**不砍** `tool-orchestrator.ts` 和 `tool-converter.ts`） | 高 | 中 | 1h |
| **1.4** | 单元测试：metadata-only 加载验证 | `shared/ai/__tests__/progressive-disclosure.test.ts` | 中 | 无 | 1h |
| **1.5** | 跑 1 个 batch 采集 token 基线（结果记到 `docs/specs/2026-06-03-token-baseline.md`）| 手工 + 脚本 | 高 | — | 1h |
| **2.1** | sub-agent 节点 `createAgentNode` 第 12 个参数传 `useReActLoop: true` | `shared/ai/pipeline-nodes.ts`（调用处） | 高 | 中 | 0.5h |
| **2.2** | 3 个 role `allowedTools` 白名单 | `shared/ai/roles/{test-analyst,test-designer,quality-manager}.ts` | 高 | 低 | 0.5h |
| **2.3** | system prompt 加 deterministic 引导段落 | `shared/ai/roles/{test-analyst,test-designer,quality-manager}.ts` | 高 | 低 | 1h |
| **2.4** | 端到端：跑 1 个 batch 验证 `tool_history` 含 deterministic 调用 | 手工 + 截图 | 高 | — | 1d |
| **2.5** | 单测：mock LLM 强制走 tool_call 路径，断言 `tool_history` 含 deterministic 函数名 | `shared/ai/__tests__/react-agent.test.ts` | 中 | — | 1d |
| **2.5.1** | 新建 `shared/ai/react-agent.ts`：`createReactAgent` 工厂 + `AgentRunResult` 兼容层 | `shared/ai/react-agent.ts` | 高 | 中 | 0.5d |
| **2.5.2** | 清理 `shared/ai/agent.ts` ReAct 入口块 + `shared/ai/tool.ts` `createReActToolExecutor` | `shared/ai/agent.ts` / `shared/ai/tool.ts` | 高 | 中 | 0.5h |
| **2.5.3** | 迁移测试：删 `react-loop.test.ts`，增 `react-agent.test.ts` | `shared/ai/__tests__/` | 中 | 低 | 0.5d |
| **2.5.4** | `execute_skill_module` schema `items: { type: 'string' }` → `items: {}`（接受对象）| `shared/ai/skill-tools.ts` | 高 | 低 | 0.1h |
| **3.1** | 写 59KB JSON → 按 epic 拆分的 migration 脚本 | `scripts/split-requirement-index.ts`（一次性） | 中 | 中 | 0.5d |
| **3.2** | 跑 migration 脚本生成 `resources/manifest.ts` | `shared/ai/skills/requirement-index/resources/manifest.ts` | 中 | 低 | 0.5h |
| **3.3** | 新增 `createFetchRequirementResourceTool` | `shared/ai/skill-tools.ts` | 中 | 低 | 0.5d |
| **3.4** | test-analyst `allowedTools` 加 `fetch_requirement_resource` | `shared/ai/roles/test-analyst.ts` | 中 | 低 | 0.1h |
| **3.5** | `skill-registry.ts` 加 `loadResource` 实现 | `shared/ai/skill-registry.ts` | 中 | 中 | 0.5d |
| **3.6** | 端到端：跑 1 个 batch 验证 resource 按需取 | 手工 + 截图 | 高 | — | 1d |
| **3.7** | 100+ skill 扩展性预留测试 | `shared/ai/__tests__/registry-scaling.test.ts` | 低 | 低 | 0.5d |
| **跨 phase** | `npm run lint` + `vitest run` 持续 | — | — | — | 持续 |
| **跨 phase** | HTTP / SSE 协议不变性测试 | `server/modules/ai-test-gen/__tests__/api-compat.test.ts` | 中 | 低 | 0.5d |

---

## 9. 工作量

| Phase | 内容 | 估时 |
|-------|------|------|
| **Phase 1** | progressive disclosure + 砍 Mode B + SKILL.md 重写 | ~0.5d |
| **Phase 2** | sub-agent 启用 ReAct + 白名单 + 引导 + 验证 | ~2d |
| **Phase 2.5** | LangGraph `createReactAgent` 替换自实现 react-loop | ~1.5d |
| **Phase 3** | 拆 59KB JSON + fetch 工具 + 验证 | ~5d |
| **跨 phase** | lint + 测试 + 协议不变性 | ~1d |
| **合计** | | **~10d** |

**对比业界研究 3 阶段**（业界研究说 ~3 周 = 15d）：
- ✅ 业界研究 §5 Phase 1：< 1h → 本 v2: 0.5d（多了 SKILL.md 重写 + 砍 Mode B）
- ✅ 业界研究 §5 Phase 2：2-3d → 本 v2: 2d（一致）
- ⏳ **本 v2 追加 Phase 2.5**（业界研究没覆盖）：+1.5d
- ✅ 业界研究 §5 Phase 3：1 周 = 5d → 本 v2: 5d（一致）
- **本 v2 合计 10d vs 业界研究 15d，节省 5d** —— 主要来自 skill/index.ts 和 React/工具代码已实现，无需从零建

---

## 10. 未来扩展（不在本次范围）

1. **Agent Skills 开放标准对齐**（`agentskills.io`）—— 等 skill 数量稳定后做
2. **MCP server 暴露 skill**（让 Claude Code 等外部 agent 复用）—— 产品需求出现时再起项目
3. **Skill 推荐 ML 模型**（基于历史 batch 训练 skill 选择模型）—— Phase 3 跑批后看数据决定
4. **跨 project skill 共享**（多项目共享 skill 库）—— 等 QuantumQA 多租户时再做
5. **Mode B Orchestrator 复活**（如果未来有"完全自主 agent"需求）—— DeepAgents 是更优选择，不建议自己实现

---

## 11. 参考资料

沿用 [2026-06-02 业界研究 §8](./2026-06-02-test-gen-skill-progressive-disclosure-industry-research.md#8-参考资料)，新增：

### 现状对账相关

- `shared/ai/agent.ts:144-170` — ReAct loop 入口
- `shared/ai/tool.ts:144-238` — ReAct 工具执行器
- `shared/ai/roles/test-orchestrator.ts` — Mode B Orchestrator 角色（待删）
- `shared/ai/skill-tools.ts:4-80` — 4 个 skill 工具实现
- `shared/ai/skills/test-analyst/index.ts:34-112` — 已实现的 deterministic 函数
- `shared/ai/skills/requirement-index/references/index.json` — 59KB 待拆资源

### Anthropic Agent Skills

- [Equipping agents for the real world with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills)
- [The Complete Guide to Building Skills for Claude (PDF)](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en)
- [Open Standard: agentskills.io](https://agentskills.io/)

### LangChain 范例

- [Build a SQL assistant with on-demand skills](https://docs.langchain.com/oss/javascript/langchain/multi-agent/skills-sql-assistant)

---

**本文档作为后续工作的输入。3 个 phase 实施完成后，请更新 `docs/specs/2026-05-31-interpreter-skill-progressive-discovery.md` 把 Mode B 相关决策标记为"已废弃"，并把本文件归档到 `docs/superpowers/specs/` 目录。**
