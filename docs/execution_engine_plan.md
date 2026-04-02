# Backend Execution Engine — 实现规划

## 概述

当前系统的测试执行完全由前端 React 组件模拟（`ExecutionRunner.tsx` / `ScenarioExecutionRunner.tsx`），使用 `setTimeout` + 随机延迟假装执行。所有的变量插值、模块解析、API 资产拼装逻辑也都在前端完成。

本计划将构建完整的 **Backend Execution Engine**，在服务器端直接读取数据库配置，通过 **Playwright** 驱动真实浏览器 UI 操作、通过 **native fetch** 发送真实 API 请求，并通过 **SSE (Server-Sent Events)** 实时推送日志到前端。

---

## User Review Required

> [!IMPORTANT]
> **Playwright 安装**: Playwright 需要下载浏览器二进制文件（~300MB+），首次安装后需要运行 `npx playwright install chromium` 安装浏览器。
> 
> **新增依赖**: `playwright` (UI自动化), `uuid` (执行ID生成)
>
> **数据库迁移**: 需要新增一张 `execution_runs` 表来跟踪正在运行/已完成的任务。

> [!WARNING]
> **Breaking Change (前端)**:  `ExecutionRunner.tsx` 和 `ScenarioExecutionRunner.tsx` 将被大幅重写——从"本地模拟执行"变为"调用后端API + 监听SSE流"。原有的 `simulateStep` / `executeStepsRecursive` 等前端逻辑将全部删除。

---

## 架构总览

```
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                          │
│                                                                    │
│  ┌─────────────────┐    POST /api/runners/execute                 │
│  │ ExecutionRunner  │────────────────────────────────┐             │
│  │  (Thin Client)   │    GET  /api/runners/stream/:id │             │
│  │                  │◄───────────────────────────────┤             │
│  └─────────────────┘         SSE Log Stream          │             │
└──────────────────────────────────────────────────────┼─────────────┘
                                                       │
┌──────────────────────────────────────────────────────┼─────────────┐
│                      Backend (Express + Node.js)      │             │
│                                                       ▼             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 server/modules/execution/                    │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │   │
│  │  │  index.ts     │  │ context.ts  │  │  interpolator.ts │   │   │
│  │  │  (Routes +    │  │ (Variable   │  │  ({{key}} engine)│   │   │
│  │  │   Controller) │  │  Scoping)   │  │                  │   │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────┘   │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │   │
│  │  │ coordinator  │  │ api-executor│  │  ui-executor.ts  │   │   │
│  │  │ .ts          │  │ .ts         │  │  (Playwright)    │   │   │
│  │  │ (Orchestrate)│  │ (fetch)     │  │                  │   │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────┘   │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌─────────────┐                         │   │
│  │  │ logger.ts    │  │ runner.ts   │                         │   │
│  │  │ (SSE + DB    │  │ (Run Loop)  │                         │   │
│  │  │  persistence)│  │             │                         │   │
│  │  └──────────────┘  └─────────────┘                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────┐                                     │
│  │  Existing CRUD Modules    │  (projects, suites, headers,        │
│  │  (Read-only by engine)    │   bodies, endpoints, environments,  │
│  │                           │   reports, settings)                 │
│  └───────────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### 一、新增后端模块  `server/modules/execution/`

这是引擎核心所在的新模块，遵循已有的 `server/modules/<module>` 架构约定。

---

#### [NEW] [interpolator.ts](file:///e:/Projects/e2e_test/server/modules/execution/interpolator.ts)

**变量插值引擎**，从前端 `ExecutionRunner.tsx` 中提取并增强。

- `interpolate(template: string, vars: Record<string, string>): string` — 统一的 `{{key}}` 替换
- 支持嵌套解析（如 `{{BASE_URL}}/{{PATH}}` 中 PATH 本身也含 `{{VAR}}`）
- 最多迭代 5 次防止无限递归

---

#### [NEW] [context.ts](file:///e:/Projects/e2e_test/server/modules/execution/context.ts)

**执行上下文（变量作用域管理器）**。

```typescript
class ExecutionContext {
  private scopes: Map<string, Record<string, string>>; // layered scopes
  
  constructor(layers: {
    globalSettings?: Record<string, string>;
    environmentVars?: Record<string, string>;
    suiteVariables?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
    dataRowValues?: Record<string, string>;
  });

  // 按优先级合并所有层的变量
  resolve(key: string): string | undefined;
  resolveAll(): Record<string, string>;
  
  // 运行时动态设置变量（EXTRACT_VAR 等产生的）
  setRuntimeVar(key: string, value: string): void;
  
  // 创建子上下文（用于 RUN_MODULE 的隔离与参数覆盖）
  createChildContext(moduleParams: Record<string, string>, overrides: Record<string, string>): ExecutionContext;
}
```

**变量优先级（低→高）**:
1. Global Settings
2. Environment Variables
3. Suite Variables (default values)
4. Scenario Overrides
5. Data Row Values
6. Module Params (defaults)
7. Module Overrides (from step `data` JSON)
8. Runtime Variables (EXTRACT_VAR 产生)

---

#### [NEW] [api-executor.ts](file:///e:/Projects/e2e_test/server/modules/execution/api-executor.ts)

**API 步骤执行器** — 处理所有 `API_GET` / `API_POST` / `API_PUT` / `API_DELETE` 动作。

```typescript
interface ApiExecutionResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

async function executeApiStep(
  step: TestStep,
  context: ExecutionContext,
  assets: { headers: HeaderProfile[]; bodies: BodyTemplate[]; endpoints: ApiEndpoint[] },
  environment: string,
): Promise<ApiExecutionResult>;
```

**核心逻辑（从前端迁移+增强）**:
1. 解析 Endpoint → 合并 baseUrl（按环境） + path + parameters
2. 解析 HeaderProfile → 插值替换 `{{key}}`
3. 解析 BodyTemplate → 插值替换 `{{key}}`，填充 defaultValues
4. 使用 Node.js 原生 `fetch` 发送真实 HTTP 请求
5. 捕获响应 status、headers、body
6. 设定请求超时：默认 30s，可配置
7. **SSRF 防护**: 禁止对 `localhost`/`127.0.0.1`/内网 IP 发送请求（可配置白名单）

---

#### [NEW] [ui-executor.ts](file:///e:/Projects/e2e_test/server/modules/execution/ui-executor.ts)

**UI 步骤执行器** — 使用 Playwright 驱动真实浏览器。

```typescript
import { Browser, BrowserContext, Page } from 'playwright';

class UIExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(options?: { headless?: boolean }): Promise<void>;
  async executeStep(step: TestStep, executionContext: ExecutionContext): Promise<UIStepResult>;
  async takeScreenshot(): Promise<string>; // returns base64
  async cleanup(): Promise<void>;
}
```

**支持的动作映射** (对应前端 `ACTION_TYPES`):

| Action | Playwright API | 说明 |
|---|---|---|
| `OPEN` | `page.goto(target)` | 导航到 URL |
| `CLICK` | `page.click(selector)` | 点击元素 |
| `TYPE` | `page.fill(selector, data)` | 输入文字 |
| `HOVER` | `page.hover(selector)` | 悬停 |
| `SCROLL_TO` | `page.locator(selector).scrollIntoViewIfNeeded()` | 滚动到元素 |
| `SELECT_OPTION` | `page.selectOption(selector, data)` | 下拉选择 |
| `CHECK` | `page.check(selector)` | 勾选 |
| `UNCHECK` | `page.uncheck(selector)` | 取消勾选 |
| `DRAG_AND_DROP` | `page.dragAndDrop(target, data)` | 拖拽 |
| `UPLOAD_FILE` | `page.setInputFiles(selector, data)` | 上传文件 |
| `PRESS_KEY` | `page.keyboard.press(data)` | 按键 |
| `ASSERT_VISIBLE` | `expect(locator).toBeVisible()` | 断言可见 |
| `ASSERT_HIDDEN` | `expect(locator).toBeHidden()` | 断言隐藏 |
| `ASSERT_TEXT` | `expect(locator).toHaveText(data)` | 断言文本 |
| `ASSERT_VALUE` | `expect(locator).toHaveValue(data)` | 断言表单值 |
| `EXTRACT_VAR` | `page.locator(target).textContent()` | 提取变量 |
| `EVALUATE_JS` | `page.evaluate(data)` | 执行JS |

**元素定位器解析**:
- 支持 `PageName.ElementName` 和 `PageName/ElementName` 格式（从项目 Pages/Elements 仓库解析）
- 支持直接 CSS 选择器、XPath
- `selectorType` 映射: `css` → 原样, `xpath` → `xpath=...`, `text` → `text=...`, `testid` → `[data-testid="..."]`

---

#### [NEW] [runner.ts](file:///e:/Projects/e2e_test/server/modules/execution/runner.ts)

**核心运行循环** — 步骤调度器。

```typescript
interface RunRequest {
  type: 'case' | 'suite' | 'scenario';
  projectId: string;
  environment: string;
  // 根据 type 选择性传入
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
  dataRowIndex?: number; // 指定数据行, 不传则依次跑所有行
}

interface RunResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED' | 'ABORTED';
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
}

async function executeRun(request: RunRequest, logger: ExecutionLogger): Promise<RunResult>;
```

**执行流程（以 Scenario 为例）**:

```
Scenario
  └── for each ScenarioSuite
        ├── Resolve Suite from DB
        ├── Merge Variables: suiteDefaults < scenarioOverrides < dataRow
        ├── Run Suite Setup Steps
        ├── for each TestCase in Suite
        │     ├── Run Case Setup Steps
        │     ├── for each TestStep in Case
        │     │     ├── Classify: API / UI / Control
        │     │     ├── Resolve Variables (interpolate)
        │     │     ├── Resolve Element Locator (if UI)
        │     │     ├── Resolve API Assets (if API)
        │     │     ├── Execute via appropriate executor
        │     │     ├── Log result (PASS/FAIL + details)
        │     │     └── If RUN_MODULE → recurse with child context
        │     ├── Run Case Teardown Steps
        │     └── Record case result
        ├── Run Suite Teardown Steps
        └── If dataRows > 0, loop for each row
```

**关键安全措施**:
- `RUN_MODULE` 最大递归深度: **20 层**（可配置，超出抛 `MaxDepthExceededError`）
- 请求超时: **30 秒**（可配置）
- 单步骤超时: **60 秒**（UI 操作可能需要更长）
- 步骤失败策略: 默认 **fail-fast**（整个 Case 失败），后续可支持 `continueOnError`

---

#### [NEW] [logger.ts](file:///e:/Projects/e2e_test/server/modules/execution/logger.ts)

**执行日志管理器** — 双通道输出（SSE 实时推送 + DB 持久化）。

```typescript
class ExecutionLogger {
  private reportId: string;
  private sseClients: Set<Response>;

  constructor(reportId: string);

  // 注册 SSE 客户端
  addClient(res: Response): void;
  removeClient(res: Response): void;

  // 记录日志
  log(entry: {
    stepId: string;
    status: 'RUNNING' | 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
    message: string;
    screenshot?: string;
    details?: Record<string, unknown>; // API response body, headers等
  }): void;

  // 完成执行 — 持久化最终 report
  finalize(result: RunResult): void;
}
```

**SSE 消息格式**:
```
event: log
data: {"stepId":"step-1","status":"PASS","message":"✅ [CLICK] #submit-btn","timestamp":1711720000000}

event: progress
data: {"completed":5,"total":12,"percent":42}

event: done
data: {"reportId":"report-xxx","status":"COMPLETED","passRate":100}
```

---

#### [NEW] [index.ts](file:///e:/Projects/e2e_test/server/modules/execution/index.ts)

**模块入口** — 路由定义与控制器。

**API Endpoints**:

| Method | Path | 描述 |
|---|---|---|
| `POST` | `/api/runners/execute` | 触发执行（返回 `reportId`） |
| `GET` | `/api/runners/stream/:reportId` | SSE 日志流 |
| `GET` | `/api/runners/status/:reportId` | 查询执行状态 |
| `POST` | `/api/runners/abort/:reportId` | 中止执行 |

**请求体 (POST /execute)**:
```json
{
  "type": "case | suite | scenario",
  "projectId": "project-1",
  "environment": "STAGING",
  "suiteId": "suite-1",
  "caseId": "case-1",
  "scenarioId": "scenario-1"
}
```

**响应 (POST /execute)**:
```json
{
  "reportId": "report-1711720000000",
  "status": "STARTED"
}
```

---

### 二、新增共享契约

#### [MODIFY] [index.ts](file:///e:/Projects/e2e_test/shared/contracts/index.ts)

新增执行相关类型:

```typescript
// 执行请求类型
export interface ExecutionRequest {
  type: 'case' | 'suite' | 'scenario';
  projectId: string;
  environment: string;
  suiteId?: string;
  caseId?: string;
  scenarioId?: string;
}

// SSE 日志事件
export interface ExecutionLogEvent {
  stepId: string;
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'SKIP' | 'INFO';
  message: string;
  timestamp: number;
  screenshot?: string;
  details?: {
    httpStatus?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    durationMs?: number;
  };
}

// 执行进度事件
export interface ExecutionProgressEvent {
  completed: number;
  total: number;
  percent: number;
}

// 执行状态
export type ExecutionRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
```

---

### 三、数据库迁移

#### [NEW] [002_execution_runs.ts](file:///e:/Projects/e2e_test/server/migrations/002_execution_runs.ts)

```sql
CREATE TABLE IF NOT EXISTS execution_runs (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'case' | 'suite' | 'scenario'
  project_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  suite_id TEXT,
  case_id TEXT,
  scenario_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | RUNNING | COMPLETED | FAILED | ABORTED
  started_at INTEGER,
  finished_at INTEGER,
  error_message TEXT,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
```

---

### 四、路由注册

#### [MODIFY] [registerRoutes.ts](file:///e:/Projects/e2e_test/server/app/registerRoutes.ts)

添加执行模块到路由注册:

```diff
+import { executionModule } from '../modules/execution/index.ts';

 const modules = [
   projectsModule,
   suitesModule,
   ...
+  executionModule,
 ];
```

---

### 五、前端改造

#### [MODIFY] [api.ts](file:///e:/Projects/e2e_test/client/shared/services/api.ts)

新增执行相关 API 方法:

```typescript
export const executionApi = {
  execute: (request: ExecutionRequest) => apiFetch<{ reportId: string }>('runners/execute', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  
  stream: (reportId: string): EventSource => {
    return new EventSource(`/api/runners/stream/${reportId}`);
  },
  
  status: (reportId: string) => apiFetch<{ status: string; report?: ExecutionReport }>(`runners/status/${reportId}`),
  
  abort: (reportId: string) => apiFetch<void>(`runners/abort/${reportId}`, { method: 'POST' }),
};
```

---

#### [MODIFY] [ExecutionRunner.tsx](file:///e:/Projects/e2e_test/client/features/execution/ExecutionRunner.tsx)

**重大重写**: 删除所有前端模拟逻辑（`simulateStep`, `executeStepsRecursive`, `interpolate`），改为:

1. 点击 "Start Run" → 调用 `POST /api/runners/execute`
2. 获得 `reportId` → 建立 `EventSource` 监听 `/api/runners/stream/:reportId`
3. 接收 `log` 事件 → 追加到 logs 列表
4. 接收 `progress` 事件 → 更新进度
5. 接收 `done` 事件 → 标记完成/失败
6. 保留现有的 UI 样式和布局（terminal log + browser viewport preview）

**Browser Viewport Panel 增强**: 当执行 UI 步骤时，后端可以推送截图（base64），前端在右侧面板渲染真实截图，而非静态 mock 页面。

---

#### [MODIFY] [ScenarioExecutionRunner.tsx](file:///e:/Projects/e2e_test/client/features/execution/ScenarioExecutionRunner.tsx)

同样的重写策略：删除本地执行逻辑，改为 SSE 客户端模式。

---

### 六、依赖安装

#### [MODIFY] [package.json](file:///e:/Projects/e2e_test/package.json)

```diff
 "dependencies": {
+  "playwright": "^1.52.0",
   "@google/genai": "^1.41.0",
   ...
 }
```

---

## 步骤类型分类总结

引擎需要将前端已定义的 `ACTION_TYPES` 分为三类执行策略:

| 类别 | Actions | 执行器 |
|---|---|---|
| **UI** | `OPEN`, `CLICK`, `TYPE`, `HOVER`, `SCROLL_TO`, `SELECT_OPTION`, `CHECK`, `UNCHECK`, `DRAG_AND_DROP`, `UPLOAD_FILE`, `PRESS_KEY`, `ASSERT_VISIBLE`, `ASSERT_HIDDEN`, `ASSERT_TEXT`, `ASSERT_VALUE`, `EXTRACT_VAR`, `EVALUATE_JS` | `UIExecutor` (Playwright) |
| **API** | `API_GET`, `API_POST`, `API_PUT`, `API_DELETE` | `ApiExecutor` (fetch) |
| **Control** | `WAIT`, `RUN_MODULE` | Runner 自身处理 |

混合测试场景中，同一个 TestCase 可以同时包含 UI 和 API 步骤。Runner 根据 action 前缀自动选择对应执行器。UI executor 只在第一个 UI 步骤出现时懒初始化浏览器。

---

## 文件清单

```
server/modules/execution/          [NEW 模块]
├── index.ts                        路由 + 控制器 + 模块导出
├── context.ts                      变量作用域管理
├── interpolator.ts                 {{key}} 插值引擎
├── api-executor.ts                 API 请求执行器 (fetch)
├── ui-executor.ts                  UI 自动化执行器 (Playwright)
├── runner.ts                       核心运行循环 & 步骤调度
└── logger.ts                       SSE 流式日志 + DB 持久化

server/migrations/
└── 002_execution_runs.ts           [NEW] 执行任务跟踪表

shared/contracts/index.ts           [MODIFY] 新增执行相关类型

server/app/registerRoutes.ts        [MODIFY] 注册执行模块路由

client/shared/services/api.ts       [MODIFY] 新增执行 API 方法
client/features/execution/
├── ExecutionRunner.tsx              [MODIFY] 重写为 SSE 客户端
└── ScenarioExecutionRunner.tsx      [MODIFY] 重写为 SSE 客户端

package.json                        [MODIFY] 添加 playwright 依赖
```

---

## Open Questions

> [!IMPORTANT]
> 1. **浏览器类型**: Playwright 默认使用 Chromium。是否需要支持 Firefox / WebKit 选择？还是先只支持 Chromium？
> 2. **Headless 模式**: 服务器上运行时默认 headless=true。是否需要在 UI 中提供选项让用户切换 headless/headed 模式？
> 3. **截图策略**: 在什么时候截图？建议方案：每个 UI 步骤执行后自动截图 + 失败步骤必定截图。但这会增加存储和传输开销。你的偏好？
> 4. **并发执行**: 当前计划是单次执行排队。是否需要支持同时运行多个执行任务？
> 5. **实现顺序**: 建议先实现 API 执行器（不依赖浏览器，更快验证），然后再加 Playwright UI 执行器。你同意这个优先级吗？

---

## Verification Plan

### Automated Tests
1. 单元测试 `interpolator.ts` — 各种变量替换场景
2. 单元测试 `context.ts` — 优先级合并
3. 集成测试 API executor — 使用 `httpbin.org` 或本地 mock server
4. E2E测试：前端触发执行 → SSE 流 → 报告生成

### Manual Verification
1. 使用 seed 数据中已有的 API 测试套件，验证真实 HTTP 调用
2. 创建简单 UI 测试用例，在 headed 模式下观察 Playwright 浏览器操作
3. 验证混合测试：一个 Case 中同时包含 API 和 UI 步骤
4. 验证 SSE 实时日志推送到前端展示
