# QuantumQA 用户指南

QuantumQA 是一个统一的低代码 E2E 测试平台，专为实现确定性 UI 和 API 自动化而设计。本指南涵盖测试编写、执行和管理的全部内容。

---

## 1. 快速开始

### 前提条件

- Node.js v18 或更高版本
- npm 或 yarn

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd e2e_test

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 本地运行

```bash
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。开发服务器提供：
- **Express API**，端口 3000
- **Vite HMR**，前端热更新
- **WebSocket**，实时 Agent 和录制通信

### 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 全栈开发服务器 |
| `npm run build` | 生产构建（Vite + esbuild） |
| `npm run start` | 启动生产服务器 |
| `npm run seed` | 重置数据库为演示数据 |
| `npm run start-agent` | 启动本地 Agent 进程 |
| `FORCE_SEED=true npm run dev` | 启动开发服务器并重置数据库 |

---

## 2. 核心概念

### 领域模型

QuantumQA 按清晰的层级组织测试资产：

```
Project（项目，根容器）
├── Pages & Elements（页面与元素，Page Object Model）
├── Modules（模块，可复用的参数化步骤组）
├── Scenarios（场景，有序套件组合 + 变量覆盖）
├── Plans（计划，有序场景组合）
└── Dynamic Variables（动态变量，表达式驱动）

TestSuite（测试套件，主要编写单元）
├── Cases（用例，单个测试）
│   ├── Steps（步骤：主步骤、前置步骤、后置步骤）
│   ├── Extractors（提取器，捕获运行时值）
│   └── Assertions（断言，验证结果）
├── Variables（变量，键值对）
└── Data Rows（数据行，数据驱动测试迭代）

API Assets（API 资产，跨项目复用）
├── Endpoints（端点，按环境配置 Base URL + 参数）
├── Header Profiles（请求头配置，可复用 HTTP 请求头集合）
└── Body Templates（请求体模板，可复用的请求体 + 内容类型）
```

### 项目与环境

- **项目（Project）**：顶层组织单元，每个项目拥有自己的页面、模块、场景和计划。
- **环境（Environment）**：工作区全局的命名槽位（如 `PROD`、`DEV`、`STAGING`），每个环境存储键值对变量。API 端点按环境配置不同的 Base URL。

在 **设置（Settings）** 中选择当前项目和环境。

---

## 3. 编写测试

### 3.1 创建套件

**测试套件（Test Suite）** 是主要的编写单元，包含一个或多个测试用例，每个用例由一系列步骤组成。

1. 进入 **测试（Tests）** 功能
2. 点击 **创建套件（Create Suite）**
3. 填写名称和描述
4. 添加 **用例（Cases）**，包含主步骤、前置步骤和后置步骤
5. 可选添加 **变量（Variables）** 和 **数据行（Data Rows）** 用于数据驱动测试

### 3.2 测试步骤

每个步骤包含以下字段：

| 字段 | 必填 | 说明 |
| :--- | :--- | :--- |
| `action` | 是 | 动作类型（如 `CLICK`、`API_GET`） |
| `target` | 视情况 | 元素选择器或 `页面名.元素名` 引用 |
| `data` | 视情况 | 动作载荷（URL、文本、变量名等） |
| `description` | 否 | 人类可读的步骤描述 |
| `enabled` | 否 | 为 `false` 时跳过该步骤（默认 `true`） |
| `screenshot` | 否 | 步骤执行后截屏 |
| `extractors` | 否 | 步骤执行后运行的变量提取器 |
| `assertions` | 否 | 步骤执行后评估的断言 |
| `waitForNetwork` | 否 | 等待特定网络响应 |
| `networkMocks` | 否 | 拦截/模拟网络请求 |

### 3.3 UI 步骤动作

#### 导航与等待

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `OPEN` | — | URL | 导航到指定 URL |
| `WAIT` | — | 毫秒数（默认 1000） | 固定延迟 |
| `WAIT_FOR_VISIBLE` | 元素 | — | 等待元素可见 |
| `WAIT_FOR_INVISIBLE` | 元素 | — | 等待元素隐藏 |
| `WAIT_FOR_NAVIGATION` | — | 可选 URL 子串 | 等待页面导航完成 |

#### 鼠标操作

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `CLICK` | 元素 | — | 点击元素 |
| `DOUBLE_CLICK` | 元素 | — | 双击元素 |
| `RIGHT_CLICK` | 元素 | — | 右键点击元素 |
| `HOVER` | 元素 | — | 悬停在元素上 |

#### 输入操作

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `TYPE` | 元素 | 要输入的文本 | 清空字段并输入文本 |
| `CLEAR` | 元素 | — | 清空输入框 |
| `SELECT_OPTION` | 元素 | 选项值 | 选择下拉选项 |
| `PRESS_KEY` | 元素（可选） | 键名（如 `Enter`） | 按下键盘按键 |
| `CHECK` | 元素 | — | 勾选复选框/单选框 |
| `UNCHECK` | 元素 | — | 取消勾选复选框 |
| `TOGGLE` | 元素 | — | 切换复选框状态 |
| `ATTACH_FILE` | 元素 | 逗号分隔的文件路径 | 附加文件到文件输入框 |

#### 视觉与滚动

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `HIGHLIGHT` | 元素 | — | 高亮闪烁元素（红色边框 + 黄色背景） |
| `SCROLL_TO` | 元素 | — | 滚动元素到可视区域 |

#### UI 断言

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `ASSERT_VISIBLE` | 元素 | — | 断言元素可见 |
| `ASSERT_INVISIBLE` | 元素 | — | 断言元素隐藏 |
| `ASSERT_DISABLED` | 元素 | — | 断言元素已禁用 |
| `ASSERT_TEXT` | 元素 | 期望文本子串 | 断言元素文本包含指定值 |
| `ASSERT_VALUE` | 元素 | 期望输入值 | 断言输入值等于指定值 |
| `ASSERT_URL` | — | URL 子串 | 断言页面 URL 包含指定值 |
| `ASSERT_TITLE` | — | 标题子串 | 断言页面标题包含指定值 |

#### 变量提取与 JavaScript

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `EXTRACT_VAR` | 元素 | 变量键名 | 将元素文本存储为变量 |
| `UI_EXTRACT` | 元素 | — | 触碰元素；配合提取器捕获值 |
| `EVALUATE_JS` | — | JavaScript 代码 | 在浏览器中执行 JS；返回值被存储 |

#### 窗口、框架与对话框

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `SWITCH_TO_WINDOW` | — | URL 或标题匹配字符串 | 切换浏览器焦点到指定标签页 |
| `SWITCH_TO_FRAME` | 框架选择器 | — | 切换到 iframe |
| `ACCEPT_ALERT` | — | 可选的提示输入文本 | 接受浏览器对话框 |
| `DISMISS_ALERT` | — | — | 关闭浏览器对话框 |
| `DRAG_AND_DROP` | 源元素 | 目标 CSS 选择器 | 拖拽并放置 |

#### 模块调用

| 动作 | `target` | `data` | 说明 |
| :--- | :--- | :--- | :--- |
| `RUN_MODULE` | 模块 ID | JSON 参数覆盖 | 执行可复用模块（最大递归深度 20） |

### 3.4 API 步骤动作

| 动作 | 说明 |
| :--- | :--- |
| `API_GET` | 发送 HTTP GET 请求 |
| `API_POST` | 发送 HTTP POST 请求 |
| `API_PUT` | 发送 HTTP PUT 请求 |
| `API_DELETE` | 发送 HTTP DELETE 请求 |
| `API_HEAD` | 发送 HTTP HEAD 请求 |
| `API_PATCH` | 发送 HTTP PATCH 请求 |

任何 `API_*` 前缀均有效 — HTTP 方法由后缀决定（如 `API_OPTIONS` 发送 OPTIONS 请求）。

API 步骤可引用可复用资产：
- `endpointId` — 关联 **API 端点**（按环境配置 Base URL）
- `headerProfileId` — 关联 **请求头配置**
- `bodyTemplateId` — 关联 **请求体模板**
- `data` — 原始请求体字符串，或使用模板时的 JSON 变量覆盖

---

## 4. 变量与插值

### 4.1 变量语法

使用双花括号引用变量：

```
{{variableName}}
```

### 4.2 变量作用域（优先级：低 → 高）

当同一变量名存在于多个层级时，高优先级的值覆盖低优先级的值：

| 优先级 | 层级 | 来源 | 说明 |
| :--- | :--- | :--- | :--- |
| 1 | DYNAMIC | 动态变量配置 | 项目级生成的值 |
| 2 | ENVIRONMENT | 环境编辑器 | 按环境的键值对 |
| 3 | RUNTIME_ENVIRONMENT | 提取器（scope=ENVIRONMENT） | 运行时提取，持久化到环境 |
| 4 | SUITE | 套件变量 | 套件级静态默认值 |
| 5 | SUITE_DATA | 套件数据行 | 当前数据驱动行的值 |
| 6 | RUNTIME_SUITE | 提取器（scope=SUITE） | 运行时在套件级提取 |
| 7 | MODULE_DEFAULT | 模块参数 | 模块参数默认值 |
| 8 | SCENARIO | 场景变量 | 场景级静态默认值 |
| 9 | SCENARIO_DATA | 场景数据行 | 当前场景行的值 |
| 10 | RUNTIME_SCENARIO | 提取器（scope=SCENARIO） | 运行时在场景级提取 |
| 11 | OVERRIDE | 场景-套件覆盖 | 场景中手动设置的套件覆盖 |
| 12 | CALLER_OVERRIDE | RUN_MODULE 步骤数据 | 模块调用方的参数覆盖 |
| 13 | CASE | 提取器（scope=CASE）、EXTRACT_VAR | 运行时在用例级提取 |

### 4.3 自动命名空间前缀

通过提取器在运行时设置的变量会自动获得上下文前缀别名：

- **CASE 作用域**：`用例名.变量名`（如 `login.username_val`）
- **SUITE 作用域**：`套件名.变量名`（如 `auth.session_id`）
- **SCENARIO 作用域**：`场景名.变量名`（如 `order_flow.order_id`）
- **ENVIRONMENT 作用域**：无前缀（全局可用）

### 4.4 生成器函数

在 `{{ }}` 中使用生成器产生动态值：

| 生成器 | 参数 | 示例 | 输出 |
| :--- | :--- | :--- | :--- |
| `$uuid()` | — | `{{$uuid()}}` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `$guid()` | — | `{{$guid()}}` | 同 `$uuid()` |
| `$timestamp()` | — | `{{$timestamp()}}` | `1713945600000`（毫秒时间戳） |
| `$timestampSec()` | — | `{{$timestampSec()}}` | `1713945600`（秒级时间戳） |
| `$now(format?, tz?)` | dayjs 格式，时区 | `{{$now('YYYY-MM-DD')}}` | `2025-04-24` |
| `$randomInt(min?, max?)` | 0, 100 | `{{$randomInt(1, 100)}}` | `42` |
| `$randomFloat(min?, max?, dec?)` | 0, 100, 2 | `{{$randomFloat(0, 1, 4)}}` | `0.7231` |
| `$randomString(length?)` | 8 | `{{$randomString(12)}}` | `a1B2c3D4e5F6` |
| `$randomUpper(length?)` | 8 | `{{$randomUpper(6)}}` | `XKRMZP` |
| `$randomLower(length?)` | 8 | `{{$randomLower(6)}}` | `qpzmxn` |
| `$randomAlpha(length?)` | 8 | `{{$randomAlpha(10)}}` | `kRmZxPqNwL` |
| `$randomEmail()` | — | `{{$randomEmail()}}` | `test_a1b2c3d4@example.com` |
| `$randomPhone()` | — | `{{$randomPhone()}}` | `15551234567` |
| `$randomName()` | — | `{{$randomName()}}` | `Alice42` |
| `$randomMac()` | — | `{{$randomMac()}}` | `a1:b2:c3:d4:e5:f6` |
| `$randomBool()` | — | `{{$randomBool()}}` | `true` |
| `$randomAddress()` | — | `{{$randomAddress()}}` | `123 Main St` |
| `$randomWords(count?)` | 3 | `{{$randomWords(5)}}` | `apple banana cherry date fig` |
| `$date(format?, offset?, unit?, tz?)` | 均可选 | `{{$date('YYYY-MM-DD', '+7', 'day')}}` | 7 天后的日期 |

### 4.5 转换器

使用管道 `|` 语法应用转换器，支持链式调用：

```
{{variableName | transformer1 | transformer2}}
```

| 转换器 | 参数 | 说明 |
| :--- | :--- | :--- |
| `base64` | — | Base64 编码 |
| `base64Decode` | — | Base64 解码 |
| `md5` | — | MD5 哈希（十六进制） |
| `sha1` | — | SHA-1 哈希（十六进制） |
| `sha256` | — | SHA-256 哈希（十六进制） |
| `hmac(secret?, algo?)` | 密钥，算法（默认 `sha256`） | HMAC 哈希 |
| `urlEncode` | — | URL 编码 |
| `urlDecode` | — | URL 解码 |
| `uppercase` | — | 转为大写 |
| `lowercase` | — | 转为小写 |
| `substring(start?, end?)` | 起始（默认 0），结束 | 截取子串 |
| `replace(search, replace)` | 搜索字符串，替换字符串 | 字符串替换 |
| `trim` | — | 去除首尾空白 |
| `date(format?, tz?)` | dayjs 格式，时区 | 格式化日期值 |
| `split(sep?, index?)` | 分隔符（默认 `,`），索引（默认 0） | 分割字符串并选取元素 |
| `default(fallback)` | 回退值 | 值为空时使用回退值 |
| `length` | — | 返回字符串长度 |
| `toJson` | — | 解析并重新序列化 JSON |
| `jsonPath(path)` | JSONPath 表达式 | 查询 JSON 字符串 |
| `round` | — | 四舍五入取整 |
| `floor` | — | 向下取整 |
| `ceil` | — | 向上取整 |
| `abs` | — | 绝对值 |
| `set(varName, scope?)` | 变量名，作用域（默认 `CASE`） | 将值存储为运行时变量；值本身不变地传递给下一步 |

#### 转换器示例

```
{{email | trim | lowercase | md5}}
{{token | base64Decode | jsonPath('$.userId')}}
{{$randomInt(1,100) | set('randomNumber', 'SUITE')}}
{{name | default('Anonymous')}}
```

### 4.6 嵌套解析

变量可以引用其他变量。引擎最多迭代 5 次来处理链式引用：

```
{{baseUrl}}/{{apiPath}}   →   https://api.example.com/v1/users
```

---

## 5. 提取器

提取器从步骤执行结果中捕获值，并将其存储为运行时变量。

### 提取器字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `name` | string | 是 | 存储值的变量名 |
| `source` | enum | 是 | 提取来源 |
| `expression` | string | 视情况 | JSONPath、XPath、正则、请求头名或属性名 |
| `scope` | `CASE` \| `SUITE` \| `SCENARIO` \| `ENVIRONMENT` | 是 | 变量生命周期作用域 |

### 提取器来源

| 来源 | 需要表达式 | 适用步骤 | 说明 |
| :--- | :--- | :--- | :--- |
| `API_BODY_JSON` | 是（JSONPath） | API 步骤、waitForNetwork | 从 JSON 响应体提取 |
| `API_BODY_XML` | 是（XPath） | API 步骤、waitForNetwork | 从 XML 响应体提取 |
| `API_BODY_REGEX` | 是（正则，首个捕获组） | API 步骤、waitForNetwork | 通过正则从响应体提取 |
| `API_HEADER` | 是（请求头名称） | API 步骤、waitForNetwork | 提取响应头 |
| `UI_TEXT` | 否 | UI 步骤 | 提取元素文本内容 |
| `UI_VALUE` | 否 | UI 步骤 | 提取输入框的值 |
| `UI_ATTRIBUTE` | 是（属性名） | UI 步骤 | 提取 HTML 属性值 |
| `UI_PAGE_URL` | 否 | UI 步骤 | 提取当前页面 URL |
| `UI_PAGE_TITLE` | 否 | UI 步骤 | 提取当前页面标题 |

### 提取示例

一个 `API_POST` 步骤返回 `{"id": 123, "token": "abc"}`，添加提取器：
- **来源**：`API_BODY_JSON`
- **表达式**：`$.id`
- **名称**：`userId`
- **作用域**：`SCENARIO`

变量 `{{userId}}` 随后在场景的剩余部分以 `SCENARIO` 优先级可用。

---

## 6. 断言

断言在步骤执行后验证结果。支持 API 步骤和配置了 `waitForNetwork` 的步骤。

### 断言字段

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `source` | enum | 是 | 读取值的来源 |
| `expression` | string | 视情况 | JSONPath、XPath、请求头名或正则 |
| `operator` | enum | 是 | 比较运算符 |
| `expectedValue` | string | 视情况 | 期望值 |

### 断言来源

| 来源 | 表达式 | 说明 |
| :--- | :--- | :--- |
| `API_STATUS` | — | HTTP 响应状态码 |
| `API_HEADER` | 请求头名称 | 响应头值 |
| `API_BODY_JSON` | JSONPath | 通过 JSONPath 获取 JSON 体的值 |
| `API_BODY_XML` | XPath | 通过 XPath 获取 XML 体的值 |

### 断言运算符

| 运算符 | 需要期望值 | 说明 |
| :--- | :--- | :--- |
| `EQUALS` | 是 | 精确字符串相等 |
| `NOT_EQUALS` | 是 | 字符串不相等 |
| `CONTAINS` | 是 | 包含子串 |
| `NOT_CONTAINS` | 是 | 不包含子串 |
| `EXISTS` | 否 | 值存在（非 null/undefined） |
| `NOT_EXISTS` | 否 | 值不存在 |
| `MATCHES_REGEX` | 是（正则模式） | 值匹配正则表达式 |

### 断言示例

一个 `API_GET` 步骤后，添加断言：
- **来源**：`API_STATUS`
- **运算符**：`EQUALS`
- **期望值**：`200`

再添加一个：
- **来源**：`API_BODY_JSON`
- **表达式**：`$.user.name`
- **运算符**：`CONTAINS`
- **期望值**：`Admin`

---

## 7. 动态变量

动态变量是项目级的表达式，按需生成值。它们在 **DYNAMIC** 层级（最低优先级）被求值，因此任何同名的高优先级变量都会覆盖它们。

### 配置

| 字段 | 说明 |
| :--- | :--- |
| **名称** | 变量名（以 `{{名称}}` 引用） |
| **表达式** | 值表达式（可使用生成器和其他变量） |
| **评估策略** | 何时重新求值 |

### 评估策略

| 策略 | 说明 |
| :--- | :--- |
| `EVERY_TIME` | 每次插值调用都重新求值 |
| `ONCE_PER_RUN` | 在整个执行运行开始时求值一次 |
| `ONCE_PER_CASE` | 每个测试用例求值一次 |
| `ONCE_PER_SUITE` | 每个套件求值一次 |
| `ONCE_PER_SCENARIO` | 每个场景迭代求值一次（跨套件共享） |

### 示例

创建动态变量：
- **名称**：`testEmail`
- **表达式**：`{{$randomEmail()}}`
- **策略**：`ONCE_PER_CASE`

每个测试用例将生成唯一的邮箱，但在同一用例内保持一致。

---

## 8. 页面对象模型（元素）

元素仓库将测试步骤与脆弱的 UI 选择器解耦。

### 工作原理

1. 在项目下定义 **页面（Pages）**（如 `LoginPage`、`DashboardPage`）
2. 为每个页面添加 **元素（Elements）** 及智能选择器
3. 在步骤中以 `页面名.元素名` 引用元素（如 `LoginPage.usernameInput`）
4. 如果选择器变更，只需在一处更新 — 所有引用该元素的步骤自动生效

### 选择器优先级（录制时）

录制时，系统按优先级顺序生成选择器：

1. **getByRole** — ARIA 角色 + 可访问名称（最具韧性）
2. **getByTestId** — `data-test`、`data-testid` 或 `data-qa` 属性
3. **CSS ID** — `#id` 选择器
4. **getByText** — 文本内容匹配（兜底方案）

每个候选选择器都会在实时 DOM 上验证 — 只接受唯一匹配单个元素的选择器。

---

## 9. 模块（可复用步骤组）

模块允许你定义参数化的步骤组，通过 `RUN_MODULE` 动作在套件间复用。

### 模块结构

| 字段 | 说明 |
| :--- | :--- |
| **名称** | 模块名称 |
| **参数** | 带默认值的命名参数 |
| **步骤** | 要执行的步骤序列 |

### 调用模块

在测试步骤中使用 `RUN_MODULE` 动作：

| 字段 | 值 |
| :--- | :--- |
| `action` | `RUN_MODULE` |
| `target` | 模块 ID |
| `data` | JSON 参数覆盖对象，如 `{"username": "admin", "password": "{{envPassword}}"}` |
| `namespace` | （可选）提取变量的前缀，如 `login` |

### 模块执行

- 创建子 `ExecutionContext`，继承全局层级
- 模块参数解析：调用方覆盖（`CALLER_OVERRIDE`）> 模块默认值（`MODULE_DEFAULT`）
- 提取的变量合并回父上下文
- 如果设置了 `namespace`，提取的变量会添加前缀（如 `login.token`）
- 最大递归深度：20

---

## 10. 场景与计划

### 10.1 场景

**场景（Scenario）** 将多个套件组合为有序工作流，支持变量覆盖。

| 字段 | 说明 |
| :--- | :--- |
| **名称** | 场景名称 |
| **变量** | 场景级静态变量（优先级 8） |
| **数据行** | 场景数据驱动迭代（优先级 9） |
| **套件** | 有序的套件引用列表 |

场景中每个套件引用可配置：

| 字段 | 说明 |
| :--- | :--- |
| `suiteId` | 引用的套件 |
| `variableOverrides` | 该套件的键值覆盖（优先级 11） |
| `dataSource` | `SCENARIO`（默认）— 场景数据行驱动迭代；`SUITE` — 套件自身的数据行驱动迭代 |

#### 跨套件变量共享

在单个场景迭代内，以 `SUITE` 或 `SCENARIO` 作用域提取的运行时变量在所有套件间**共享**。这允许套件 A 提取一个值（如 `auth.token`），套件 B 可以引用它。

### 10.2 计划

**计划（Plan）** 将多个场景组合为有序执行序列。

| 字段 | 说明 |
| :--- | :--- |
| **名称** | 计划名称 |
| **场景** | 有序的场景引用列表 |

### 10.3 执行层级

```
计划（Plan）
└── 遍历每个 PlanScenario
    └── 场景（Scenario）
        └── 遍历每个场景数据行
            ├── 创建新的 sharedRuntimeVars + sharedDynamicCaches
            └── 遍历每个场景套件引用
                └── 套件（Suite）
                    └── 遍历每个套件数据行
                        ├── 创建 ExecutionContext（13 层变量解析）
                        ├── 执行套件前置步骤
                        └── 遍历每个测试用例
                            ├── 执行用例前置步骤
                            ├── 执行用例主步骤
                            ├── 执行用例后置步骤
                            ├── 清除用例作用域变量
                            └── 发送进度事件
                        ├── 执行套件后置步骤
                        └── 清除套件作用域变量
```

---

## 11. 数据驱动测试

套件和场景均支持 **数据行** — 键值记录数组，驱动迭代执行。

### 套件数据行

在套件的 `dataRows` 字段上定义。每行成为一次迭代，所有用例以该行变量在 `SUITE_DATA` 优先级执行。

如果一个套件有 3 个用例和 5 行数据，总执行次数为 `3 × 5 = 15`。

### 场景数据行

在场景的 `dataRows` 字段上定义。每行成为一次场景迭代，所有套件以该行变量在 `SCENARIO_DATA` 优先级执行。

### 数据源选择

`ScenarioSuite.dataSource` 字段控制哪个数据行驱动迭代：

| 数据源 | 行为 |
| :--- | :--- |
| `SCENARIO`（默认） | 套件内部的 `dataRows` 被**忽略**，仅场景数据行驱动迭代。防止非预期的乘法效应。 |
| `SUITE` | 套件使用自身的 `dataRows` 驱动迭代，独立于场景数据行。 |

### 示例

套件 `CreateOrder` 有以下数据行：

```json
[
  { "product": "Widget", "quantity": "1" },
  { "product": "Gadget", "quantity": "5" },
  { "product": "Doohickey", "quantity": "10" }
]
```

执行时，套件中的每个测试用例运行 3 次，`{{product}}` 和 `{{quantity}}` 按行解析。

---

## 12. 录制

交互式录制器捕获 UI 交互和 API 流量，自动生成测试步骤和资产。

### 启动录制会话

1. 进入 **录制（Recording）** 功能
2. 提供：
   - **目标 URL** — 要打开的页面
   - **项目 ID** — 将资产保存到哪个项目
   - **API 过滤器**（可选）— 通配符模式，筛选录制的 API 请求（如 `*/api/v1/*`）
   - **页面 ID**（可选）— 将元素保存到哪个页面
   - **Agent ID**（可选）— 在远程 Agent 上录制
3. 点击 **开始（Start）** — 打开带有页内工具栏的 Chromium 浏览器

### 录制模式

浮动工具栏提供三种模式：

| 模式 | 触发方式 | 录制内容 |
| :--- | :--- | :--- |
| **UI** | 左键点击交互 | CLICK、TYPE、SELECT_OPTION、WAIT_FOR_NAVIGATION 步骤 |
| **API** | 网络请求（经过过滤） | API 端点 + 请求头配置 + 请求体模板 + `API_*` 步骤 |
| **元素** | 右键点击元素 | 带智能选择器的页面元素 |

### 智能选择器生成

对于每个录制的元素，引擎按优先级顺序生成选择器：

1. `getByRole`（ARIA 角色 + 名称）— 对 UI 变更最具韧性
2. `getByTestId`（`data-test`、`data-testid`、`data-qa`）
3. CSS ID（`#id`）
4. `getByText`（兜底方案）

选择器会在实时 DOM 上验证 — 只接受唯一匹配的选择器。

### API 录制

当 API 模式激活时：
- 匹配 **API 过滤器** 的网络请求被捕获
- 自动创建 **API 端点**，含按环境配置的 Base URL
- 自动从请求头创建 **请求头配置**
- 自动从 POST/PUT 请求体创建 **请求体模板**
- 生成带状态断言的步骤

### 停止录制会话

点击工具栏中的 **停止（Stop）** 按钮，或使用 `POST /api/recording/stop`。浏览器关闭，所有录制的资产被保存。

---

## 13. 执行

### 启动测试运行

1. 选择要执行的 **套件**、**场景** 或 **计划**
2. 选择 **环境**（决定 API Base URL 和环境变量）
3. 点击 **运行（Run）**

### 执行目标

| 目标 | 运行内容 |
| :--- | :--- |
| **套件** | 所有用例 × 所有数据行 |
| **场景** | 所有套件 × 所有场景数据行 |
| **计划** | 所有场景按顺序执行 |
| **用例** | 单个用例 |

### 本地与远程执行

| 模式 | 位置 | 方式 |
| :--- | :--- | :--- |
| **本地** | 服务器进程 | 通过共享引擎直接执行 |
| **远程** | Agent 进程 | 服务器打包 `TaskPayload` → 通过 WebSocket 分发 → Agent 执行并回传结果 |

### 实时反馈

执行期间，日志和进度实时流式传输：
- **SSE** — 执行日志、进度更新（服务器 → 客户端）
- **WebSocket** — Agent 状态、录制事件（双向）

### 执行错误处理

- **用例级快速失败**：任何步骤失败立即停止当前用例
- **套件级继续执行**：用例失败被捕获；下一个用例继续执行
- **始终执行后置步骤**：套件和用例的后置步骤在 `finally` 块中执行，无论是否有失败
- **中止**：在每个循环边界检查；抛出 `'Execution aborted'`

---

## 14. Agent（远程执行）

### 什么是 Agent？

Agent 是独立的 Node.js 进程，通过 WebSocket 连接到 QuantumQA 服务器。它们接收自包含的任务载荷，在本地执行测试，并将结果回传。

### 设置 Agent

#### 方式 1：下载预打包 Agent

1. 在 QuantumQA UI 中进入 **Agent** 页面
2. 点击 **下载 Agent** — 获取 `quantum-qa-agent.zip`
3. 解压 ZIP
4. 编辑 `.env`，设置 `AGENT_SECRET`（必须与服务器的密钥一致）
5. 运行：
   - **Windows**：`start-agent.bat`
   - **Linux/Mac**：`chmod +x start-agent.sh && ./start-agent.sh`

启动脚本会自动安装依赖和 Playwright Chromium，然后连接到服务器。

#### 方式 2：从源码运行

```bash
# 在项目目录中
npm install
npx playwright install chromium
npm run start-agent -- --url ws://your-server:3000 --name my-agent
```

### Agent 配置

| 配置项 | 环境变量 | CLI 参数 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| 服务器 URL | `SERVER_URL` | `--url` | `ws://localhost:3000` | 服务器的 WebSocket URL |
| Agent ID | `AGENT_ID` | `--name` | `agent-<随机>` | 唯一 Agent 标识符 |
| 认证密钥 | `AGENT_SECRET` | — | — | 必须与服务器的 `AGENT_SECRET` 一致 |

### Agent 状态

| 状态 | 说明 |
| :--- | :--- |
| **空闲（Idle）** | 可接受任务分发 |
| **忙碌（Busy）** | 正在执行任务 |
| **离线（Offline）** | 未连接（最后心跳 > 30 秒前） |
| **禁用（Disabled）** | 管理员禁用；不会接收任务 |

### Agent 标签

为 Agent 打标签，用于定向任务路由。当执行请求指定 `QUEUE:LABEL:<标签>` 时，只有拥有该标签的 Agent 会接收任务。

### 任务分发策略

| 策略 | 格式 | 说明 |
| :--- | :--- | :--- |
| 定向分发 | `QUEUE:AGENT_ID:xxx` | 分发给指定 Agent |
| 标签分发 | `QUEUE:LABEL:xxx` | 分发给拥有匹配标签的任一 Agent |
| 任意分发 | `QUEUE:ANY` | 分发给第一个空闲的 Agent |

---

## 15. 设置

在 **设置（Settings）** 中配置全局执行行为：

| 设置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| **当前项目** | string | — | 所有操作的活跃项目 |
| **当前环境** | string | — | 活跃环境（决定 API Base URL 和环境变量） |
| **无头模式** | boolean | `true` | 不显示浏览器窗口运行 |
| **视口宽度** | integer | — | 浏览器视口宽度（像素，仅无头模式） |
| **视口高度** | integer | — | 浏览器视口高度（像素，仅无头模式） |
| **录制视频** | boolean | `true` | 录制浏览器执行的视频 |

#### 视口行为

- **无头模式**：如果同时设置了宽度和高度，则使用设定值。否则使用默认值。
- **非无头模式**：视口设为 null，浏览器以 `--start-maximized` 启动。

---

## 16. API 资产

### 端点

**API 端点** 存储服务 URL，含按环境配置的 Base URL 和参数。

| 字段 | 说明 |
| :--- | :--- |
| **名称** | 端点显示名称 |
| **Base URLs** | 每个环境一个（如 `PROD: https://api.prod.com`、`DEV: https://api.dev.com`） |
| **参数** | 查询/路径参数及默认值 |
| **路径** | 追加到 Base URL 的 URL 路径 |

当 API 步骤引用端点时，根据当前环境选择对应的 Base URL。

### 请求头配置

**请求头配置（Header Profile）** 是可复用的 HTTP 请求头集合（如 `Authorization: Bearer {{token}}`、`Content-Type: application/json`）。

### 请求体模板

**请求体模板（Body Template）** 是可复用的请求体，含内容类型和默认变量值。模板在运行时插值，将 `{{变量名}}` 占位符替换为解析后的值。

---

## 17. 网络等待与模拟

### waitForNetwork

配置步骤在执行后等待特定网络响应：

| 字段 | 说明 |
| :--- | :--- |
| **URL 模式** | 匹配网络请求 URL 的通配符模式 |
| **状态码**（可选） | 期望的 HTTP 状态码 |
| **超时** | 最大等待时间（毫秒） |

可对匹配的网络响应应用断言和提取器。

### 网络模拟

在步骤执行期间拦截并模拟网络请求：

| 字段 | 说明 |
| :--- | :--- |
| **URL 模式** | 匹配请求的通配符模式 |
| **响应状态码** | 模拟的 HTTP 状态码 |
| **响应体** | 模拟的响应体（支持插值） |
| **响应头** | 模拟的响应头 |

---

## 18. 报告

执行完成后，生成 **报告（Report）**，包含：

- 总体状态（通过/失败）
- 通过率和用例计数
- 执行时长
- 步骤级日志，含状态、时间戳和错误详情
- 提取的变量值
- 断言结果

在 **报告（Reports）** 功能中查看报告。每次执行运行生成一份报告。

---

## 19. Docker 部署

QuantumQA 包含多阶段 Dockerfile，支持容器化部署。

### 快速开始

```bash
docker build -t quantum-qa .
docker run -p 3000:3000 -v quantum-qa-data:/app quantum-qa
```

### 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | 3000（HF Spaces 为 7860） | HTTP 服务器端口 |
| `HEADLESS` | `true` | Playwright 无头模式 |
| `AGENT_SECRET` | — | Agent WebSocket 认证密钥 |
| `FORCE_SEED` | — | 启动时重置数据库 |

### 数据持久化

为 `database.sqlite` 挂载持久卷，确保数据在容器重启后保留。

---

## 20. 常见问题排查

| 问题 | 解决方案 |
| :--- | :--- |
| 找不到浏览器 | 运行 `npx playwright install chromium` |
| Agent 无法连接 | 确认 `SERVER_URL` 和 `AGENT_SECRET` 与服务器配置一致 |
| 数据库被锁定 | 确保只有一个服务器进程在运行 |
| 选择器在 UI 变更后失效 | 在页面对象模型仓库中更新元素 |
| 变量未解析 | 检查变量名拼写和作用域优先级；高优先级层级覆盖低优先级 |
| API Base URL 错误 | 确认当前环境与目标端点配置一致 |
| 步骤意外被跳过 | 检查步骤的 `enabled` 是否为 `true` |
| 模块递归错误 | 模块最大嵌套深度为 20；请减少嵌套层数 |
