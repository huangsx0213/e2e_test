# OpenCode Skills 使用指南

> 当前共 24 个 skills，分类整理

---

## 🧠 Superpowers 开发体系（14 个）

从需求 → 设计 → 代码 → 审查 → 发布的完整工程化工作流。

### using-superpowers
- **触发时机**：会话启动时自动生效
- **核心规则**：只要 **1% 可能匹配**就必须调用 skill，不可讨价还价
- **优先级**：用户指令 > Superpowers skill > 系统默认

### brainstorming
- **触发时机**：开发新功能/组件/修改行为之前
- **核心作用**：必须先做设计，不能直接写代码
- **流程**：探索上下文 → 问澄清问题 → 提 2-3 方案 → 用户确认 → 写设计文档 → 审查 → 转 implementation

### grill-me
- **触发时机**：对方案不确定时，用户说"grill me"
- **核心作用**：逐条追问每个分支决策，直到理解一致

### writing-plans
- **触发时机**：有了设计稿/需求后，开始写代码前
- **核心作用**：将需求分解为可独立执行的步骤（每个 2-5 分钟）
- **产出**：`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

### using-git-worktrees
- **触发时机**：需要隔离开发环境时
- **核心作用**：自动创建 git worktree 隔离工作空间，防止互相干扰

### test-driven-development (TDD)
- **触发时机**：任何新功能、bug 修复、重构
- **铁律**：❌ 不写测试就不能写生产代码
- **流程**：写失败测试(RED) → 写最简代码通过(GREEN) → 重构(REFACTOR)

### writing-skills
- **触发时机**：创建/编辑/验证 skill 时
- **核心作用**：用 TDD 方式创建 skill：先写测试用例压测 → 再写 SKILL.md

### executing-plans
- **触发时机**：已有书面的实现计划要执行
- **核心作用**：加载计划 → 逐步骤执行 → 完成后调用 finishing 流程

### subagent-driven-development
- **触发时机**：计划中有多个独立任务
- **核心作用**：每个独立任务派发一个子 agent 执行，结束后执行两阶段审查（spec 合规 → 代码质量）

### dispatching-parallel-agents
- **触发时机**：2 个以上独立任务/多个不相关的失败
- **核心作用**：同时派发多个 agent 并行处理，互不干扰

### systematic-debugging
- **触发时机**：遇到 bug、测试失败、异常行为
- **铁律**：❌ 不找到根因就不能修复
- **流程**：复现 → 最小化 → 假设 → 验证根因 → 修复 → 回归测试

### requesting-code-review
- **触发时机**：完成任务、实现大功能、合并前
- **核心作用**：派发代码审查子 agent，提供 diff SHA 和需求描述

### receiving-code-review
- **触发时机**：收到代码审查反馈后
- **核心作用**：先验证再实施，拒绝表演性同意（"Great point!" 是禁止的）
- **流程**：完整阅读 → 复述理解 → 核查代码 → 评估 → 技术认同或合理反驳

### verification-before-completion
- **触发时机**：声称完成/修复/通过之前
- **铁律**：❌ 没有当场运行验证就不能声称通过
- **流程**：识别验证命令 → 执行完整命令 → 读输出 → 确认 → 才声称

### finishing-a-development-branch
- **触发时机**：实现完成、测试通过，需要决定如何集成
- **核心作用**：验证测试 → 检测环境 → 提供 PR/合并/清理选项 → 执行选择

---

## 🎨 设计类（2 个）

### frontend-design
- **触发时机**：构建前端 UI 组件/页面/应用
- **核心作用**：生成**有特色的**前端界面，避免 AI "模板风"
- **关键原则**：大胆配色、独特字体、大胆布局、有意向动效、避免通用风格

### skill-creator
- **触发时机**：创建/改进/评估 skill
- **核心作用**：草稿 skill → 创建测试用例 → 跑评估 → 审查结果 → 迭代优化

---

## 🔍 技能发现类（1 个）

### find-skills
- **触发时机**：用户问"怎么做到 X"、"有没有 skill 做 X"
- **核心作用**：从 [skills.sh](https://skills.sh/) 搜索匹配的 skill 并一行命令安装
- **相关命令**：`npx skills find [关键词]`、`npx skills add <包名>`

---

## 📋 预装工具类（7 个）

### arch-analyze
- **触发时机**：分析项目架构时
- **功能**：分析目录结构、模块依赖、设计模式、循环依赖、技术栈
- **适用场景**：快速了解不熟悉的代码库、评估架构健康度、新人入职

### code-review
- **触发时机**：审查代码质量
- **功能**：正确性检查、安全漏洞、性能评估、编码规范、技术债发现
- **严重级别**：Critical（必须改）→ High（应尽快改）→ Medium → Low

### doc-generator
- **触发时机**：生成/更新文档
- **功能**：README、API 文档、ADR 记录、使用指南
- **原则**：示例代码必须可运行、写意图不写实现、文档贴近代码

### git-release
- **触发时机**：准备发布版本
- **功能**：分析最近提交 → 分类（feat/fix/breaking）→ 建议 semver 版本 → 生成 changelog → 输出 `gh release create` 命令

### improve-codebase-architecture
- **触发时机**：改进架构、找重构机会
- **功能**：识别浅模块 → 提出"深化"机会 → 提升可测试性和 AI 可导航性
- **术语**：Module、Interface、Depth、Seam、Adapter、Leverage

### to-prd
- **触发时机**：用户想将当前对话转化为 PRD 并发布到 issue tracker
- **核心作用**：不访谈用户，直接基于已有对话上下文合成 PRD
- **流程**：探索代码库 → 设计模块 → 写 PRD（问题/方案/User Stories/模块设计）→ 发布到 GitHub Issue → 打 `ready-for-agent` 标签
- **模板**：包含 Problem Statement、Solution、User Stories、Deep Modules、Test Requirements

---

## 📌 推荐工程化工作流

```
需求提出
  ↓
to-prd（可选：将对话转化为 PRD → GitHub Issue）
  ↓
brainstorming → 写设计文档到 docs/superpowers/specs/
  ↓
grill-me（可选：严格审查方案）
  ↓
writing-plans → 分解为独立步骤
  ↓
using-git-worktrees → 创建隔离工作空间
  ↓
test-driven-development → RED → GREEN → REFACTOR
  ↓
subagent-driven-development → 每个步骤派发子 agent
  ↓
requesting-code-review → 代码审查
  ↓
systematic-debugging（如果发现问题）
  ↓
verification-before-completion
  ↓
finishing-a-development-branch → PR / 合并 / 清理
```

## 📂 Skills 安装位置

| 来源 | 路径 |
|------|------|
| 全局 skills | `~/.config/opencode/skills/` |
| Superpowers skills | `~/.config/opencode/skills/`（已从 obra/superpowers 复制） |
| Superpowers plugin | `~/.config/opencode/node_modules/superpowers/` |
| 项目级 skills | `.opencode/skills/` |
