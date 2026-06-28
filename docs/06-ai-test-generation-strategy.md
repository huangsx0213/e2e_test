# AI 自动化测试生成策略与架构
*(Final Architectural Specification)*

## 1. 适用与合规标准 (Applicable Standards)

本文件定义了 `e2e_test` 平台的测试用例生成策略。所有的架构设计均严格遵循以下国际测试行业标准：

| 标准 | 完整名称 | 相关章节 |
|----------|-----------|-------------------|
| **ISTQB CTFL 4.0** | ISTQB Certified Tester Foundation Level Syllabus v4.0 (2023) | 第 2.2 节：测试级别；第 4.2 节：黑盒测试技术；第 4.4 节：基于经验的测试技术 |
| **ISO/IEC/IEEE 29119-1** | 软件和系统工程 -- 软件测试 -- 第 1 部分：通用概念 | 条款 4：测试过程；条款 5.3：测试设计 |
| **ISO/IEC/IEEE 29119-3** | 第 3 部分：测试文档 | 条款 9.4：测试用例规范（每步包含动作 + 预期结果） |
| **ISO/IEC/IEEE 29119-4** | 第 4 部分：测试技术 | 条款 5：基于规范的测试技术；条款 7：覆盖率度量 |
| **IEEE 829-2008** | 软件和系统测试文档标准 | 条款 8：测试规程规范（原子化、可重复的步骤） |

---

## 2. 核心架构解耦设计 (Decoupled Architecture Design)

为了在大型项目中有效控制大语言模型（LLM）的 Token 成本及上下文窗口限制，系统在架构上将“全局视野 (Global Vision)”与“局部执行 (Local Execution)”进行了严格解耦。

1. **维持宏观管线不动 (Intact Macro Pipeline)**：底层 LangGraph 架构维持固定的四节点执行流：`Architect (架构)` -> `Analyst (分析)` -> `Designer (设计)` -> `Quality (质量)`。
2. **矩阵的增量持久化 (Persistent Incremental Matrix)**：每次管线执行完毕后，生成的用例和跨节点流转记录都会被**增量写入（Upsert）**到基于数据库的二维覆盖率矩阵（`requirementRows` 和 `flowRows`）中。这个持久化数据层是跨发版生命周期中用例去重的“唯一事实来源 (Single Source of Truth)”。

---

## 3. LangGraph 宏观工作流与 Agent 职责分配

整个流水线的运转由四个按顺序协作的核心 Agent 节点驱动。

### 3.1 Architect Node（全局架构蓝图引擎）

Architect 节点扮演"Phase 0 (阶段零)"全局架构师的角色。它是一个混合模式（Hybrid）Agent，负责在 Analyst 启动生成之前构建全局上下文。

| 能力分层 | 执行职责 | 输出产物 |
|-----------------|----------------------------|------------------|
| **纯 TypeScript 计算 (Deterministic)** | **1. 节点频次扫描**：遍历所有 Flow，精准统计每个 `RequirementID` 的重复引用次数，为高频节点打上 `isDuplicateReference` 标记。<br>**2. DAG 拓扑构建**：通过数据库关联，构建 Epic/Flow 的显式树状依赖关系。<br>**3. 覆盖率快照提取**：从数据库读取最新版本的二维 CoverageMatrix。 | 统计数组、依赖树 (DAG)、覆盖矩阵 JSON |
| **LLM 语义推理 (Semantic)** | **1. 战略指引**：从 TS 传来的硬数据中推断隐式的业务共享状态（如认证体系、拦截器等），为下游 Agent 提供全局指导。<br>**2. 错误推测预判 (Preemptive Error Guessing)**：自主构思并产出有限数量的、未在需求中显式定义的高危异常业务流（如：并发竞争、孤儿引用）。 | 《全局测试蓝图 (Global Test Blueprint)》、有限数量的《高危异常流提案》 |

### 3.2 Analyst Node（测试条件生成中心）

Analyst 节点负责将业务需求拆解为结构化的“测试条件 (Test Conditions)”。在调度器 (Orchestrator) 的控制下，Analyst 会根据输入批次的不同，动态切换为**三种不同的分析阶段（模式）**：

| 分析阶段 (Analyst Mode) | 触发范围 | 分析策略 (Analysis Strategy) |
|----------------------|---------------|-------------------|
| **Stage 1: Requirement Batches** | 用户选定的叶子级需求 (AC) | 扮演**组件分析师 (Component Analyst)**。被约束仅使用等价类划分、边界值分析和判定表，生成细颗粒度的单点测试条件。 |
| **Stage 2: Flow Batches** | 用户选定的业务流程 (Flow) | 扮演**集成分析师 (Integration Analyst)**。结合《全局蓝图》与《覆盖率矩阵》，若节点内部逻辑已被覆盖则跳过细节（降级为 `Reference Only`）。严格约束其只能生成 `category: 'integration'` 类型的条件，专注跨模块状态交接。 |
| **Stage 3: Error-Guessing Synthesis** | 当前执行批次影响的周边范围 | 扮演**缺陷推测专家 (Defect Speculation Expert)**。对依赖图谱应用错误推测法，专门为隐式路径（如鉴权绕过、并发修改）综合生成测试条件。 |

### 3.3 Designer Node（用例与步骤设计）

负责将抽象的“测试条件”翻译成人类和机器均可无歧义执行的详细测试步骤。严格遵守**测试步骤原子性规范**（见第 4 节）。

### 3.4 Quality Node（质量审核与矩阵持久化）

负责校验 Designer 产出的用例质量：
*   **拦截网关 (Rejection Gate)**：强制驳回任何在步骤中包含多重连词（如“和”、“且”、“同时”）的复合动作，以捍卫原子性。
*   **持久化落地 (Persistence)**：在评审通过后，立刻将最新的测试用例和状态流转标记 Upsert 追加写入到数据库的 `PersistentCoverageMatrix` 中。

---

## 4. 测试步骤原子性规范 (Test Step Atomicity)

所有生成的 `NlTestCaseStep` 对象必须满足下游“AI 驱动自动化录制引擎（如 Playwright / Stagehand）”的机器可读限制要求。

### 4.1 原子步骤五大黄金法则

| # | 规则 | 正确示例 | 错误示例 (复合步骤，AI Agent无法执行) |
|---|------|-------------|-------------|
| 1 | **单一交互动作** | “点击标签为 'Sign In' 的按钮” | “填写登录表单并提交” |
| 2 | **单一断言目标** | “按钮文本变为 'Signing in...'” | “登录成功并跳转到仪表盘，同时显示欢迎语” |
| 3 | **元素可定位性**| “在占位符为 'Username' 的输入框中输入 `admin`” | “输入有效的用户名” |
| 4 | **具体测试数据** | “输入 `admin123`” | “输入格式不符合要求的密码” |
| 5 | **无隐式上下文** | 动作前明确处于特定页面环境或受上步预期约束 | “点击 '提交'”（未说明前置页面上下文） |

### 4.2 NL-to-Code 自然语言到代码的映射协议

| 步骤字段 | 语义目标 | Playwright 对应 API 举例 |
|---------|---------|-------------------------|
| `action` 中的动词 | 动作映射 | “键入”、“输入” -> `fill()` ; “点击” -> `click()` |
| `action` 中的主语 | DOM 寻址 | “含有 'User' 的占位符” -> `getByPlaceholder('User')` |
| `action` 中的宾语 | 数据传递 | “输入 `admin`” -> `fill('admin')` |
| `expected` 描述 | 状态断言 | “出现 'Success' 文本” -> `expect(loc).toContainText('Success')` |

---

## 5. 核心模块改造路线图 (Implementation Roadmap)

### 5.1 Orchestrator 路由调度逻辑
调度器 (Orchestrator) 将分批子集投入固定不变的 LangGraph 管线，同时命令 Analyst 切换到不同的 Stage 身份模式：

```typescript
async function runUnifiedPipeline(projectId: string, selection: SelectionCriteria) {
  // 调度 Stage 1: 组件级条件批次
  const reqBatches = groupRequirementsByEpic(selection.acs);
  for (const batch of reqBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_1_REQUIREMENT' });
  }

  // 调度 Stage 2: 集成级条件批次
  const flowBatches = preprocessFlows(selection.flows);
  for (const batch of flowBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_2_FLOW' });
  }

  // 调度 Stage 3: 错误推测批次
  const errorGuessingBatches = prepareErrorGuessingScope(selection);
  for (const batch of errorGuessingBatches) {
    await runLangGraph(batch, { analystMode: 'STAGE_3_ERROR_GUESSING' });
  }
}
```

### 5.2 重构 `architect.ts` (Hybrid Agent)
升级图谱的入口节点，计算最新状态并拦截重复设计：

```typescript
async function ArchitectNode(state: TestGenState): Promise<Partial<TestGenState>> {
  // 1. TS 计算层：提取增量覆盖率快照与节点频率
  const coverageMatrix = await db.fetchPersistentCoverage(state.projectId);
  const flowFrequency = computeRequirementFrequencies(state.businessFlows);
  
  if (state.globalBlueprint && !state.forceRedesign) {
     return { phase: 'analysis', coverageMatrix, flowFrequency };
  }

  // 2. LLM 语义层：生成全局架构蓝图
  const architectResult = await runArchitectAgent(state.projectData);
  await db.persistBlueprint(state.projectId, architectResult.blueprint);

  return { globalBlueprint: architectResult.blueprint, coverageMatrix, flowFrequency, phase: 'analysis' };
}
```

### 5.3 提示词工程与新技能注入
*   **Skill: `coverage_check_query`**：为 Analyst Agent 提供一个可以在 ReAct 思考循环中动态查询 `PersistentCoverageMatrix` 的专属工具，赋予它自主跳过冗余逻辑设计的能力。
*   **Analyst Prompts**：根据注入的 `analystMode`（`STAGE_1_REQUIREMENT`、`STAGE_2_FLOW` 或 `STAGE_3_ERROR_GUESSING`），为 LLM 挂载完全不同的人设规则与硬性限制。
