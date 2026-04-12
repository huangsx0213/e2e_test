# QuantumQA Automation Matrix - 详细使用说明

## 1. 系统简介
QuantumQA Automation Matrix 是一款低代码自动化测试平台，旨在帮助测试团队高效管理 UI 元素、设计测试用例，并支持 UI 与 API 混合的自动化测试编排与执行。

## 2. 核心概念
在开始使用之前，请了解以下核心概念：
* **项目 (Project)**: 顶层容器，所有的页面、模块、测试套件和 API 资产都归属于特定的项目。
* **环境 (Environment)**: 全局配置（如 DEV, SIT, UAT, PROD），用于在不同环境下切换执行目标。
* **页面与元素 (Pages & Elements)**: 采用 POM (Page Object Model) 模式，集中管理 UI 元素的定位器（如 CSS Selector, XPath, getByRole 等）。
* **模块 (Modules)**: 可复用的测试步骤集合（如“用户登录”、“搜索商品”），支持参数化。
* **API 资产 (API Assets)**: 包含请求头 (Headers)、请求体模板 (Bodies) 和 接口定义 (Endpoints)，用于 API 自动化测试。
* **测试套件与用例 (Suites & Cases)**: 组织测试执行的核心。套件包含多个测试用例，支持数据驱动（Data Rows）和前后置操作（Setup/Teardown）。
* **场景 (Scenarios)**: 更高级别的业务流程编排，可包含多个测试套件。
* **测试报告 (Reports)**: 记录测试执行的详细日志、通过率和截图状态。

## 3. 快速入门工作流
1. **创建项目**: 在系统设置或首页创建一个新项目（如 "Web Shop QA"）。
2. **录入页面与元素**: 在项目中添加目标测试页面，并录入需要操作的 UI 元素及其定位方式。
3. **编写复用模块 (可选)**: 将常用的操作（如登录）封装为模块，定义输入参数。
4. **准备 API 资产 (可选)**: 如果需要接口测试，提前录入 Endpoint、Header 和 Body。
5. **组装测试套件与用例**: 创建 Test Suite，添加 Test Case，并按顺序添加测试步骤（UI 操作、API 请求或调用模块）。
6. **执行与查看报告**: 运行测试套件，随后在“测试报告”模块查看执行结果和日志。

## 4. 详细功能指南

### 4.1 页面与元素管理 (Pages & Elements)
* **添加页面**: 按照业务模块划分页面（如“登录页”、“购物车页”）。
* **添加元素**: 
  * **名称**: 元素的易读名称（如“提交按钮”）。
  * **定位方式 (Selector Type)**: 支持 CSS, getByRole, getByText, getByLabel, getByTestId 等现代测试框架常用的定位器。
  * **定位值 (Value)**: 具体的定位字符串。

### 4.2 模块管理 (Modules)
* 模块是步骤的集合。
* **参数 (Params)**: 可以为模块定义参数（如 `USER_EMAIL`），在步骤中通过 `{{USER_EMAIL}}` 语法引用。
* **调用**: 在测试用例中，使用 `RUN_MODULE` 动作即可调用该模块，并传入相应的参数值。

### 4.3 测试套件设计 (Test Suites)
* **环境变量 (Variables)**: 在套件级别定义变量（如 `BASE_URL`）。
* **数据驱动 (Data Rows)**: 添加多行数据，测试套件将针对每一行数据循环执行所有测试用例。
* **前后置步骤 (Setup & Teardown)**: 
  * Setup: 在用例执行前运行（如打开首页、初始化数据）。
  * Teardown: 在用例执行后运行（如清理缓存、关闭弹窗）。
* **测试步骤 (Steps)**:
  * **UI 动作**: `OPEN` (打开网页), `CLICK` (点击), `TYPE` (输入文字), `ASSERT_VISIBLE` (断言可见), `ASSERT_TEXT` (断言文本) 等。
  * **API 动作**: `API_GET`, `API_POST` 等，需绑定对应的 Endpoint、Header 和 Body 资产。

### 4.4 API 资产管理 (API Assets)
* **Endpoints**: 定义接口路径和不同环境下的 Base URL。支持 Query 参数配置。
* **Headers**: 定义请求头组合（如 Auth Token, Content-Type）。
* **Bodies**: 定义请求体模板，支持 JSON 格式和默认变量值。

### 4.5 录制引擎 (Recording Engine)
系统集成了强大的统一录制引擎，支持 UI 交互和 API 请求的同步捕获。

* **录制 API 测试**:
    1. **选择环境**: 在开始录制前，请先在顶部导航栏选择目标环境（如 `STAGING`）。系统会自动将捕获的 API Origin 映射到该环境的 `baseUrl`。
    2. **设置过滤**: 在录制弹窗中输入 API URL 过滤规则（如 `/api/*`），系统将只记录符合规则的请求。
    3. **实时回显**: 录制到的步骤会实时出现在编辑器中，并自动生成相关的 API 资产（Endpoints, Headers, Bodies）。
* **录制 UI 测试**:
    1. 在浏览器中进行点击、输入等操作，引擎会自动生成最优定位器（BY_ROLE > TEST_ID > CSS）。
    2. 使用悬浮工具栏可以快速添加断言步骤。

## 5. 高级特性：变量解析与数据绑定
系统支持强大的 `{{VARIABLE_NAME}}` 模板语法。
变量的解析优先级（由高到低）：
1. 模块调用时传入的参数 (Module Arguments)
2. 数据驱动当前行的数据 (Data Row Values)
3. 测试套件级别的变量 (Suite Variables)
4. 场景覆盖的变量 (Scenario Overrides)
5. 全局环境变量

通过合理使用变量，您可以轻松实现**一套脚本，多环境、多数据运行**。
