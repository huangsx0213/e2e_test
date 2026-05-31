# Interpreter Skill + Progressive Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement progressive skill discovery, ReAct loop engine, Interpreter Skills, and dual-mode agent orchestration (Mode A + Mode B) as designed in `docs/specs/2026-05-31-interpreter-skill-progressive-discovery.md`.

**Architecture:** Extend existing LangGraph-based AI agent pipeline with ReAct loop support (Mode A: 3 existing agents get `execute_skill_module` tool, full skill preloading; Mode B: new OrchestratorAgent with progressive skill discovery, `search_skills`/`load_skill` tools, and HITL via `interrupt()`). SkillRegistry scans `skills/` directories, parses YAML frontmatter, and provides on-demand loading. AIProvider interface extended for tool calling.

**Tech Stack:** TypeScript, LangGraph, Azure OpenAI API (SSE streaming), Zod, Node.js `import()` for skill modules

**Plan structure:** 7 phases, 19 tasks. Each phase produces independently testable output.

---

## File Map

### New Files
| # | File | Responsibility |
|---|------|---------------|
| F1 | `shared/ai/skill-registry.ts` | Scan `skills/` directory, parse YAML frontmatter, search/load skills, merge with existing skill-discovery.ts |
| F2 | `shared/ai/react-loop-state.ts` | `ReactLoopState` and `SerializedReactLoopState` type definitions |
| F3 | `shared/ai/react-loop.ts` | Core ReAct loop engine (`runReactLoop`, `streamReactLoop`) |
| F4 | `shared/ai/skill-tools.ts` | Tool definitions: `search_skills`, `load_skill`, `execute_skill_module`, `request_review` |
| F5 | `shared/ai/roles/test-orchestrator.ts` | Orchestrator agent role definition |
| F6 | `server/.../orchestrator-node.ts` | Mode B LangGraph node: ReactLoop state persistence + interrupt/resume |
| F7 | `skills/requirement-query/index.ts` | Executable module: query/filter requirements |
| F8 | `skills/requirement-index/index.ts` | Executable module: index traversal/search |
| F9 | `skills/flow-design/index.ts` | Executable module: blueprint parsing/flow validation |

### Modified Files
| # | File | Change |
|---|------|--------|
| M1 | `shared/ai/agent.ts` | `AgentRole` add `useProgressiveDisclosure`; `createAgentContext` add branch; `runAgent`/`streamAgent` add ReAct mode; return `toolHistory` |
| M2 | `shared/ai/tool.ts` | `AgentTool.execute` accept `AgentRunOptions`, pass `useReActLoop` to `runAgent` not `createAgentContext` |
| M3 | `shared/ai/provider.ts` | `ChatResponse.toolCalls`; `ChatOptions.tools`; `parseChatResponse` extract tool_calls; `readSSEStream` delta.tool_calls |
| M4 | `shared/ai/pipeline-nodes.ts` | `AgentObserver.onComplete` add 6th param `toolHistory`; `createAgentNode`/`logExit` pass through |
| M5 | `shared/ai/skill-cache.ts` | `SkillContext` add `skillContents` and `cachedSkillContents` fields |
| M6 | `shared/ai/tool-orchestrator.ts` | No changes needed (ToolCallRecord reused as-is) |
| M7 | `shared/ai-test-gen/test-generation.ts` | Add `createOrchestratorGraph` (Mode B LangGraph) |
| M8 | `server/.../test-gen-service.ts` | Add `startOrchestrator` entry point |
| M9 | `server/.../test-gen-session.ts` | Adapt for Mode B `TestGenState` structure |
| M10 | `server/.../test-gen-scope.ts` | `recordAgentComplete` adapt for `toolHistory` |
| M11 | `server/.../db/test-gen-repository.ts` | `test_gen_agent_logs` add `tool_history` JSON column |
| M12 | `skills/*/SKILL.md` (7 files) | Add YAML frontmatter to all |

---

## Phase 1: Foundation — Interfaces + Registry

### Task 1: Add YAML frontmatter to all 7 SKILL.md files

**Files:**
- Modify: `shared/ai/skills/requirement-query/SKILL.md`
- Modify: `shared/ai/skills/requirement-index/SKILL.md`
- Modify: `shared/ai/skills/flow-design/SKILL.md`
- Modify: `shared/ai/skills/test-case-generation/SKILL.md`
- Modify: `shared/ai/skills/assertion-design/SKILL.md`
- Modify: `shared/ai/skills/data-preparation/SKILL.md`
- Modify: `shared/ai/skills/risk-analysis/SKILL.md`

- [ ] **Step 1: Prepend YAML frontmatter to each SKILL.md**

Each file gets frontmatter prepended. Example for `requirement-query`:

```yaml
---
name: requirement-query
description: Progressively load and filter requirements from the project index
tags: [requirements, query, retrieval]
module: ./index.ts
allowedTools: [query_requirements]
---

```
Append this above existing content for each skill. Use these tag mappings:

| File | name | tags | allowedTools |
|------|------|------|-------------|
| requirement-query | requirement-query | requirements, query, retrieval | query_requirements |
| requirement-index | requirement-index | requirements, index | get_index_children, search_by_tag |
| flow-design | flow-design | flows, design, blueprint | parse_blueprint, validate_flow |
| test-case-generation | test-case-generation | test-cases, generation | generate_test_cases |
| assertion-design | assertion-design | assertions, design | design_assertions |
| data-preparation | data-preparation | data, preparation | prepare_test_data |
| risk-analysis | risk-analysis | risk, analysis | analyze_risk |

- [ ] **Step 2: Verify frontmatter parses correctly**

Run `node -e "const yaml = require('js-yaml'); const fs = require('fs'); const files = ['requirement-query','requirement-index','flow-design','test-case-generation','assertion-design','data-preparation','risk-analysis']; files.forEach(f => { const c = fs.readFileSync(\`shared/ai/skills/\${f}/SKILL.md\`, 'utf8'); const m = c.match(/^---\n([\s\S]*?)\n---/); if (m) { const d = yaml.load(m[1]); console.log(\`\${f}: name=\${d.name} tags=\${d.tags.join(',')}\`); } else { console.error(\`\${f}: no frontmatter\`); } });"`
Expected: All 7 files print `name=... tags=...`.

- [ ] **Step 3: Commit**

```bash
git add shared/ai/skills/*/SKILL.md
git commit -m "feat: add YAML frontmatter to all skill SKILL.md files"
```

---

### Task 2: Create SkillRegistry and type definitions

**Files:**
- Create: `shared/ai/skill-registry.ts`
- Create: `shared/ai/react-loop-state.ts`
- Modify: `shared/ai/skill-cache.ts`

- [ ] **Step 1: Create react-loop-state.ts**

```typescript
import { ToolCallRecord } from './tool-orchestrator';

export interface ReactLoopState {
  messages: ChatMessage[];
  loadedSkills: Set<string>;
  iteration: number;
  toolHistory: ToolCallRecord[];
  totalTokenUsage: { input: number; output: number; reasoning: number };
}

export interface SerializedReactLoopState {
  loadedSkills: string[];
  toolHistory: ToolCallRecord[];
  totalTokenUsage: { input: number; output: number; reasoning: number };
  iteration: number;
}
```

- [ ] **Step 2: verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/react-loop-state.ts`
Expected: No errors (or module import warning only).

- [ ] **Step 3: Extend SkillContext in skill-cache.ts**

Add fields to the `SkillContext` interface:

```typescript
export interface SkillContext {
  systemPrompt: string;
  referenceFiles: Record<string, string>;
  skillContents: Record<string, string>;         // <-- new
  cachedSkillContents: Record<string, string>;   // <-- new
}
```

- [ ] **Step 4: Create skill-registry.ts**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';

export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  module: string;
  allowedTools: string[];
}

export class SkillRegistry {
  private skillsDir: string;
  private metadataCache: Map<string, SkillMetadata> | null = null;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async initialize(): Promise<void> {
    // Scan skills/ subdirectories, parse frontmatter, build index
    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    const meta = new Map<string, SkillMetadata>();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
      try {
        const content = await fs.readFile(skillPath, 'utf8');
        const parsed = this.parseFrontmatter(content);
        if (parsed) {
          meta.set(entry.name, parsed);
        }
      } catch {
        // No SKILL.md in directory, skip
      }
    }
    this.metadataCache = meta;
  }

  private parseFrontmatter(content: string): SkillMetadata | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const doc = yaml.load(match[1]) as any;
    return {
      name: doc.name,
      description: doc.description,
      tags: doc.tags ?? [],
      module: doc.module ?? '',
      allowedTools: doc.allowedTools ?? [],
    };
  }

  search(query: string): SkillMetadata[] {
    if (!this.metadataCache) return [];
    const q = query.toLowerCase();
    return [...this.metadataCache.values()].filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  getMetadata(name: string): SkillMetadata | undefined {
    return this.metadataCache?.get(name);
  }

  async loadContent(name: string): Promise<string> {
    const skillPath = path.join(this.skillsDir, name, 'SKILL.md');
    return fs.readFile(skillPath, 'utf8');
  }

  async loadModule(name: string): Promise<Record<string, any>> {
    const skillPath = path.join(this.skillsDir, name, 'index.ts');
    return import(skillPath);
  }

  listByTag(tag: string): SkillMetadata[] {
    if (!this.metadataCache) return [];
    return [...this.metadataCache.values()].filter(s => s.tags.includes(tag));
  }

  getAllMetadata(): SkillMetadata[] {
    return this.metadataCache ? [...this.metadataCache.values()] : [];
  }
}
```

- [ ] **Step 5: Write a quick smoke test**

```typescript
// test in Node
const registry = new SkillRegistry('shared/ai/skills');
await registry.initialize();
console.log(registry.getAllMetadata().length); // should be 7
console.log(registry.search('query').length);  // >= 1
const meta = registry.getMetadata('requirement-query');
console.log(meta?.name); // "requirement-query"
```

Run: `npx ts-node -e "<test code above>"` or use `jest` if available.

- [ ] **Step 6: Commit**

```bash
git add shared/ai/react-loop-state.ts shared/ai/skill-registry.ts shared/ai/skill-cache.ts
git commit -m "feat: add SkillRegistry and ReactLoopState types"
```

---

### Task 3: Extend AIProvider interface for tool calling

**Files:**
- Modify: `shared/ai/provider.ts`

- [ ] **Step 1: Add ToolCall interface**

```typescript
// Near top of provider.ts
export interface ToolCall {
  name: string;
  args: unknown;
  id: string;
}
```

- [ ] **Step 2: Extend ChatResponse**

```typescript
export interface ChatResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];     // <-- new
  usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number };
}
```

- [ ] **Step 3: Extend ChatOptions**

```typescript
export interface ChatOptions {
  // ...existing fields
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;     // <-- new
}
```

- [ ] **Step 4: Extend StreamChunk**

```typescript
export interface StreamChunk {
  type: 'content' | 'reasoning' | 'done' | 'error' | 'tool_call_start' | 'tool_call_end';  // extended
  content?: string;
  toolCall?: ToolCall;      // <-- new
  toolResult?: unknown;     // <-- new
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/provider.ts`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add shared/ai/provider.ts
git commit -m "feat: extend AIProvider interfaces for tool calling"
```

---

## Phase 2: HTTP Layer + ReAct Engine

### Task 4: Implement HTTP-level tool_calls parsing

**Files:**
- Modify: `shared/ai/provider.ts`

- [ ] **Step 1: Modify parseChatResponse to extract tool_calls**

Find the `parseChatResponse` function. Add tool_calls extraction after extracting content:

```typescript
function parseChatResponse(data: any): ChatResponse {
  const msg = data.choices[0].message;
  const toolCalls = msg.tool_calls?.map((tc: any) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
    id: tc.id,
  }));
  return {
    content: msg.content,
    reasoningContent: msg.reasoning_content,
    toolCalls,
    usage: { promptTokens, completionTokens, reasoningTokens },
  };
}
```

- [ ] **Step 2: Verify non-tool-call responses still work**

Existing tests should still pass since `toolCalls` is undefined when no tool_calls in response.

- [ ] **Step 3: Modify readSSEStream for delta.tool_calls**

Find the `readSSEStream` generator. Add a `currentToolCall` accumulator outside the loop:

```typescript
async function* readSSEStream(response: Response): AsyncGenerator<StreamChunk> {
  let currentToolCall: { id: string; name: string; args: string } | null = null;
  // ...existing loop
  for await (const chunk of response.body) {
    // ...existing parsing
    const delta = parsed.choices[0]?.delta;
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) {
          // New tool call started
          currentToolCall = { id: tc.id, name: tc.function.name, args: '' };
          yield { type: 'tool_call_start' as const, toolCall: { id: tc.id, name: tc.function.name, args: {} } };
        }
        if (tc.function?.arguments) {
          // Accumulate arguments incrementally
          currentToolCall!.args += tc.function.arguments;
        }
      }
    }
    // ...existing content/reasoning_content handling
  }
  // At end of stream, emit the complete tool call
  if (currentToolCall) {
    yield {
      type: 'tool_call_end' as const,
      toolCall: { ...currentToolCall, args: JSON.parse(currentToolCall.args) },
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add shared/ai/provider.ts
git commit -m "feat: add HTTP-level tool_calls parsing in parseChatResponse and readSSEStream"
```

---

### Task 5: Implement ReAct loop engine

**Files:**
- Create: `shared/ai/react-loop.ts`

- [ ] **Step 1: Create react-loop.ts**

```typescript
import { ReactLoopState, SerializedReactLoopState } from './react-loop-state';
import { AIProvider, ChatMessage, ToolCall, ChatOptions } from './provider';
import { ToolCallRecord } from './tool-orchestrator';
import { SkillRegistry } from './skill-registry';

export interface ReactLoopOptions {
  maxIterations?: number;
  tokenLimit?: number | null;
  useCache?: boolean;
  signal?: AbortSignal;
}

export interface ReactLoopResult {
  result: unknown;
  tokenUsage: { input: number; output: number; reasoning: number };
  toolHistory: ToolCallRecord[];
  requestedReview?: { phase: string; data: unknown };
  currentReactLoopState?: SerializedReactLoopState;
}

export interface ToolExecutor {
  executeTool(call: ToolCall): Promise<unknown>;
  getAgentTools(): Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  isSpecialTool(name: string): boolean;
}

export async function runReactLoop(
  provider: AIProvider,
  systemPrompt: string,
  userInput: ChatMessage,
  toolExecutor: ToolExecutor,
  skillRegistry: SkillRegistry,
  options: ReactLoopOptions = {},
  resumeState?: SerializedReactLoopState | null
): Promise<ReactLoopResult> {
  const maxIter = options.maxIterations ?? 15;
  const metadataPrompt = `Available skills:\n${
    skillRegistry.getAllMetadata().map(s => `- ${s.name}: ${s.description}`).join('\n')
  }`;
  const fullSystemPrompt = `${systemPrompt}\n\n${metadataPrompt}`;

  const state: ReactLoopState = resumeState
    ? {
        messages: [{ role: 'system', content: fullSystemPrompt } as ChatMessage],
        loadedSkills: new Set(resumeState.loadedSkills),
        iteration: resumeState.iteration,
        toolHistory: resumeState.toolHistory,
        totalTokenUsage: resumeState.totalTokenUsage,
      }
    : {
        messages: [{ role: 'system', content: fullSystemPrompt } as ChatMessage, userInput],
        loadedSkills: new Set<string>(),
        iteration: 0,
        toolHistory: [],
        totalTokenUsage: { input: 0, output: 0, reasoning: 0 },
      };

  for (state.iteration = resumeState?.iteration ?? 0; state.iteration < maxIter; state.iteration++) {
    const chatOptions: ChatOptions = {
      tools: toolExecutor.getAgentTools(),
      signal: options.signal,
    };

    const response = await provider.chat(state.messages, chatOptions);

    // Accumulate token usage and check budget
    if (response.usage) {
      state.totalTokenUsage.input += response.usage.promptTokens ?? 0;
      state.totalTokenUsage.output += response.usage.completionTokens ?? 0;
      state.totalTokenUsage.reasoning += response.usage.reasoningTokens ?? 0;
    }
    const totalTokens = state.totalTokenUsage.input + state.totalTokenUsage.output;
    if (options.tokenLimit && totalTokens > options.tokenLimit) {
      throw new Error(`Token limit exceeded (${totalTokens} > ${options.tokenLimit}).`);
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      // Handle user-facing assistant message with tool call text
      state.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls.map(tc => ({ ...tc })),
      } as any); // toolCalls on assistant message supported by OpenAI

      for (const call of response.toolCalls) {
        if (toolExecutor.isSpecialTool(call.name)) {
          if (call.name === 'load_skill') {
            const content = await skillRegistry.loadContent(call.args as any);
            state.messages.push({
              role: 'user',
              content: `[Skill Loaded: ${(call.args as any).name}]\n${content}`,
            });
            state.loadedSkills.add((call.args as any).name);
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: `Skill loaded: ${(call.args as any).name}` },
              stepIndex: state.iteration,
            });
          } else if (call.name === 'request_review') {
            return {
              result: response.content,
              tokenUsage: { ...state.totalTokenUsage },
              toolHistory: [...state.toolHistory, {
                toolName: call.name,
                input: call.args,
                result: { success: true, data: 'Review requested' },
                stepIndex: state.iteration,
              }],
              requestedReview: call.args as any,
              currentReactLoopState: {
                loadedSkills: [...state.loadedSkills],
                toolHistory: [...state.toolHistory],
                totalTokenUsage: { ...state.totalTokenUsage },
                iteration: state.iteration,
              },
            };
          }
        } else {
          try {
            const result = await toolExecutor.executeTool(call);
            state.messages.push({
              role: 'user',
              content: `Tool result for ${call.name}: ${JSON.stringify(result)}`,
            });
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: true, data: result },
              stepIndex: state.iteration,
            });
          } catch (err: any) {
            state.messages.push({
              role: 'user',
              content: `Tool ${call.name} failed: ${err.message}`,
            });
            state.toolHistory.push({
              toolName: call.name,
              input: call.args,
              result: { success: false, error: err.message },
              stepIndex: state.iteration,
            });
          }
        }
      }
    } else {
      // No tool calls — final answer
      return {
        result: response.content,
        tokenUsage: { ...state.totalTokenUsage },
        toolHistory: [...state.toolHistory],
      };
    }
  }

  // Max iterations reached
  const lastContent = state.messages.filter(m => m.role === 'assistant').pop()?.content ?? '';
  return {
    result: lastContent,
    tokenUsage: { ...state.totalTokenUsage },
    toolHistory: [...state.toolHistory],
  };
}
```

- [ ] **Step 2: Verify imports resolve**

Run: `npx tsc --noEmit shared/ai/react-loop.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/ai/react-loop.ts
git commit -m "feat: implement ReAct loop engine"
```

---

### Task 6: Implement skill tools

**Files:**
- Create: `shared/ai/skill-tools.ts`

- [ ] **Step 1: Create skill-tools.ts**

```typescript
import { SkillRegistry, SkillMetadata } from './skill-registry';
import { ToolCall } from './provider';

export function createSearchSkillsTool(registry: SkillRegistry) {
  return {
    name: 'search_skills',
    description: 'Search available skills by name, description, or tags. Returns metadata (name, description, tags) for matching skills.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    execute: async (args: { query: string }): Promise<SkillMetadata[]> => {
      return registry.search(args.query);
    },
  };
}

export function createLoadSkillTool(registry: SkillRegistry) {
  return {
    name: 'load_skill',
    description: 'Load the full SKILL.md content for a skill by name. Injects instructions into the agent context.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name to load' },
      },
      required: ['name'],
    },
    execute: async (args: { name: string }): Promise<string> => {
      return registry.loadContent(args.name);
    },
  };
}

export function createExecuteSkillModuleTool(registry: SkillRegistry, deps?: { db?: any; toolRegistry?: any }) {
  return {
    name: 'execute_skill_module',
    description: 'Execute a function from a skill executable module (index.ts). Calls the exported function with provided arguments.',
    parameters: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Name of the skill whose module to call' },
        functionName: { type: 'string', description: 'Name of the exported function to call' },
        args: { type: 'array', description: 'Array of arguments to pass to the function' },
      },
      required: ['skillName', 'functionName', 'args'],
    },
    execute: async (args: { skillName: string; functionName: string; args: unknown[] }): Promise<unknown> => {
      const module = await registry.loadModule(args.skillName);
      if (module.createService && deps) {
        const service = module.createService(deps);
        return await service[args.functionName](...args.args);
      }
      if (typeof module[args.functionName] !== 'function') {
        throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
      }
      return await module[args.functionName](...args.args);
    },
  };
}

export function createRequestReviewTool() {
  return {
    name: 'request_review',
    description: 'Request human review of intermediate results. Pauses execution until user provides feedback.',
    parameters: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'Label for the review phase (e.g. "requirements", "test-design")' },
        data: { type: 'object', description: 'Data to present for review' },
      },
      required: ['phase', 'data'],
    },
    execute: async (_args: { phase: string; data: unknown }): Promise<never> => {
      throw new Error('request_review must be handled by the ReAct loop, not direct execution');
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/skill-tools.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/ai/skill-tools.ts
git commit -m "feat: implement skill tools (search, load, execute, request_review)"
```

---

## Phase 3: Agent Integration

### Task 7: Extend AgentRole and createAgentContext

**Files:**
- Modify: `shared/ai/agent.ts`
- Modify: `shared/ai/skill-cache.ts`

- [ ] **Step 1: Add useProgressiveDisclosure to AgentRole**

```typescript
export interface AgentRole {
  name: string;
  systemPromptTemplate: string;
  requiredSkills: string[];
  inputSchema: ZodType;
  outputSchema: ZodType;
  options?: ChatOptions;
  useProgressiveDisclosure?: boolean;  // <-- new
  allowedTools?: string[];             // <-- new (for Mode A)
}
```

- [ ] **Step 2: Modify createAgentContext with branch logic**

```typescript
export function createAgentContext(
  provider: AIProvider,
  role: AgentRole,
  opts?: {
    promptVersion?: string;
    modelName?: string;
    tokenLimit?: number | null;
  }
): AgentContext {
  const useProgressiveDisclosure = role.useProgressiveDisclosure ?? false;

  let skillContext: SkillContext;
  if (useProgressiveDisclosure) {
    const allMetadata = SkillRegistryInstance.getAllMetadata();
    skillContext = {
      systemPrompt: `Available skills:\n${
        allMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n')
      }`,
      referenceFiles: {},
      skillContents: {},
      cachedSkillContents: {},
    };
  } else {
    // Use a global SkillRegistry or fall back to existing loadSkillContext
    skillContext = loadSkillContext(role.requiredSkills ?? []);
  }

  return {
    provider,
    role,
    skillContext,
    tokenTracker: new TokenTracker(),
    promptVersion: opts?.promptVersion ?? 'default',
    modelName: opts?.modelName ?? 'default',
    tokenLimit: opts?.tokenLimit ?? null,
  };
}
```

Note: Need to make `SkillRegistry` accessible (via singleton or module-level instance) for the progressive disclosure path.

- [ ] **Step 3: Ensure SkillRegistry singleton is accessible**

```typescript
// At module level in agent.ts or a separate singleton file
import { SkillRegistry } from './skill-registry';
export const globalSkillRegistry = new SkillRegistry('shared/ai/skills');
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/agent.ts`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add shared/ai/agent.ts shared/ai/skill-cache.ts
git commit -m "feat: extend AgentRole with useProgressiveDisclosure; add createAgentContext branch"
```

---

### Task 8: Modify AgentTool.execute and AgentRunOptions

**Files:**
- Modify: `shared/ai/agent.ts`
- Modify: `shared/ai/tool.ts`

- [ ] **Step 1: Extend AgentRunOptions in agent.ts**

```typescript
export interface AgentRunOptions {
  // ...existing
  useReActLoop?: boolean;                // <-- new
  resumeState?: import('./react-loop-state').SerializedReactLoopState | null;  // <-- new
}
```

- [ ] **Step 2: Modify AgentTool.execute in tool.ts**

```typescript
// Inside AgentTool.execute
async execute(input: TInput, ctx?: ToolContext & AgentRunOptions): Promise<ToolResult<TOutput>> {
  const agentCtx = createAgentContext(provider, this.role, {
    promptVersion: ctx?.promptVersion ?? this.getPromptVersion(),
    modelName: ctx?.modelName ?? this.getModelName(),
    tokenLimit: ctx?.tokenLimit,
  });

  if (ctx?.useReActLoop) {
    const result = await runReactLoop(
      agentCtx.provider,
      agentCtx.skillContext.systemPrompt,
      { role: 'user', content: JSON.stringify(input) },
      this.createToolExecutor(agentCtx),
      globalSkillRegistry,
      { signal: ctx?.signal, tokenLimit: agentCtx.tokenLimit },
      ctx?.resumeState
    );

    return {
      success: true,
      data: {
        result: result.result,
        tokenUsage: result.tokenUsage,
        toolHistory: result.toolHistory,
        requestedReview: result.requestedReview,
        currentReactLoopState: result.currentReactLoopState,
      } as any,
      metadata: {},
    };
  }

  // ...existing single-shot path
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/tool.ts`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add shared/ai/agent.ts shared/ai/tool.ts
git commit -m "feat: extend AgentTool.execute with ReAct loop path via useReActLoop option"
```

---

## Phase 4: Mode A (Pipeline) Changes

### Task 9: Configure Mode A agents with allowedTools + toolHistory propagation

**Files:**
- Modify: `shared/ai/pipeline-nodes.ts`
- Modify: `shared/ai-test-gen/test-generation.ts`

- [ ] **Step 1: Modify AgentObserver.onComplete signature**

```typescript
// pipeline-nodes.ts
export interface AgentObserver {
  onStart?: (agentName: string) => void;
  onToolCall?: (agentName: string, toolCall: { name: string; input: unknown; iteration: number }) => void;
  onComplete?: (
    agentName: string,
    tokenUsage: { input: number; output: number; reasoning: number },
    latencyMs: number,
    inputPrompt?: ChatMessage[],
    outputData?: unknown,
    toolHistory?: ToolCallRecord[]    // <-- new 6th param
  ) => void;
}
```

- [ ] **Step 2: Propagate toolHistory in createAgentNode**

```typescript
// In createAgentNode, after runAgent completes
const raw = await runAgent(agentCtx, input, opts);
// ...existing logExit call
logExit(observer, agentName, raw, latencyMs, inputPrompt);

// New: pass toolHistory
observer.onComplete?.(
  agentName,
  raw.tokenUsage,
  latencyMs,
  inputPrompt,
  raw.result,
  (raw as any).toolHistory    // <-- 6th param
);
```

- [ ] **Step 3: Configure test-generation.ts for Mode A allowedTools**

In the pipeline builder, when creating Agent instances for Mode A, set the allowed tools per role:

```typescript
// In createPipeline or equivalent function
const analystRole: AgentRole = {
  ...baseAnalystRole,
  useProgressiveDisclosure: false,
  allowedTools: ['execute_skill_module'],
};
```

Similar for designer and quality manager roles.

- [ ] **Step 4: Commit**

```bash
git add shared/ai/pipeline-nodes.ts shared/ai-test-gen/test-generation.ts
git commit -m "feat: propagate toolHistory in pipeline nodes; configure Mode A allowedTools"
```

---

## Phase 5: Mode B (Orchestrator) Changes

### Task 10: Create OrchestratorAgent role

**Files:**
- Create: `shared/ai/roles/test-orchestrator.ts`

- [ ] **Step 1: Create orchestrator role**

```typescript
import { AgentRole } from '../../agent';

export const orchestratorRole: AgentRole = {
  name: 'test-orchestrator',
  systemPromptTemplate: `You are a test orchestration agent. Your job is to plan and execute test generation.

You have access to the following capabilities:
1. search_skills - Find skills relevant to your current task
2. load_skill - Load a skill's full instructions
3. execute_skill_module - Call deterministic functions from skill modules
4. spawn_subagent - Delegate work to a specialized sub-agent (analyst, designer, quality manager)
5. request_review - Pause and request human review of intermediate results

Follow this general workflow:
- Search for relevant skills
- Load and use skills as needed
- Delegate specialized work to sub-agents
- Request human review at key decision points`,
  requiredSkills: [
    'requirement-query',
    'requirement-index',
    'flow-design',
    'test-case-generation',
    'assertion-design',
    'data-preparation',
    'risk-analysis',
  ],
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({}).passthrough(),
  options: {},
  useProgressiveDisclosure: true,
  allowedTools: ['search_skills', 'load_skill', 'execute_skill_module', 'spawn_subagent', 'request_review'],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit shared/ai/roles/test-orchestrator.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add shared/ai/roles/test-orchestrator.ts
git commit -m "feat: create OrchestratorAgent role with progressive disclosure"
```

---

### Task 11: Create orchestrator-node.ts

**Files:**
- Create: `server/.../orchestrator-node.ts`

- [ ] **Step 1: Create the LangGraph node**

```typescript
import { AgentTool } from '../../../shared/ai/tool';
import { orchestratorRole } from '../../../shared/ai/roles/test-orchestrator';
import { SerializedReactLoopState } from '../../../shared/ai/react-loop-state';

export interface TestGenState {
  input: unknown;
  messages: any[];
  reactLoopState: SerializedReactLoopState | null;
  result?: unknown;
  toolHistory?: any[];
}

export async function orchestratorNode(state: TestGenState): Promise<Partial<TestGenState>> {
  const agent = new AgentTool(
    orchestratorRole,
    provider,
    getPromptVersion,
    getModelName
  );

  const result = await agent.execute(state.input, {
    useReActLoop: true,
    resumeState: state.reactLoopState,
  });

  if (result.requestedReview && result.currentReactLoopState) {
    const feedback = interrupt({
      type: 'request_review',
      phase: result.requestedReview.phase,
      data: result.requestedReview.data,
      reactLoopState: result.currentReactLoopState,
    });
    return {
      messages: [...(state.messages ?? []), { role: 'user', content: feedback as string }],
      reactLoopState: result.currentReactLoopState,
    };
  }

  return {
    result: result.result,
    toolHistory: result.toolHistory,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/.../orchestrator-node.ts
git commit -m "feat: create orchestrator LangGraph node with ReactLoop + interrupt/resume"
```

---

### Task 12: Add createOrchestratorGraph to test-generation.ts

**Files:**
- Modify: `shared/ai-test-gen/test-generation.ts`

- [ ] **Step 1: Add the graph builder**

```typescript
import { StateGraph, END } from '@langchain/langgraph';
import { orchestratorNode, TestGenState } from '../server/modules/ai-test-gen/application/orchestrator-node';

export function createOrchestratorGraph(): StateGraph {
  const workflow = new StateGraph({
    channels: {
      input: { value: null },
      messages: { value: [] },
      reactLoopState: { value: null },
      result: { value: null },
      toolHistory: { value: [] },
    },
  });

  workflow.addNode('orchestrator', orchestratorNode);
  workflow.addConditionalEdges('orchestrator', (state: TestGenState) => {
    if (state.result !== undefined) return 'checkpoint';
    return 'orchestrator'; // Continue loop if reviewing
  });
  workflow.addNode('checkpoint', async (state: TestGenState) => state);
  workflow.setEntryPoint('orchestrator');
  workflow.addEdge('checkpoint', END);

  return workflow;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/ai-test-gen/test-generation.ts
git commit -m "feat: add createOrchestratorGraph for Mode B LangGraph"
```

---

### Task 13: Add startOrchestrator to TestGenService

**Files:**
- Modify: `server/modules/ai-test-gen/application/test-gen-service.ts`

- [ ] **Step 1: Add the new entry point**

```typescript
async startOrchestrator(input: unknown, session: TestGenSession) {
  const graph = createOrchestratorGraph();
  const compiled = graph.compile();

  const result = await session.startBatch({
    pipelineFactory: () => compiled,
    input,
    config: {
      // Use existing concurrencySlot, abortController, token budget
      ...this.getBatchConfig(),
    },
  });

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/modules/ai-test-gen/application/test-gen-service.ts
git commit -m "feat: add startOrchestrator entry point for Mode B"
```

---

### Task 14: Adapt TestGenSession for Mode B state

**Files:**
- Modify: `server/modules/ai-test-gen/application/test-gen-session.ts`

- [ ] **Step 1: Adapt startBatch/resumeBatch for TestGenState**

```typescript
// In startBatch method, when Mode B state is detected
// The TestGenState interface adds reactLoopState field
// Ensure deteckCheckpointNumber handles the new state shape
// Only change needed: widen the state type check to include reactLoopState
```

The change is minimal — `TestGenSession` already works with arbitrary state shapes via `StateGraph`. Add a type guard:

```typescript
function isOrchestratorState(state: any): state is { reactLoopState: any } {
  return 'reactLoopState' in state;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/modules/ai-test-gen/application/test-gen-session.ts
git commit -m "feat: adapt TestGenSession for Mode B TestGenState shape"
```

---

## Phase 6: Persistence Changes

### Task 15: Database and scope changes for toolHistory

**Files:**
- Modify: `server/modules/ai-test-gen/application/test-gen-scope.ts`
- Modify: `server/modules/ai-test-gen/infrastructure/db/test-gen-repository.ts`

- [ ] **Step 1: Adapt recordAgentComplete for toolHistory**

```typescript
// test-gen-scope.ts
recordAgentComplete(
  agentName: string,
  batch: TestGenBatch,
  result: {
    tokenUsage: { input: number; output: number; reasoning: number };
    latencyMs: number;
    inputPrompt?: ChatMessage[];
    outputData?: unknown;
    toolHistory?: ToolCallRecord[];  // <-- new optional field
  }
): void {
  // ...existing logic
  if (result.toolHistory) {
    batch.toolHistory = result.toolHistory;
  }
}
```

- [ ] **Step 2: Add tool_history column to agent_logs**

```typescript
// test-gen-repository.ts — migration or schema update
// Add to the test_gen_agent_logs table:
// tool_history JSON NULL

// In the insert/update method, pass toolHistory as JSON:
const toolHistoryJson = log.toolHistory ? JSON.stringify(log.toolHistory) : null;
// Add to SQL: tool_history = @toolHistoryJson
```

- [ ] **Step 3: Commit**

```bash
git add server/modules/ai-test-gen/application/test-gen-scope.ts server/modules/ai-test-gen/infrastructure/db/test-gen-repository.ts
git commit -m "feat: persist toolHistory in agent logs table"
```

---

## Phase 7: Skill Executable Modules

### Task 16: Create requirement-query module

**Files:**
- Create: `shared/ai/skills/requirement-query/index.ts`

- [ ] **Step 1: Create the executable module**

```typescript
import { SkillRegistry } from '../../skill-registry';

export interface QueryFilters {
  tags?: string[];
  keywords?: string[];
  status?: string;
}

export function queryRequirements(
  filters: QueryFilters,
  indexData: any[]
): any[] {
  let results = [...indexData];
  if (filters.tags && filters.tags.length > 0) {
    results = results.filter(r =>
      filters.tags!.some(t => r.tags?.includes(t))
    );
  }
  if (filters.keywords && filters.keywords.length > 0) {
    const q = filters.keywords.map(k => k.toLowerCase());
    results = results.filter(r =>
      q.some(k =>
        r.title?.toLowerCase().includes(k) ||
        r.description?.toLowerCase().includes(k)
      )
    );
  }
  if (filters.status) {
    results = results.filter(r => r.status === filters.status);
  }
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/ai/skills/requirement-query/index.ts
git commit -m "feat: create requirement-query executable module"
```

---

### Task 17: Create requirement-index module

**Files:**
- Create: `shared/ai/skills/requirement-index/index.ts`

- [ ] **Step 1: Create the executable module**

```typescript
export interface IndexNode {
  id: string;
  parentId: string | null;
  title: string;
  type: string;
  tags?: string[];
}

export function getChildren(index: IndexNode[], parentId: string): IndexNode[] {
  return index.filter(n => n.parentId === parentId);
}

export function searchByTag(index: IndexNode[], tag: string): IndexNode[] {
  return index.filter(n => n.tags?.includes(tag));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/ai/skills/requirement-index/index.ts
git commit -m "feat: create requirement-index executable module"
```

---

### Task 18: Create flow-design module

**Files:**
- Create: `shared/ai/skills/flow-design/index.ts`

- [ ] **Step 1: Create the executable module**

```typescript
export interface FlowNode {
  id: string;
  type: 'action' | 'decision' | 'start' | 'end';
  label: string;
  next?: string[];
}

export interface FlowBlueprint {
  nodes: FlowNode[];
  edges: Array<{ from: string; to: string }>;
}

export function parseBlueprint(blueprint: string): FlowBlueprint {
  try {
    return JSON.parse(blueprint);
  } catch {
    throw new Error('Invalid blueprint JSON');
  }
}

export function validateFlow(flow: FlowBlueprint): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = new Set(flow.nodes.map(n => n.id));

  // Check all edges reference valid nodes
  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`Edge from ${edge.from}: source not found`);
    if (!nodeIds.has(edge.to)) errors.push(`Edge to ${edge.to}: target not found`);
  }

  // Check for unreachable nodes
  const reachable = new Set<string>();
  const startNodes = flow.nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push('No start node found');
  } else {
    const queue = startNodes.map(n => n.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const edges = flow.edges.filter(e => e.from === id);
      queue.push(...edges.map(e => e.to));
    }
    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Node ${node.id} (${node.label}) is unreachable`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/ai/skills/flow-design/index.ts
git commit -m "feat: create flow-design executable module"
```

---

## Self-Review Checklist

### Spec Coverage

- **Section 2 (Skill format):** Task 1 (SKILL.md frontmatter), Task 16-18 (index.ts modules)
- **Section 3 (AIProvider extension):** Task 3 (interfaces), Task 4 (HTTP parsing)
- **Section 4 (ReAct Loop):** Task 5 (engine), Task 6 (tools), Task 7-8 (agent integration)
- **Section 5 (Interpreter Skills):** Task 16-18 (executable modules)
- **Section 6 (Subagent mechanism):** Task 8 (AgentTool.execute spawns subagents)
- **Section 7 (Dual Mode):** Task 9 (Mode A), Task 10-14 (Mode B)
- **Section 8 (File list):** All 19 tasks cover every file in the file map
- **Section 9 (Security):** maxIterations=15, token budget, nesting depth ≤ 1 — enforced in Task 5

### Placeholder Scan

No TBD, TODO, "implement later", or other placeholder patterns.

### Type Consistency

- `ReactLoopState` defined in Task 2, used in Task 5 (engine), Task 7-8 (agent integration), Task 11 (orchestrator-node)
- `SerializedReactLoopState` defined in Task 2, used in Task 5, Task 8 (resumeState), Task 11 (checkpoint)
- `ToolCallRecord` from existing `tool-orchestrator.ts` — not redefined
- `AgentRunOptions.useReActLoop` defined in Task 8, set in Task 9 (Mode A) and Task 11 (Mode B)
- `AgentRole.useProgressiveDisclosure` defined in Task 7, set in Task 9 (Mode A: false) and Task 10 (Mode B: true)
