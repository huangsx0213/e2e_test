# QuantumQA 需求管理与 AI 方案可行性评估报告 (集成业务流时序版)

本文档针对 QuantumQA 系统引入 "Epic → Feature → Story → AC" 树状层级需求管理模式进行可行性评估，并融合创新的 **"业务流 (Business Flow)" 时序解耦方案** 进行系统性设计。对标当前的前端 UI 与后端逻辑代码实现，分析其优雅度并提供精益求精的实战与落地指南。

---

## 一、 总体评估结论

该方案在 **技术可行性**、**架构对齐度** 与 **测试方法论落地** 上表现极其优秀，是一份高水准且高度契合 QuantumQA 当前技术栈的工程设计。

*   **空间树与时间流的优雅解耦 (Duality)**：
    系统通过 "Epic → Feature → Story → AC" 树状结构解决**空间维度**的功能归属；通过新增的 "业务 Flow" 解决**时间维度**的时序操作。两者通过已有的 `dependencies`（依赖关系）字段作为指针横向贯通，既保持了模型层级的纯净，又引入了极其强大的动态时序链路。
*   **方法论完全闭环与高确定性生成**：
    树状层级中的 **AC (Acceptance Criteria)** 天然是 AI 自动化断言的黄金输入源。而通过人工审核确认 (Human-in-the-Loop) 的 **Business Flow（业务流）** 充当测试生成的设计蓝图，能够从根本上解决 AI 自动化测试步骤中的"步骤缺失/前置状态断层"痛点，使得 Playwright 脚本生成的可执行率和成功率产生质的飞跃。
*   **AI 上下文工程极为务实**：
    独创了 **"Agent Skill 结构化索引 + TypeScript 批处理过滤 (No-RAG)"** 机制，避免了引入昂贵且在层级结构上检索模糊的向量数据库（RAG），完全由内存中的拓扑排序和大模型语义进行时序推导，性能损耗小，可维护性强。

---

## 二、 核心设计亮点与优雅度分析

### 1. 后端逻辑优雅度剖析 (`server/modules/requirements/`)

后端的代码实现克制、严谨，体现了极佳的单体工程设计原则：

*   **轻量持久化与内存树化 (`repository.ts`)**：
    数据表使用 `parent_id` 外键自关联。在获取项目需求时，采用一次性扁平查询 `SELECT * FROM requirements WHERE project_id = ? ORDER BY position`，极大降低了数据库连接开销，并将层级树组装和排序完全托付给前端与内存 index-generator 处理。对于百级左右的需求节点，这种设计在性能和并发上表现最佳。
*   **优雅的层级追溯与标签推断 (`index-generator.ts`)**：
    `computeLevel()` 通过简练的递归向上追溯父级 ID，动态计算并填充数值深度（`0=epic, 1=feature, 2=story, 3=ac`），无缝契合 Zod 架构。同时，基于正则的标签推断（`extractTags`）和测试类型映射（`inferTestTypes`）使得轻量知识索引（`index.json`）能够自动更新，为 AI 提供最纯净的 Context。
*   **流式 Markdown / CSV 导入解析器 (`import.ts`)**：
    Markdown 解析器通过跟踪标题前缀 `#` 的数量级联生成树，并利用栈结构（`levelStack`）自动维护父子层级。其算法简练（仅百行左右），对非标准输入表现出了极强的鲁棒性，相比引入重型解析库而言非常优雅。

### 2. 前端 UI 优雅度剖析 (`client/features/requirements/`)

前端交互细节丰富，整体人机工程学（Ergonomics）表现极佳：

*   **高性能递归渲染 (`RequirementTree.tsx`)**：
    使用自引用 React 组件按需渲染子树，通过组件内部的 `expandedIds` 控制懒展开，并利用 CSS `paddingLeft: ${depth * 16}px` 实现视觉缩进，完全由数据驱动，性能损耗极小。
*   **低成本的物理位置控制**：
    通过同级兄弟节点的 `position` 排序，前端暴露 `onMove(id, -1 | 1)` 进行同级元素的局部上下移动，配合后端的冲突更新，用极低的代码复杂度完美替代了重型的 HTML5 Drag & Drop 库。
*   **级联电传与剪贴板机制 (`RequirementsPage.tsx`)**：
    *   **级联自动推断 (Level Progression)**：通过级联字典 `levelProgression`，当用户在 Epic 下点击新建，自动将 suggestedLevel 映射为 `feature`；在 Feature 下点击自动设为 `story`。
    *   **上下文感知粘贴 (Contextual Paste)**：支持需求节点的跨层级 Copy-Paste，在粘贴时会自动计算其在兄弟节点中的 Max Position，并自动向下修正其 Level 等级，防止层级断层。

---

## 三、 "业务 Flow 页面" 深度系统方案设计

为将"时序链路"概念完全工程化，系统设计了全新的 "业务 Flow" 数据链路和人机协作（Human-in-the-Loop）闭环：

### 1. 业务流数据模型 (`business_flows` 表结构)

在 SQLite 数据库中引入新表 `business_flows`，存储经过推导和确认的路径：

```sql
CREATE TABLE IF NOT EXISTS business_flows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                         -- 示例："标准用户下单与微信结账主流"
  description TEXT,                           -- 业务流背景与前置条件简述
  type TEXT NOT NULL DEFAULT 'happy-path',    -- happy-path | alternate | exception
  -- 时序步骤定义，JSON 数组存储关联的需求节点 ID 与动作摘要
  -- 格式：[{ "sequence": 1, "requirementId": "req-101", "actionSummary": "用户登录系统" }]
  steps TEXT NOT NULL DEFAULT '[]',           
  status TEXT NOT NULL DEFAULT 'DRAFT',       -- DRAFT / APPROVED (人工确认标记)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. 时序链推导机制 (Flow Agent & 拓扑排序)

通过有向无环图（DAG）分析算法与大模型能力，系统实现了业务路径的主动生成：

```
[ 需求依赖网 (M1) ] 
       │
       ▼ (Flow Agent 拓扑路径推导)
[ Draft Business Flows ] ──► (Checkpoint 0: 业务 Flow 页面展示) 
                                      │
                                      ▼ (用户审核、拖拽调序、修正)
                             [ Approved Business Flows ] 
                                      │
                                      ▼ (作为全局测试蓝图输入)
                             [ AI 用例生成管道 (M2) ]
```

*   **数据网络分析**：
    Orchestrator 读取 `requirements` 表中的 `dependencies` 字段，在内存中构建出系统的 DAG 依赖网。算法自动提取出入度为 0 的节点（系统起点）以及出度为 0 的节点（系统终点）。
*   **Flow Agent 智能归类**：
    轻量 Agent（Flow Agent）接收该拓扑树并对其业务语义进行推理，归类出三类路径：
    -   **Happy Path（主路径）**：从系统起点直达核心商业终点的最短路径。
    -   **Alternate Paths（分支路径）**：业务走向的分流支路（如：不使用购物车直接快捷付款）。
    -   **Exception Paths（异常中断路径）**：因边界错误而中断并退回的死胡同或回滚路径（如：优惠券过期支付被拒）。

### 3. 可视化交互与人工在环控制 (Human-in-the-Loop)

前端新增 **Business Flow 管理界面**：
*   **时序时间轴渲染**：将生成的 Flow 展示为清晰的水平或垂直卡片时间轴（Timeline），每个卡片代表一个 Story，并悬浮展示其 AC。
*   **低成本调序**：用户可通过简单的操作面板上下微调步骤的 `sequence`，或手动向 Steps 数组中增加、删除特定 Story 卡片。
*   **官方发布机制**：用户确认流程完全符合真实业务设计后，点击 `[Approve]` 按钮。状态从 `DRAFT` 变更为 `APPROVED`。该流程即成为系统公认的"黄金测试蓝图"。

### 4. 基于业务 Flow 的高精确度自动化测试生成

在启动 M2/M3 AI 用例生成管道时：
-   **蓝图强注入**：Orchestrator 不再只是零散堆砌 AC，而是直接将 `approved` 状态的 `business_flow` 时序步骤以显式"设计蓝图"注入 System Prompt。
-   **消除断层**：AI（测试设计师）严格顺着 Flow 的步骤逐个提取子测试条件、拼接 Playwright Step 前置状态（Preconditions）。由于前置依赖（如：必须先登录 -> 才能加入购物车 -> 才能去结账）在 Flow 层面已被锁死，AI 生成的脚本将极具连贯性，执行成功率接近 100%。

---

## 四、 实战优化建议 (精益求精)

为使需求管理与 Flow 方案在生产环境联动时表现更加完美，建议在以下几个方面进行小幅优化：

### 1. 约束 AC (验收条件) 叶子节点的子节点添加
*   **问题**：AC 在模型语义上是最终的叶子节点，代表具体的测试依据，不应再有子层级。
*   **状态**：✅ **已实现**（`RequirementTree.tsx:220`）。Add Child 按钮添加 `r.level !== 'ac'` 守卫，AC 级节点不再渲染 `[+]` 按钮。
*   **建议**：在 `RequirementTree.tsx` 中，对 `level === 'ac'` 的节点，隐去或禁用 `Add Child` 按钮。
    ```tsx
    // RequirementTree.tsx (约第 220 行左右)
    {onAddChild && r.level !== 'ac' && (...)}
    ```

### 2. 导入解析器（`import.ts`）的容错与警告通报
*   **问题**：当导入不标准的 Markdown（如一上来就是 `### Title` 而没有 `#` 和 `##`）或 CSV 中的 `parent_title` 拼写错误时，解析器会因找不到最近的 Parent 而默认将其 parentId 设为 `undefined`，从而作为 Root 节点导入。
*   **状态**：✅ **已实现**。`ImportResult` 增加 `warnings: string[]` 字段。MD 解析器对越级/孤儿节点生成警告；CSV 对 parent_title 不匹配生成警告。前端 `RequirementImport.tsx` 以 amber 警告框展示具体警告列表，并提供 `[Import Anyway]` 按钮。
*   **建议**：在 `ImportResult` 契约中增加一个 `warnings: string[]` 列表。
    ```typescript
    interface ImportResult {
      imported: number;
      requirements: Requirement[];
      warnings: string[]; // 容错与未匹配警告信息
    }
    ```
    在解析到孤儿节点（如 Level 缺失上级、Parent Title 无法匹配）时，将警告推入列表，并在前端导入模态框（`RequirementImport.tsx`）中醒目提示用户，避免数据被隐藏在 Root 级。

### 3. 编辑器增加"面包屑路径"导航
*   **状态**：✅ **已实现**（`RequirementEditor.tsx`）。在标题栏下方展示只读面包屑路径，格式如 `Epic > Feature > Story > AC`，每段带层级标签。
*   **建议**：当需求树极深时，用户在右侧 `RequirementEditor` 中编辑一条 Story 或 AC 往往会失去大上下文。
    在 `RequirementEditor.tsx` 的顶部增设一个只读的面挂架（Breadcrumbs）组件，例如：
    `认证模块 (Epic) > 邮箱登录 (Feature) > 弱密码校验 (Story) > 边界输入提示 (AC)`。
    这能极大地增强人机工程交互感，并确保在编写断言时的语义专注度。

### 4. SQLite 并发锁优化 (WAL 模式)
*   **问题**：随着 AI Pipeline（LangGraph）的引入，后台在运行时会产生密集的 Checkpoint 数据库写入。同时前台会有用户对需求树的快速增删改，此时 SQLite 默认的 `journal_mode = DELETE`（写独占锁）极易触发数据库 Busy 锁报错。
*   **状态**：✅ **已实现**（`server/shared/db/client.ts:10`）。`journal_mode` 从 `DELETE` 变更为 `WAL`，并保持 `synchronous = NORMAL`。
*   **建议**：修改 `server/shared/db/client.ts`，将 journal 模式升级为 WAL 模式。
    ```typescript
    // server/shared/db/client.ts
    function configureDatabase(database: Database.Database): void {
      database.pragma('foreign_keys = ON');
      database.pragma('journal_mode = WAL'); // 升级为 WAL 模式
      database.pragma('synchronous = NORMAL');
    }
    ```

---

## 五、 总结

QuantumQA 现行的需求树管理模式方案设计优雅，避开了高成本过度设计的深水区，利用极简的依赖库实现了高扩展性的层级管理。而进一步延伸的**业务 Flow（Business Flow）机制**，以极其完美的方式打通了"静态空间树"与"动态时间流"的二重性。目前文档中四项优化建议已全部落地，业务流页面完成风格对齐，系统整体趋于成熟稳定。
