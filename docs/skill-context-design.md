# 需求上下文管理：Agent Skill 方案 (无需 RAG)

## 问题

在需求→NL用例的 Agent 管道中，需求树可能有 100+ 节点。LLM 上下文窗口有限，且即使窗口够大，**Context Rot** 研究表明：随着输入变长，LLM 对特定信息的检索准确度会显著下降，尤其当存在大量无关内容时。

**不使用 RAG（向量数据库），如何保证 Agent 全面理解需求？**

## 核心理念：Agent Skill 作为"知识索引"替代 RAG

Agent Skills 规范内置的 **渐进式披露 (Progressive Disclosure)** 机制天然适合这种场景：

```
           Tier 1: 发现层 (≈100 tokens)
           只加载 name + description
           ↓ Agent 判断"这个 skill 有用"
           Tier 2: 激活层 (<5000 tokens)
           加载完整 SKILL.md
           ↓ Skill 告诉 agent 什么时候读哪些文件
           Tier 3: 资源层 (按需加载)
           只在需要时读取具体文件
```

这意味着：**Agent 不需要一次性把所有需求塞进 context window。它通过 skill 指令，在需要时精准检索相关需求子集。**

---

## 方案：3 层需求 Skill 架构

```
shared/ai/skills/
├── requirement-index/
│   ├── SKILL.md                    # "This skill provides a searchable index 
│   │                               #  of all project requirements."
│   └── references/
│       ├── index.json              # 轻量索引: [{id, title, level, parent, 
│       │                           #   summary(≤200字), tags, priority}]
│       └── glossary.md             # 项目领域术语表
│
├── requirement-query/
│   ├── SKILL.md                    # "Find relevant requirements by keyword,
│   │                               #  module, priority, or parent scope.
│   │                               #  Always use before reading requirements."
│   └── references/
│       ├── query-strategies.md     # 查询策略: 何时用关键词 / 层级遍历 / 标签过滤
│       └── coverage-checklist.md   # 完整性检查清单
│
└── requirement-analysis/
    ├── SKILL.md                    # "Analyze a set of requirements for 
    │                               #  completeness and testability."
    └── references/
        ├── analysis-checklist.md   # ISTQB 分析检查表
        └── technique-mapping.md    # 需求特征→测试技术映射规则
```

---

## 核心机制

### 1. 索引文件：轻量、可查询

`requirement-index/references/index.json` 是一个扁平列表，不是完整树：

```json
[
  {
    "id": "req-001",
    "title": "用户注册功能",
    "level": "epic",
    "parent": null,
    "summary": "支持新用户通过邮箱或手机号注册，包含验证码验证和密码强度检查",
    "tags": ["auth", "user", "registration"],
    "priority": "critical",
    "risk": "high",
    "testType": ["functional", "security", "ui"],
    "childCount": 5,
    "children": ["req-002", "req-003", "req-006", "req-010", "req-014"]
  },
  {
    "id": "req-002",
    "title": "邮箱注册流程",
    "level": "feature",
    "parent": "req-001",
    "summary": "用户输入邮箱 → 获取验证码 → 设置密码 → 注册成功",
    "tags": ["auth", "email", "ui"],
    "priority": "critical",
    "risk": "high",
    "testType": ["functional", "ui", "integration"],
    "childCount": 3,
    "children": ["req-003", "req-004", "req-005"]
  }
]
```

**100 个需求节点 ≈ 15-25K tokens 索引**，完全在 context window 内。

### 2. 查询 Skill：Tool-like 检索

`requirement-query/SKILL.md` 不包含需求数据，只包含检索指令：

```markdown
---
name: requirement-query
description: Find relevant project requirements by filtering the index.
---

# Requirement Query Skill

## When to use
Use this skill BEFORE reading any requirement details. Never read 
all requirements at once - always query for a relevant subset first.

## How to query
1. Read `requirement-index/references/index.json` first to understand 
   the available requirement landscape
2. Filter by:
   - `tags`: auth, payment, profile, dashboard, etc.
   - `level`: epic, feature, story, ac
   - `priority`: critical, high, medium, low
   - `parent`: to get all children of a parent node
3. Select the subset you need for the current task
4. Only then load the full requirement descriptions for that subset

## Query strategies
- For task "analyze login requirements": filter by `tags: ["auth"]`
- For task "check all critical requirements": filter by `priority: "critical"`
- For task "expand epic X": filter by `parent: "req-001"` then process children
- For task "find all UI-related tests": filter by `testType: ["ui"]`

## Validation
After processing a subset, check `references/coverage-checklist.md` 
to ensure:
- [ ] All direct children of the parent requirement are covered
- [ ] All tagged requirements in scope are addressed
- [ ] Cross-references (requirements that depend on each other) are handled

## Input format
```json
{ "action": "query", "filters": { ... }, "task": "describe what you need" }
```
```

### 3. 管道执行流程：Orchestrator 过滤 + Agent 处理

**关键设计**: 索引过滤由 Pipeline Orchestrator (TypeScript) 执行，不是 LLM。

Agent 1 (Test Analyst) 的流程：

```
Pipeline Orchestrator (TypeScript):
  ↓ 读取 requirement-index/references/index.json
  ↓ 按 tag/level/priority 分组
  ↓ 识别所有 epic → 每个 epic 作为一个 batch

For each epic:
  ↓ Orchestrator 过滤：只取该 epic 及其子节点
  ↓ 注入到 Agent 1 的 system prompt
  Agent 1 (LLM):
    ↓ 获取当前 batch 的需求摘要
    ↓ 提取 test conditions
    ↓ 选择 ISTQB 技术
  ↓ Agent 1 输出当前 batch 的 conditions

Orchestrator (TypeScript):
  ↓ 合并所有 batch 的 conditions
  ↓ 运行 cross-batch 去重 + 一致性检查
  ↓ Checkpoint 1: 展示完整 conditions 给用户
```

**Agent 1 的 system prompt 结构**：

```
You are an ISTQB-certified test analyst working on batch {batchIndex}/{totalBatches}.

## Requirements in this batch (epic: "{epicTitle}")
{currentBatchRequirements_json}

## Context
- Total requirements in project: {totalCount}
- This batch: {batchSize} requirements
- Already processed: {processedCount} requirements from {completedBatches} batches

## Your task
1. Extract all testable conditions from the requirements in this batch
2. Classify each condition (happy-path / alternate / error / boundary)
3. For each condition, select the appropriate ISTQB test design technique
4. List coverage dimensions with specific variants

## Output format
{output_schema}
```

---

## 为什么这个方案优于 RAG

| 维度 | RAG (向量DB) | Skill Index (本方案) |
|------|-------------|---------------------|
| **基础设施** | 需要向量DB(Chroma/Qdrant/Pinecone) + embedding 模型 | 零额外依赖，纯 JSON 文件 |
| **维护成本** | embedding 同步、chunking 策略、检索参数调优 | 索引文件从需求树自动生成 |
| **确定性** | 语义检索结果不可预测，可能遗漏需求 | 结构化查询 = 确定性结果 |
| **调试** | "为什么没检索到这条需求？" 难以排查 | 标签/层级过滤可追溯 |
| **成本** | embedding API 调用 + 向量存储 | 零成本 |
| **准确性** | Context Rot: 长上下文+干扰内容导致遗漏 | 精确过滤，每次只处理相关子集 |

**关键洞察**：需求是高度结构化的数据，有明确的层级关系、标签、优先级。这些比语义相似度更适合做检索。RAG 的语义搜索在非结构化文本（如客服对话、技术文档）中更有优势；对于已结构化的需求树，**结构化索引 + 工具式查询** 是更优解。

---

## 业界验证

**Anthropic 的实践**（2025年9月）：
- 用 JSON feature list 管理 200+ 功能需求，每个 session 只处理一个 feature
- Agent 读取结构化列表 → 找到下一个待处理项 → 专注处理 → 标记完成
- 结果：比一次性处理所有需求更可靠

**Chroma Context Rot 研究**（2025年7月）：
- 即使最新模型（Claude 4, GPT-4.1，Gemini 2.5），输入长度增加后信息检索性能非均匀下降
- 逻辑结构化的 haystack（如需求文档）比打乱的 haystack 更容易产生遗漏
- **结论**：上下文管理比上下文窗口大小更重要

**Anthropic "Effective Context Engineering"**（2025年9月）：
- 推荐策略：compaction(自动压缩) + structured note-taking(结构化笔记) + sub-agent(子 agent 并行处理)
- 本方案实现了上述所有策略

---

## 具体实施

### 索引自动生成

每次需求变更时，服务端自动重新生成 `index.json`：

```typescript
// server/modules/requirements/index-generator.ts
function buildRequirementIndex(projectId: string): RequirementIndexItem[] {
  const allReqs = requirementRepo.listByProject(projectId);
  return allReqs.map(req => ({
    id: req.id,
    title: req.title,
    level: inferLevel(req),           // 从树深度推断
    parent: req.parentId,
    summary: summarize(req.description, 200),  // LLM 生成或截断
    tags: extractTags(req),
    priority: req.priority,
    risk: assessRisk(req),
    testType: inferTestTypes(req),
    childCount: allReqs.filter(r => r.parentId === req.id).length,
    children: allReqs.filter(r => r.parentId === req.id).map(r => r.id),
  }));
}
```

### Skill 文件加载

Agent runner 在调用 LLM 前注入 skill 指令：

```typescript
// shared/ai/skills/loader.ts
function loadSkillContext(skillNames: string[]): SkillContext {
  const skills = skillNames.map(name => {
    const skillDir = path.join(SKILLS_ROOT, name);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    const references = globSync(path.join(skillDir, 'references', '*'))
      .map(file => ({
        name: path.basename(file),
        content: fs.readFileSync(file, 'utf-8'),
      }));
    return { name, skillMd, references };
  });

  // 只加载 SKILL.md 内容，references 按需读取
  const systemPrompt = skills.map(s => s.skillMd).join('\n---\n');
  return { systemPrompt, references };
}
```

### Agent runner 集成

```typescript
// shared/ai/agent/runner.ts
async function runAgent(role: AgentRole, input: unknown, provider: AIProvider) {
  const skillContext = loadSkillContext(role.requiredSkills);
  
  const messages = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: role.systemPrompt },
    { role: 'user', content: JSON.stringify(input) },
  ];
  
  return provider.chat(messages, role.options);
}
```

---

## Out of Scope

- 需求版本管理与索引版本管理（后续迭代）
- 索引的增量更新（当前方案每次全量重建）
- 跨项目需求检索（每个项目独立索引）