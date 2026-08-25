# CONTEXT.md — QuantumQA 领域词汇表

架构讨论（Module / Interface / Seam / Depth 等）用语见 LANGUAGE.md；本文只定义**领域概念**。
标注 ★ 的是 AI 录制转化管线（2026-08 设计决议）中新增的概念。

## 用例与录制

- **NL 用例 (NL Case)** — 自然语言测试用例（`NlTestCase`）：步骤（action + expected）+ preconditions/testData。AI 录制的输入。
- **NL 步骤边界 (NL Step Boundary)** — 一条 NL 步骤在录制流中对应的 payload 区间（`NlStepBoundary`）。断言归附以边界为单位。
- **录制步骤 (Recorder Step)** — 录制器捕获的单条动作 payload（`RecorderStepPayload`），含 locator 与 locatorCandidates。
- **Draft Suite** — Refiner 精炼后、落库前的 `TestSuite`。
- **期望结果 (Expected)** — NL 步骤的 `expected` 字段原文。断言提议必须能溯源到它。

## ★ 转化管线（NL → 生产级结构化用例）

五阶段：**Record → Ground → Compile → Confirm → Emit**。
核心原则：LLM 只在作者期当编译器，产物是确定性用例；运行期零 AI。

- **证据包 (Evidence Pack)** — 步骤边界处采集的结构化页面状态：URL/title/aria snapshot 摘录、被操作元素的 post-action 状态及其 locators、该期间的 XHR/Fetch 记录。编译的唯一事实来源。
- **规则断言 (Rule Assertion)** — 由录制事实确定性推导的断言提议（fill→UI_VALUE 实际输入值；goto→UI_PAGE_URL；捕获的网络→waitForNetwork），零 LLM。
- **断言提议 (Assertion Proposal)** — 待验证的断言候选：`{source, operator, expectedValue, targetRef?, confidence?, rationale}`。targetRef 是显式元素依托；无依托的页面级 source 除外。
- **编译门 (Compile Gate)** — 提议落库前的纯代码校验：枚举合法 ∧ targetRef 在当前页唯一解析 ∧ source/operator 与元素类型相容 ∧ confidence 达标。任一不过即降级，不硬塞。
- **确认运行 (Confirmation Run)** — Draft Suite 的无头回放（≤2 次），复用 ui-executor 引擎以 `soft` 策略逐条评估 AI 提议。两次 PASS → 确认；其余见判定矩阵。纯规则断言的 case 跳过此阶段。
- **来源三态 (Provenance)** — 断言最终来源标签：`rule` / `ai-confirmed` / `needs-review`。
- **审核队列项 (reviewAssertions)** — 未通过确认的提议，写入 `step.metadata.reviewAssertions`（不可执行），附证据（各次运行的 actual 值），供 Test Designer 人审。同时记入步骤日志。

## 断言模型（既有）

- **StepAssertion** — 可执行断言：source/operator/expectedValue(/expression)。UI 类 source 的实际值由步骤 target 解析的元素读取（`buildUiAssertionContext`）。
- **waitForNetwork** — API 层断言：回放时 `page.waitForResponse(urlPattern, method)` 校验状态码。

## 共享执行核心

- **execution-core** — 断言求值纯逻辑（`evaluateAssertions`、上下文构建），位于 shared/；server 运行期与 agent 编译期双端消费同一实现。
