# 核心测试引擎实现规划 (Core Test Engine Implementation Plan)

## 1. 背景与目标
当前的测试执行逻辑完全由前端 React 组件（`ExecutionRunner.tsx` 和 `ScenarioExecutionRunner.tsx`）进行**模拟 (Mock)**，具体表现为仅仅通过 `setTimeout` 延迟后随机或固定返回成功/失败。
为了将本项目真正打造为一个“低代码自动化测试系统”，必须实现一个**真实、健壮的测试后端执行引擎（Backend Execution Engine）**，负责真正的 API 调用、变量解析、环境切换以及未来扩展 UI 自动化。

## 2. 架构设计规划

### 2.1 从前台模拟走向后台执行
- **前端职责转变**：前端将仅仅作为“操作面板”和“日志视图”。通过 API 触发后端正式执行，并通过 SSE (Server-Sent Events) 或 WebSocket 实时接收执行日志流，取消自身解析节点步骤的权力。
- **后端执行核心 (Core Engine)**：在服务端 `server/modules/execution` 下建立独立的引擎模块，直接拉取数据库最新配置执行测试。

### 2.2 核心模块职责拆分
建议将核心引擎划分为以下几个组件部分：

1. **Context Manager (上下文与变量管理器)**
   - 管理和合并所有作用域的变量。
   - 优先级：全部系统配置 < 环境变数 < Suite Variables < Scenario Overrides < Data Rows (数据驱动行) < 模块形参 < 内置临时变量。
   - **安全插值库**：专门处理通过 `{{key}}` 统一替换普通变量、Headers 以及 Body 模板。支持变量作用域的层级覆盖与动态解析。

2. **Action Executor (步骤与协议执行器)**
   - **API 处理器**：使用 `fetch` 真实的发送请求前拼装完整的 Endpoint URL，从 Profile 提取并注入 Headers，动态组装 Body 结构。
   - **基础控制论**：处理等待指令 `WAIT`，处理模块复用的 `RUN_MODULE` (入栈压栈)。
   - **UI 处理器 (未来演进)**：预留对 Webdriver/Playwright 的接口插槽。

3. **Routing Coordinator (路由调度器)**
   - 根据测试粒度：Scenario -> Suite -> Case -> Module 的父子关系进行调度。
   - 包含多行 DataRow 驱动运行能力，负责循环复位环境。

4. **Event Logger & Reporter (实时监听日志库)**
   - 接管所有的成功/失败抛出的生命周期。
   - 随时向系统 SQLite 数据库持久化 `ExecutionLog` 和 `ExecutionReport`。
   - 将流式消息通过 Event Source 发送给客户端界面。

## 3. 详细实施路线 (Implementation Phases)

### Phase 1：构建引擎骨架与上下文插值
- 全新搭建 `ExecutionContext` 类。
- 迁移原前端 `ExecutionRunner.tsx` 中所有的 `interpolate`、`header/body resolve` 逻辑到服务端，加以完善。
- 初始化后端的数据库查询能力连通配置表获取最新状态。

### Phase 2：API 真实调用实现与断言处理
- 使用原生 `fetch` 实现请求组装发送逻辑。
- 解析 Response 以及 Http Status Code 并自动判断执行成功还是失败。
- 支持（如有必要新建）结构化断言，例如 `ASSERT_STATUS`, `ASSERT_JSON`。

### Phase 3：重构前端与打通实时日志
- 后端开放 `POST /api/runners/execute` 端点供前端启动任务。
- 后端开放 `GET /api/runners/stream?reportId=xxx` 获取 SSE 日志。
- 将前端页面剥离多余 Mock 逻辑，转变成纯粹的消息流监听渲染页。

## 4. 关键问题考虑 (Considerations)
- **隔离与并发**：单靠 Node.js 并发或排队执行的安全性，需确保同一时间多次点击产生的执行报告相互独立。
- **防止递归漏洞**：因支持 `RUN_MODULE` 指令，需要在引擎侧加入堆栈最大深度检查（e.g. 出现超过 50 层主动抛出错误 `StackOverflow Error`），防止死循环卡死服务器。
- **网络安全性 (SSRF)**：因具备 API Runner 能力，针对请求靶机域名做一定层度的预判或设置超时（Timeout, 一般 5000ms），避免因等待第三方服务器拖垮本地引擎资源。
