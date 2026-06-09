# AI Test Generation — Technical Architecture

> **Scope:** This document is a complete, code-derived technical reference for the
> **AI Test Generation** subsystem of QuantumQA. It is based strictly on the
> implementation in the repository at `D:\Projects\e2e_test`. Every claim is
> backed by a `file_path:line_number` reference.
>
> **Reading order:** Sections 1–4 give the conceptual model, 5–8 the runtime
> pipeline, 9–11 the supporting subsystems, 12–15 the I/O surface (DB, REST,
> SSE, UI), 16–18 the operational concerns (quality, failure modes, perf).

---

## Table of Contents

1.  [Overview & Design Goals](#1-overview--design-goals)
2.  [High-Level Architecture](#2-high-level-architecture)
3.  [Module Map](#3-module-map)
4.  [End-to-End Data Flow](#4-end-to-end-data-flow)
5.  [LangGraph State Machine](#5-langgraph-state-machine)
6.  [Agent Roles & I/O Schemas](#6-agent-roles--io-schemas)
7.  [Skill System & Progressive Disclosure](#7-skill-system--progressive-disclosure)
8.  [ReAct Loop & Tool Orchestration](#8-react-loop--tool-orchestration)
9.  [LLM Provider Layer](#9-llm-provider-layer)
10. [Server-Side Orchestration](#10-server-side-orchestration)
11. [Checkpoint / Human-in-the-Loop](#11-checkpoint--human-in-the-loop)
12. [Database Schema](#12-database-schema)
13. [REST API](#13-rest-api)
14. [Server-Sent Events (SSE) Protocol](#14-server-sent-events-sse-protocol)
15. [Frontend Architecture](#15-frontend-architecture)
16. [Quality, Repair & Guardrails](#16-quality-repair--guardrails)
17. [Persistence, Caching & Versioning](#17-persistence-caching--versioning)
18. [Observability, Limits & Failure Modes](#18-observability-limits--failure-modes)
19. [Sequence Walkthroughs](#19-sequence-walkthroughs)
20. [Configuration Reference](#20-configuration-reference)

---

## 1. Overview & Design Goals

AI Test Generation is a subsystem that converts **natural-language requirements**
(authored in the QuantumQA requirement tree) into **ISTQB-style natural-language
test cases** that can be either edited by humans or handed off to the recording
engine for automated execution.

The implementation is grounded in three engineering goals:

| Goal | How the design satisfies it |
|---|---|
| **Determinism at the orchestration layer, creativity at the LLM** | A static 3-agent LangGraph pipeline with hard-coded routing decides *when* each agent runs; the LLM decides *what* the test artifacts look like. |
| **Human-quality output** | Three sequential human-review checkpoints with retry, edit, and human-feedback channels; ISTQB technique constraints; coverage-matrix feedback loop. |
| **Operational safety** | Per-run concurrency cap, circuit breaker for LLM providers, abort/resume, deterministic JSON repair, prompt-injection guard, replayable SSE event stream. |

**Pillars of the design:**

1. **Static, deterministic pipeline** — `shared/ai-test-gen/test-generation.ts:251-286`
   builds a `StateGraph` with six nodes and five edges. The graph topology
   never changes at runtime; only state and prompts change.
2. **Three ISTQB roles** — `test-analyst`, `test-designer`, `quality-manager`
   in `shared/ai/roles/`. Each is a frozen declarative object
   (`AgentRole`) consumed by the agent runtime.
3. **Progressive disclosure of skills** — Each agent starts with only a
   ~100-token index of all skills (`createAgentContext` at
   `shared/ai/agent.ts:34-67`); it pulls full skill bodies on demand via the
   ReAct loop, with `allowedTools` enforcing the principle of least
   privilege.
4. **Server-side orchestration** — A typed service layer in
   `server/modules/ai-test-gen/application/` handles batching, persistence,
   SSE fan-out, and resume. It is decoupled from the LangGraph graph via the
   `pipelineFactory` indirection.
5. **Checkpointed human-in-the-loop** — LangGraph's `interrupt<T>()` (from
   `@langchain/langgraph`) is the *only* mechanism by which the graph yields
   control to humans. State is persisted by `SqliteSaver` so resumes are
   crash-safe (`test-gen-service.ts:235`).
6. **Two operating modes** — `auto` (approves each checkpoint automatically)
   and `interactive` (pauses for a human). Selection is per-run and per-batch
   (`test-gen-service.ts:267`, `schema.ts:6`).

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite)                                           │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  AiTestGenPage (client/features/ai-test-gen)                 │     │
│  │   ├─ TestGenConfigPanel  (start form)                        │     │
│  │   ├─ TestGenStepper      (live graph view)                   │     │
│  │   ├─ TestGenDetailPanel  (logs / thinking / checkpoint UI)   │     │
│  │   └─ TestGenRunHistory   (past runs)                         │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │ fetch + EventSource (SSE)         │ TanStack Query
               ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Express 5 server (Node)                                              │
│  /api/test-gen/*  ←→  TestGenService                                 │
│   ├─ routes (index.ts)                                               │
│   ├─ application/  (orchestration, batch, session, resolvers)         │
│   ├─ infrastructure/db/  (SQLite repository)                         │
│   └─ infrastructure/sse/  (SSE gateway with replay buffer)           │
└──────┬────────────────────────────────────────────┬──────────────────┘
       │                                            │
       ▼                                            ▼
┌──────────────────┐                  ┌──────────────────────────────┐
│  SQLite (Better) │                  │  LangGraph SqliteSaver       │
│  (runs, logs,    │                  │  (per-batch graph state)     │
│   cache, audit)  │                  └──────────────┬───────────────┘
└──────┬───────────�┘                                 │
       │                                             ▼
       │              ┌────────────────────────────────────────────┐
       │              │  shared/ai-test-gen/test-generation.ts      │
       │              │   createOrchestratedPipeline()              │
       │              │   StateGraph(6 nodes, 5 edges)              │
       │              └────┬──────┬──────┬──────┬──────┬────────────┘
       │                   │      │      │      │      │
       │                   ▼      ▼      ▼      ▼      ▼
       │           ┌────────────────────────────────────────┐
       │           │  shared/ai/roles/                      │
       │           │   test-analyst  → test-designer →      │
       │           │   quality-manager                      │
       │           └─────┬──────────────────────────────────┘
       │                 │
       │                 ▼
       │           ┌──────────────────────┐    ┌──────────────────────┐
       │           │  shared/ai/agent.ts  │    │  shared/ai/          │
       │           │   runAgent()         │───▶│  react-loop.ts       │
       │           │   ReAct path or      │    │  (tool orchestration)│
       │           │   single-shot path   │    └──────┬───────────────┘
       │           └──────┬───────────────┘           │
       │                  │                           ▼
       │                  │                  ┌────────────────────────┐
       │                  │                  │  shared/ai/skill-      │
       │                  │                  │  tools.ts              │
       │                  │                  │  search_skills/load_   │
       │                  │                  │  skill/execute_module/ │
       │                  │                  │  fetch_requirement_    │
       │                  │                  │  resource              │
       │                  │                  └────────┬───────────────┘
       │                  │                           │
       │                  ▼                           ▼
       │           ┌──────────────────────────────────────────────┐
       │           │  shared/ai/provider.ts                       │
       │           │   4 adapters: Azure / NVIDIA NIM / OpenRouter│
       │           │   / OpenAI + CircuitBreaker + Streaming SSE  │
       │           └────────────────────┬─────────────────────────┘
       │                                │
       │                                ▼
       │                       ┌────────────────────┐
       │                       │  External LLM APIs │
       │                       └────────────────────┘
       │
       ▼
   All persistence paths flow through TestGenRepository / CacheStore.
```

---

## 3. Module Map

The AI Test Generation code spans three top-level roots:

### 3.1 `shared/ai-test-gen/`

The cross-runtime pipeline definition. **Server** code imports
`createOrchestratedPipeline` from here.

| File | Lines | Role |
|---|---|---|
| `test-generation.ts` | 520 | `createTestGenerationPipeline`, `createOrchestratedPipeline`, `createToolRegistry`, `createOrchestratorGraph`. Builds the LangGraph `StateGraph`, the `TestGenStateAnnotation`, the two production pipeline factories, and the lower-level tool-orchestrator graph. |

### 3.2 `shared/ai/`

The reusable agent runtime and skill system. **No server-specific code**.

| File | Lines | Role |
|---|---|---|
| `agent.ts` | 659 | `AgentRole`, `AgentContext`, `createAgentContext`, `runAgent`, `streamAgent`, `prepareAgentRun`, retry/repair logic, `repairAgentOutput`, JSON extraction/normalization. |
| `pipeline-nodes.ts` | 131 | `createAgentNode`, `createToolNode`, `createCheckpointNode` — adapters that turn roles/tools/checkpoint payloads into LangGraph node functions. |
| `roles/test-analyst.ts` | 111 | `TestAnalystRole` — input/output Zod schemas, system-prompt template, `allowedTools`, `useProgressiveDisclosure: true`. |
| `roles/test-designer.ts` | 62 | `TestDesignerRole`. |
| `roles/quality-manager.ts` | 35 | `QualityManagerRole`. |
| `roles/index.ts` | — | Barrel. |
| `skill-registry.ts` | 144 | `SkillRegistry` — file-system-backed index of all `SKILL.md` frontmatter; supports `search`, `loadContent`, `loadModule`, `loadResource`. |
| `skill-cache.ts` | 78 | `SkillCache` — non-progressive (legacy) loader: reads every `SKILL.md` + `references/*` for `role.requiredSkills`, and computes a hash-based `promptVersion`. |
| `skill-loader.ts` | 14 | Thin wrapper around `SkillCache` (`loadSkillContext`, `readReferenceFile`). |
| `skill-tools.ts` | 80 | `createSearchSkillsTool`, `createLoadSkillTool`, `createExecuteSkillModuleTool`, `createFetchRequirementResourceTool`. |
| `react-loop.ts` | 479 | `runReactLoop`, `streamReactLoop`, `ToolExecutor` interface. Bounded iteration loop (`maxIterations: 15`). |
| `react-loop-state.ts` | 16 | `ReactLoopState`, `SerializedReactLoopState` types. |
| `provider.ts` | 434 | `AIProvider` interface, 4 concrete adapters, `CircuitBreaker`, `createAIProviderWithFallback`, SSE stream reader. |
| `provider-types.ts` | — | `ProviderConfig` extended config (circuit breaker settings, fallbacks). |
| `tool.ts` | 253 | `AgentTool` (wraps a role as a `ToolDef`), `FunctionTool`, `JsonSchema`, `ToolResult`, `ToolContext`, `resolveToolErrorCode`. |
| `tool-orchestrator.ts` | 327 | `ToolOrchestrator` — the dynamic graph builder used by `createOrchestratedPipeline`. |

| `tool-converter.ts` | — | Zod → JSON Schema conversion. |
| `cache.ts` | 51 | `CacheStore` interface, `getCached`, `setCache`, `invalidateCache`, SHA-256 cache key. |
| `semaphore.ts` | 38 | `Semaphore` — async concurrency control. |
| `token-tracker.ts` | 34 | `TokenTracker` with optional per-model cost. |
| `guard.ts` | 24 | `inspectUserInput` — regex-based prompt-injection detector. |

| `prompt-version.ts` | 5 | `computePromptVersion()` — delegates to `skillCache.computeVersion()`. |
| `__tests__/*.test.ts` | — | Vitest unit tests (8 files). |

### 3.3 `server/modules/ai-test-gen/`

The server-side control plane.

| File | Lines | Role |
|---|---|---|
| `index.ts` | 157 | Express router for `/api/test-gen/*`. |
| `schema.ts` | 22 | Zod schemas for `POST /:projectId/start`, `/:runId/resume`, `/:runId/checkpoint-update`. |
| `business-flow-blueprint.ts` | 35 | `buildBusinessFlowBlueprints` — flatten a `BusinessFlow[]` into `PipelineBusinessFlowBlueprint[]`. |
| `test-gen-persister.ts` | 61 | `RunPersister` interface, `TestGenPersister` impl (writes to `test_gen_agent_logs`, `test_gen_audit_log`, `test_gen_runs`). |
| `test-gen-run-state.ts` | 124 | In-memory run state (`AgentRunSnapshot` accumulation, total token usage). |
| `test-gen-scope.ts` | 109 | `TestGenExecutionScope` — façade that ties `TestGenRunState` + `TestGenPersister` + SSE emitter together. |
| `application/test-gen-service.ts` | 766 | `TestGenService` — the top-level orchestrator (start, resume, recover, abort). |
| `application/test-gen-session.ts` | 268 | `TestGenSession` — wraps a single compiled graph + checkpoint resume cycle. |
| `application/batch-orchestrator.ts` | 101 | `BatchOrchestrator` — multi-batch fan-out and error isolation. |
| `application/checkpoint-resolver.ts` | 52 | `AutoResolver` (no-op) and `InteractiveResolver` (emits SSE on interrupt). |
| `application/requirement-grouper.ts` | 40 | `groupRequirementsByEpic` — buckets selected requirements by root epic. |
| `application/result-deduplicator.ts` | 27 | `deduplicateTestCases` — cross-batch dedup by normalized title. |
| `application/phase-machine.ts` | 82 | `PhaseMachine` — strict enum of phases + transition table. |
| `application/fallback-config-builder.ts` | 20 | `buildFallbackConfigs` — decrypts the API keys of fallback provider rows. |
| `infrastructure/db/test-gen-repository.ts` | 276 | `TestGenRepository` — every SQL statement the subsystem issues; `pipelineRepo` singleton. |
| `infrastructure/sse/sse-gateway.ts` | 131 | `SSEGateway` — per-runId `EventEmitter` with 5-second buffering, sticky `checkpoint:waiting` replay, 15 s heartbeat. |
| `__tests__/*` | — | Vitest unit tests. |

### 3.4 `client/features/ai-test-gen/`

| File | Lines | Role |
|---|---|---|
| `AiTestGenPage.tsx` | 282 | Top-level page; renders Config / Stepper / DetailPanel / History. |
| `TestGenConfigPanel.tsx` | — | Start form: requirements, flows, mode, provider, cache toggle. |
| `TestGenStepper.tsx` | — | Live graph view (LangGraph nodes + edges, animated on SSE). |
| `TestGenDetailPanel.tsx` | — | Right pane: per-node logs, thinking stream, checkpoint review/edit form. |
| `TestGenRunHistory.tsx` | — | Past runs list. |
| `__tests__/AiTestGenPage.test.tsx` | 135 | React Testing Library tests. |

### 3.5 `shared/contracts/`

`shared/contracts/index.ts` defines the **TypeScript** and **Zod** types that
flow across the boundary:

- `Requirement` (line 445)
- `BusinessFlow`, `BusinessFlowStep` (lines 460-474)
- `PipelineBusinessFlowBlueprint`, `PipelineBusinessFlowBlueprintStep`,
  `PipelineBusinessFlowBlueprintSchema` (lines 476-506)
- `TestCondition` (line 508)
- `NlTestCaseStep`, `NlTestCaseTestData`, `SelfReviewIssue`, `SelfReview`,
  `NlTestCaseChangeLog`, `NlTestCase` (lines 524-573)
- `CoverageRow`, `CoverageMatrix` (lines 575-589)
- `PipelineState` (line 591)

---

## 4. End-to-End Data Flow

The full lifecycle of a single "AI Test Gen" run:

```
                  ┌─────────────────┐
                  │ User (Browser)  │
                  └────────┬────────┘
                           │ 1. POST /api/test-gen/:projectId/start
                           │    { requirementIds, providerConfigName,
                           │      mode, flowIds?, includeFlowCases?,
                           │      useCache? }
                           ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Express Router — server/modules/ai-test-gen/index.ts:121   │
   │  - validateWithSchema(startPipelineSchema)                 │
   │  - pipelineRepo.createRun(runId, projectId, mode, config)  │
   │  - respond { runId } immediately, fire-and-forget           │
   │  - pipelineService.startPipeline(runId, projectId, params)  │
   └────────────────────────┬───────────────────────────────────┘
                            │ 2. startPipeline()
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ TestGenService.startPipeline (test-gen-service.ts:257)     │
   │  - acquire Semaphore (max 3)                               │
   │  - buildRequirementIndex(projectId)                        │
   │  - groupRequirementsByEpic() → N batches                   │
   │  - buildBusinessFlowBlueprints()                           │
   │  - createAIProviderWithFallback()                          │
   │  - createOrchestratedPipeline(provider, callbacks, opts)   │
   │  - new TestGenSession(...)                                  │
   │  - new BatchOrchestrator(session, ...)                     │
   │  - for each batch: session.startBatch()                    │
   └────────────────────────┬───────────────────────────────────┘
                            │ 3. session.startBatch(i, inputState)
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ TestGenSession.startBatch (test-gen-session.ts:143)        │
   │  - threadId = `${runId}-batch-${i}`                        │
   │  - pipeline.stream(input, { configurable: { thread_id }})  │
   │  - if interrupt → return InterruptInfo (CP1/2/3)           │
   │  - if end      → return BatchResult                        │
   └────────────────────────┬───────────────────────────────────┘
                            │ 4. LangGraph execution
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ StateGraph (6 nodes, 5 edges)                              │
   │  START → agent_test_analyst → checkpoint_1                  │
   │  → agent_test_designer → checkpoint_2                      │
   │  → agent_quality_manager → checkpoint_3 → END              │
   │                                                            │
   │  Each checkpoint uses LangGraph `interrupt<T>()`            │
   │  → SSE: checkpoint:waiting (resolvable payload)            │
   └────────────────────────┬───────────────────────────────────┘
                            │ 5. agent execution
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ createAgentNode (pipeline-nodes.ts:15)                     │
   │  - observer.onStart, observer.onStep(pre)                  │
   │  - runAgent(ctx, buildInput(state), {useReActLoop: true})  │
   │  - on complete: observer.onComplete, postSteps             │
   │  - return buildResult(raw)                                 │
   └────────────────────────┬───────────────────────────────────┘
                            │ 6. runAgent
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ runAgent (agent.ts:143)                                    │
   │  - prepareAgentRun (parse input, fill template, build msgs)│
   │  - if useReActLoop → runReactLoop(...)                     │
   │  - else single-shot (streamChat → JSON extract → repair →  │
   │    role.outputSchema.parse → cache)                        │
   │  - 3-attempt retry: 429 → 8 s, transient → 2/4/8 s,        │
   │    validation → 2/4/8 s + LLM nudge message                │
   └────────────────────────┬───────────────────────────────────┘
                            │ 7. ReAct loop (if enabled)
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ runReactLoop (react-loop.ts:34)                            │
   │  - max 15 iterations                                       │
   │  - per iter: provider.chat(msgs, { tools })                │
   │  - if tool calls:                                          │
   │     · 'load_skill' → registry.loadContent(name)            │
   │     · 'search_skills' → registry.search(query)             │
   │     · 'execute_skill_module' → registry.loadModule + fn    │
   │     · 'fetch_requirement_resource' → registry.loadResource│
   │     · other → ToolExecutor.executeTool(call)               │
   │  - if no tool calls → return response.content              │
   │  - cache key: { userInput, loadedSkills[] }                │
   └────────────────────────┬───────────────────────────────────┘
                            │ 8. SSE events
                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │ TestGenExecutionScope emits via SSEGateway                 │
   │  agent:start / agent:step / agent:thinking /               │
   │  agent:complete / agent:error / phase:start /              │
   │  batch:start / batch:complete / checkpoint:waiting /       │
   │  checkpoint:resolved / checkpoint:timeout /                │
   │  pipeline:context / pipeline:budget / pipeline:dedup /     │
   │  pipeline:complete / pipeline:error / heartbeat            │
   └────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │ Browser (SSE)   │
                  └─────────────────┘
```

---

## 5. LangGraph State Machine

### 5.1 State Annotation

`shared/ai-test-gen/test-generation.ts:17-39` defines the typed state:

```ts
const TestGenStateAnnotation = Annotation.Root({
  projectId: Annotation<string>,
  requirementIds: Annotation<string[]>,

  // current batch input
  currentBatch: Annotation<Requirement[]>,
  batchContext: Annotation<{ currentBatch, totalBatches, processedCount }>,
  projectContext: Annotation<{ name, pages[], endpoints[] }>,
  businessFlowBlueprints: Annotation<PipelineBusinessFlowBlueprint[] | undefined>,

  // agent outputs
  requirementAnalysis: Annotation<{ overallApproach, riskAssessmentSummary } | undefined>,
  testConditions: Annotation<TestCondition[] | undefined>,
  approvedConditions: Annotation<TestCondition[] | undefined>,

  draftTestCases: Annotation<NlTestCase[] | undefined>,
  approvedDraftCases: Annotation<NlTestCase[] | undefined>,
  humanReviewFeedback: Annotation<string>,

  finalTestCases: Annotation<NlTestCase[] | undefined>,
  coverageMatrix: Annotation<CoverageMatrix | undefined>,

  // control
  phase: Annotation<string>,
  errors: Annotation<{ phase, agent, step, message, rawResponse?, timestamp }[]>,
});
```

### 5.2 Node Graph

There are two equivalent ways to build the graph:

#### A. Low-level: `createTestGenerationPipeline`

`test-generation.ts:78-287`. Manually wires 6 nodes, 5 edges, 3
`addConditionalEdges` for routing back to agents on retry.

```text
START ──► agent_test_analyst ──► checkpoint_1 ─┬─► agent_test_designer
                                                └─► (retry) agent_test_analyst
              checkpoint_2 ─┬─► agent_quality_manager
                            └─► (retry) agent_test_designer
              checkpoint_3 ─┬─► END
                            └─► (retry) agent_quality_manager
```

#### B. High-level: `createOrchestratedPipeline`

`test-generation.ts:310-494`. Delegates to
`ToolOrchestrator.pipeline(config)` (`shared/ai/tool-orchestrator.ts:80-182`).
This is the **production path** used by `TestGenService`.

The configuration is a complete declarative specification of the
orchestrated graph: tool list, per-tool input/result builders, per-checkpoint
payload/resolve/retry/routing functions, log callbacks, and observer hooks.

The orchestrator then:

1. For each `toolName` in `tools: ['test_analyst', 'test_designer', 'quality_manager']`:
   - Calls `registry.resolve(toolName)` to get the `AgentTool`.
   - Wraps it via `createToolNode` (`pipeline-nodes.ts:57-111`).
   - If `enableCheckpoints: true`, adds `checkpoint_${i+1}` via
     `createCheckpointNode` (`pipeline-nodes.ts:113-131`).
   - Adds a conditional edge from the checkpoint using
     `buildCheckpointRouting[i+1]`.
2. Adds `START → agent_<first>`, and after the last checkpoint `→ END`.
3. Compiles with `graph.compile({ checkpointer })`.

### 5.3 Node Internals

`createAgentNode` (`pipeline-nodes.ts:15-55`) is the bridge from LangGraph to
the agent runtime. It:

1. Logs `ENTER` (custom `logEnter` callback).
2. Fires observer `onStart` and the pre-step `onStep`.
3. Calls `runAgent(ctx, buildInput(state), { useReActLoop, timeoutMs, useCache, signal, onStep, onThinking })`.
4. On error, fires observer `onError` and re-throws.
5. Logs `EXIT` and fires `onComplete` with token usage, latency, output data,
   and tool history.
6. Iterates `postSteps` firing `onStep` for each.
7. Returns the partial state produced by `buildResult(raw)`.

`createCheckpointNode` (`pipeline-nodes.ts:113-131`):

```ts
const response = interrupt<T>(buildPayload(state));
if (response?.retry) {
  logRetry?.();
  return onRetry(state, response);
}
logExit?.(state, response);
return onResolve(state, response);
```

This is the only place in the code that uses LangGraph's `interrupt<T>()`
import (`pipeline-nodes.ts:1`).

### 5.4 Phase Routing

Phase is the *only* state value used to decide the next node:

| Current `phase` | Origin | Next `phase` after approve | Next `phase` after retry |
|---|---|---|---|
| `analysis` | (set at start) | `review-conditions` | (loop) |
| `review-conditions` | checkpoint 1 | `design` | `analysis` |
| `design` | — | `review-draft` | (loop) |
| `review-draft` | checkpoint 2 | `quality` | `design` |
| `quality` | — | `final-review` | (loop) |
| `final-review` | checkpoint 3 | `complete` | `quality` |

The transition table is encoded in
`test-generation.ts:264-281` (low-level) and
`test-generation.ts:388-392` (orchestrated) — both produce the same
`buildCheckpointRouting` semantics.

`server/modules/ai-test-gen/application/phase-machine.ts:20-24` documents
the same table as a `PhaseMachine` class with `transition(phase, action)`,
`getCheckpointNumber(phase)`, etc. This class is used by
`buildResumeState` (`test-gen-session.ts:25-54`) to construct the
resume payload.

### 5.5 Edge Types

| Type | Source | Sink | Code |
|---|---|---|---|
| static | START | `agent_test_analyst` | `test-generation.ts:260` |
| static | `agent_test_analyst` | `checkpoint_1` | `test-generation.ts:261` |
| static | `agent_test_designer` | `checkpoint_2` | `test-generation.ts:262` |
| static | `agent_quality_manager` | `checkpoint_3` | `test-generation.ts:263` |
| conditional | `checkpoint_1` | analyst / designer | `test-generation.ts:264-269` |
| conditional | `checkpoint_2` | designer / quality | `test-generation.ts:270-275` |
| conditional | `checkpoint_3` | quality / END | `test-generation.ts:276-281` |

The `ToolOrchestrator` builds identical edges via
`graph.addNode / addEdge / addConditionalEdges` inside
`tool-orchestrator.ts:96-171`.

---

## 6. Agent Roles & I/O Schemas

Each role is a frozen `AgentRole` (`agent.ts:13-22`):

```ts
interface AgentRole {
  name: string;
  systemPromptTemplate: string;   // contains {{input}} and {{skills}}
  requiredSkills: string[];        // only used in non-progressive mode
  inputSchema: ZodType;            // gates input before LLM
  outputSchema: ZodType;           // gates output after LLM
  options?: ChatOptions;           // provider overrides (maxTokens, …)
  useProgressiveDisclosure?: boolean;
  allowedTools?: string[];         // ReAct tool whitelist
}
```

### 6.1 Test Analyst — `roles/test-analyst.ts`

**Input schema** (`BatchAnalystInputSchema`, line 5-28):

```ts
{
  requirements: Array<{
    id, title, description,
    level: 'epic' | 'feature' | 'story' | 'ac',
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    tags: string[],
    parentId?: string | null
  }>,
  batchContext: { currentBatch, totalBatches, processedCount },
  projectContext: { name, pages[], endpoints[] },
  businessFlowBlueprints?: PipelineBusinessFlowBlueprint[],
  previousConditions?: any[],
  humanFeedback?: string
}
```

**Output schema** (`AnalystOutputSchema`, line 30-48):

```ts
{
  requirementAnalysis: {
    overallApproach: string,
    riskAssessmentSummary: string,
  },
  testConditions: Array<{
    id, requirementId, requirementLevel,
    condition: string,
    category: 'happy-path' | 'alternate' | 'error' | 'boundary',
    riskLevel: 'high' | 'medium' | 'low',
    priority: 'critical' | 'high' | 'medium' | 'low',
    primaryTechnique: 1 of 5 ISTQB techniques,
    secondaryTechniques: string[],
    techniqueRationale: string,
    coverageDimensions: Array<{ dimension, variants[] }>,
  }>
}
```

**System prompt** (line 50-110) hard-codes:

- "Use the skills below for ISTQB rules and domain knowledge"
- A *deterministic-function-first* directive: agents are explicitly told to
  call `execute_skill_module('test-analyst', 'analyzeConditions', …)`,
  `inferRiskLevel`, `inferPriority`, `selectTechnique` before generating
  output. These functions are defined in
  `shared/ai/skills/test-analyst/index.ts:34-67`.
- HITL retry instructions: "For any test condition carried over from
  `previousConditions`, you MUST keep its original `id` unchanged."
- A technique constraint: `primaryTechnique` MUST be one of exactly
  `equivalence-partitioning | boundary-value-analysis | decision-table |
  state-transition | use-case`. The output schema is the validator.
- `useProgressiveDisclosure: true`, `allowedTools: ['search_skills',
  'load_skill', 'execute_skill_module', 'fetch_requirement_resource']`.

### 6.2 Test Designer — `roles/test-designer.ts`

**Input schema** (`DesignerInputSchema`, line 6-21): approved conditions +
project context + business flows + previous draft cases + human feedback.

**Output schema** (`DesignerOutputSchema`, defined inline in `designer.ts`):

```ts
{ draftTestCases: Array<DesignerCaseSchema> }
```

where `DesignerCaseSchema` extends `NlTestCaseSchema` with a mandatory
`selfReview: SelfReviewSchema` (`score`, `issues[]`, `pass`).

**System prompt** (line 23-61):

- ISTQB step format: preconditions → test data → steps(action+expected) →
  postconditions.
- Each step must have a unique sequential `sequence` number starting from 1.
- 5 ISTQB technique application patterns.
- 6-dimension self-review (atomicity, testability, coverage, repeatability,
  clarity, data-completeness) and the scoring rule "deduct 10 per blocker,
  5 per major, 2 per minor; `pass: false` if any blocker".
- HITL retry: preserve `id` of carried-over cases, generate new `id` for
  new cases.
- `useProgressiveDisclosure: true`, `allowedTools: ['load_skill',
  'execute_skill_module']`.

### 6.3 Quality Manager — `roles/quality-manager.ts`

**Input schema** (`QMInputSchema`, defined inline in `quality.ts`):
approved draft cases + human feedback + business flow blueprints.

**Output schema** (`QMOutputSchema`, defined inline in `quality.ts`):

```ts
{
  finalTestCases: Array<QmOutputCaseSchema>,
  coverageMatrix: CoverageMatrixSchema
}
```

`QmOutputCaseSchema` extends `NlTestCaseSchema` with required
`reviewSummary: string` and `changeLog: [{ source: 'agent-self-review' |
'human-review' | 'final-review', changes: string }]` — `changeLog` must be
non-empty (`quality-manager/SKILL.md:144-145` is explicit about this).

**Coverage matrix** (per requirement):
`totalConditions`, `testCaseCount`, `techniqueBreakdown`,
`categoryBreakdown`, `coveragePercentage`, `uncoveredRisks[]`.

**System prompt** (`quality-manager.ts:4-34`):

- 6-dimension review with severity → action mapping (Fix / Add / Remove /
  Note).
- Flow-aware review adds 3 extra dimensions (Flow coverage completeness,
  flow-specific atomicity, flow-specific data completeness).
- Human feedback: "every item must have a response" — never silently ignore.
- `useProgressiveDisclosure: true`, `allowedTools: ['load_skill',
  'execute_skill_module']`.

### 6.4 Skill→Role Mapping

| Skill | Used by analyst | Used by designer | Used by quality manager |
|---|---|---|---|
| `test-analyst` | ✅ | | |
| `test-designer` | | ✅ | |
| `quality-manager` | | | ✅ |
| `requirement-index` | ✅ | | |
| `requirement-query` | ✅ | | |
| `requirement-analysis` | ✅ | | |
| `flow-design` | ✅ | ✅ | ✅ |

(Each `requiredSkills` array is the *non-progressive* fallback list;
in progressive mode the list is informational only, since all metadata is
loaded into the system prompt at `agent.ts:42-49`.)

---

## 7. Skill System & Progressive Disclosure

### 7.1 Skill Layout

Every skill is a directory under `shared/ai/skills/<name>/`:

```
shared/ai/skills/<name>/
  SKILL.md                 # YAML frontmatter + markdown body
  index.ts                 # optional: deterministic functions
  references/              # optional: additional markdown / json
  resources/               # optional: per-resource JSON files
    manifest.ts            # optional: auto-generated index
```

Seven skills ship in the repo (file `shared/ai/skills/`):

| Directory | Frontmatter `description` | `module` | Has `index.ts` |
|---|---|---|---|
| `test-analyst` | "Use when generating atomic test conditions from requirements…" | `./index.ts` | ✅ (`analyzeConditions`, `inferRiskLevel`, `inferPriority`, `selectTechnique`, `createService`) |
| `test-designer` | "Use when designing detailed natural language test cases from approved test conditions." | `./index.ts` | ✅ |
| `quality-manager` | "Use when reviewing approved draft test cases for coverage gaps…" | `./index.ts` | ✅ |
| `requirement-index` | "Use when you need to find requirements by module/priority/tag/status…" | `./index.ts` | ✅ |
| `requirement-query` | "Use when you need to progressively load a subset of requirements by filter criteria…" | `./index.ts` | ✅ |
| `requirement-analysis` | "Use when evaluating requirements for completeness, testability, and consistency…" | `./index.ts` | ✅ |
| `flow-design` | "Use when designing end-to-end test cases that span multiple business process steps…" | `./index.ts` | ✅ |

The frontmatter is parsed by `SkillRegistry.parseFrontmatter`
(`skill-registry.ts:67-78`) using a small custom YAML reader
(`parseSimpleYaml`, line 16-39). The schema accepted:

```yaml
name: string
description: string
tags: string | string[]
module: string            # path to the index.ts relative to skill dir
allowedTools: string[]    # informational; runtime whitelist is in AgentRole
```

### 7.2 SkillRegistry

`shared/ai/skill-registry.ts` is the file-system-backed catalog. It is a
singleton instance (`globalSkillRegistry` at line 143) initialized at module
load (no async setup needed).

Public methods:

| Method | Line | Purpose |
|---|---|---|
| `initialize()` | 49 | Reads every `<skill>/SKILL.md`, parses frontmatter, populates `metadataCache`. Idempotent. |
| `search(query)` | 80 | Substring match on name / description / tags. |
| `getMetadata(name)` | 90 | Single skill metadata. |
| `loadContent(name)` | 94 | Read the full `SKILL.md` body. |
| `loadModule(name)` | 99 | `import()` the module file declared in frontmatter. |
| `listByTag(tag)` | 108 | Tag filter. |
| `getAllMetadata()` | 113 | All metadata — used to seed progressive disclosure. |
| `loadResource(skill, uri)` | 117 | URI-based resource lookup. |

`loadResource` requires URIs of the form
`resource://<skill>/<file>.json`, and resolves them via the
`requirement-index/resources/manifest.ts` registry (line 4). This manifest
is auto-generated by `scripts/split-requirement-index.mjs`.

### 7.3 Progressive Disclosure Mechanism

The key runtime switch is `role.useProgressiveDisclosure` (default `false`).
Set in `createAgentContext` (`agent.ts:34-67`):

```ts
if (useProgressiveDisclosure) {
  const allMetadata = globalSkillRegistry.getAllMetadata();
  skillContext = {
    systemPrompt: allMetadata.map(s => `- ${s.name}: ${s.description}`).join('\n'),
    referenceFiles: [],
    skillContents: {},
    cachedSkillContents: {},
  };
} else {
  skillContext = loadSkillContext(role.requiredSkills);
}
```

When progressive mode is on, the system prompt the LLM sees is **a list of
one-liners** — name + description of every skill — but no skill body. The
agent must call `load_skill` to retrieve a body. The non-progressive path
reads *all* `SKILL.md` files for `role.requiredSkills` plus their
`references/*` files eagerly.

All three production roles enable progressive disclosure:
- `test-analyst.ts:110`
- `test-designer.ts:61`
- `quality-manager.ts:34`

The agent's *system prompt template* is filled in `prepareAgentRun`
(`agent.ts:94-118`):

```ts
const filledPrompt = fillTemplate(role.systemPromptTemplate, {
  input: inputJson,
  skills: skillContext.systemPrompt,
});
```

In progressive mode, `{{skills}}` is replaced with the metadata index. In
non-progressive mode, it's replaced with the full concatenated SKILL.md
bodies (joined by `\n\n---\n\n`).

### 7.4 The ReAct Path vs. Single-Shot Path

`runAgent` (`agent.ts:143-352`) chooses one of two code paths based on
`options.useReActLoop`:

| | Single-shot (`useReActLoop: false`) | ReAct (`useReActLoop: true`) |
|---|---|---|
| **Function** | `provider.streamChat` then JSON-extract/repair/parse | `runReactLoop` (multi-iteration tool use) |
| **Caching** | `getCached(parsedInput, promptVersion, modelName)`; bypassed when `humanFeedback` is present | `getCached({ userInput, loadedSkills[] }, …)` |
| **Repair** | `extractJsonFromText` → `normalizeAgentOutput` → `repairAgentOutput` → `role.outputSchema.parse` | React loop returns string → `extractJsonFromText` → `outputSchema.parse` (no `repairAgentOutput` path) |
| **Retry** | 3 attempts, 2/4/8 s delay, distinguishing rate limit / transient / validation | Handled by ReAct loop's per-iteration max |
| **Used by** | `streamAgent` (legacy) and direct callers | `test-gen-service.ts:371` (`useReActLoop: true`) — **production** |

### 7.5 Per-Skill Deterministic Functions

Three skills ship executable `index.ts` modules that the LLM can call
through the ReAct loop via `execute_skill_module`:

#### `test-analyst` (`shared/ai/skills/test-analyst/index.ts:1-133`)

```ts
interface AnalystDeps { db?: { query }; toolRegistry?: any }

analyzeConditions(requirements, projectContext?) → TestCondition[]   // line 34
inferRiskLevel(req, inFlow)                                          // line 69
inferPriority(riskLevel, reqPriority?)                               // line 76
inferCategories(req) → ['happy-path', 'alternate', 'error', 'boundary']  // line 83
buildConditionText(req, category)                                    // line 91
selectTechnique(req, category)                                       // line 96
buildCoverageDimensions(req, category)                               // line 104
createService(deps) → { analyzeConditions }                          // line 114
```

The `createService` pattern lets the function read the `db` if a `db` dep is
provided. Without `db`, it works on the in-memory requirement list passed by
the caller. This is the recommended pattern for *optional* DB access in a
skill.

#### `requirement-index` & others

Each ships its own helper functions (e.g. `queryRequirements`,
`parseBlueprint`, `validateFlow`, `reviewCases`, `generateMatrix`).
The exact signatures live in the `index.ts` files.

---

## 8. ReAct Loop & Tool Orchestration

### 8.1 The Loop

`shared/ai/react-loop.ts:34-244` implements `runReactLoop`. The loop:

1. **Builds the system prompt** by appending an `Available skills:` index
   (the same as in progressive disclosure) — line 45-50.
2. **Initializes a `ReactLoopState`** with `messages: [system, user]`,
   `loadedSkills: Set<string>`, `iteration: 0`, `toolHistory: []`,
   `totalTokenUsage`.
3. **Cache check** — if `useCache !== false && promptVersion && modelName && !resumeState`,
   hash `{ userInput, loadedSkills[] }` and short-circuit on hit.
4. **Iterates** up to `maxIterations` (default 15). On each iteration:
   - Calls `provider.chat(messages, { tools, signal })`.
   - Accumulates token usage; aborts if `tokenLimit` is exceeded.
   - **If the model returned `toolCalls`**:
     - Pushes an `assistant` message with the calls.
     - For each call:
       - If `isSpecialTool(name)`:
         - `load_skill` → `registry.loadContent(name)`; pushes a `tool`
           message with the body; adds to `loadedSkills`.
         - `search_skills` → `registry.search(query)`; pushes a `tool`
           message with the JSON result.
         - `execute_skill_module` → `registry.loadModule(skill)`; if the
           module has `createService(deps)`, builds the service and calls
           the named function; otherwise calls the named export directly.
         - `fetch_requirement_resource` (declared in
           `tool.ts:212`) is handled by `AgentTool.createReActToolExecutor`,
           not the loop body — see § 8.3.
       - Otherwise: `toolExecutor.executeTool(call)` and record the result.
     - Loop continues.
   - **If no tool calls**: the model's final content is the result; cache
     it if enabled, return.
5. After the loop exits, if no result was produced, returns the last
   assistant content. (Defensive — should not happen in well-behaved runs.)

### 8.2 Tool Definitions for ReAct

`shared/ai/skill-tools.ts` declares four LLM-visible tools:

| Tool | Params | Description |
|---|---|---|
| `search_skills` | `{ query: string }` | Search by name/description/tags; returns `SkillMetadata[]`. |
| `load_skill` | `{ name: string }` | Load full `SKILL.md` body. |
| `execute_skill_module` | `{ skillName, functionName, args: string[] }` | Call a deterministic skill function. |
| `fetch_requirement_resource` | `{ uri: string }` | Load a per-epic JSON from `requirement-index/resources/`. |

`load_skill` and `search_skills` are processed inline by `runReactLoop`;
`execute_skill_module` is also processed inline (because it needs access to
the loop's `options.deps`); `fetch_requirement_resource` is *not* in the
inline branch — it goes through `ToolExecutor.executeTool` in
`AgentTool.createReActToolExecutor` (`tool.ts:184-215`).

### 8.3 AgentTool

`shared/ai/tool.ts:97-216` wraps an `AgentRole` as a `ToolDef`. This is the
abstraction that lets the role be plugged into the LangGraph `StateGraph`
as a node (via `createToolNode`).

Key methods:

- `name` — `role.name.replace(/-/g, '_')` so `test-analyst` becomes
  `test_analyst` (matches the node name in the graph).
- `description` — first non-empty, non-heading, non-code line of
  `systemPromptTemplate`, sliced to 200 chars. This is what other agents
  see in the `ToolRegistry.toOpenAIFunctions()` export.
- `inputSchema` / `outputSchema` — Zod-to-JSON-Schema converted.
- `execute(input, ctx)` — calls `createAgentContext` (lazily initialized
  via `globalSkillRegistry.initialize()`), then `runAgent`. Returns a
  discriminated-union `ToolResult` (`{ success: true, data, metadata }` or
  `{ success: false, error: { code, message, details } }`).
- `createReActToolExecutor` (line 184) — builds a `ToolExecutor` that
  filters the four skill tools by `role.allowedTools` and routes
  `fetch_requirement_resource` here (the loop's inline branch never sees
  it). The executor:
  - `executeTool(call)` — dispatch to the matching tool's `execute`.
  - `getAgentTools()` — return the filtered list in OpenAI-function form.
  - `isSpecialTool(name)` — list of `['search_skills', 'load_skill',
    'execute_skill_module', 'fetch_requirement_resource']`.



`createToolRegistry(provider, roles, opts)` in `test-generation.ts:289-308`
instantiates an `AgentTool` for each role and registers it. This is used
inside `createOrchestratedPipeline`.

---

## 9. LLM Provider Layer

### 9.1 AIProvider Interface

`shared/ai/provider.ts:56-59`:

```ts
interface AIProvider {
  chat(messages, options?): Promise<ChatResponse>;
  streamChat(messages, options?): AsyncGenerator<StreamChunk>;
}
```

`ChatResponse` (line 41-46) carries `content`, `reasoningContent?`,
`toolCalls?`, `usage?`. `StreamChunk` (line 48-54) is one of
`reasoning | content | done | error | tool_call_start | tool_call_end`.

### 9.2 Concrete Adapters

`createAIProvider(config)` (line 218-225) dispatches on `config.type`:

| Type | URL | Auth | Notes |
|---|---|---|---|
| `azure-openai` | `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}` | `api-key` header | Uses `max_completion_tokens` (Azure-specific param). |
| `nvidia-nim` | `${endpoint}/v1/chat/completions` | `Authorization: Bearer` | Uses `max_tokens`. |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer` | Uses `max_tokens`. |
| `openai` | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer` | Uses `max_tokens`. |

All four follow the **OpenAI Chat Completions schema**, so the request
serializer (`serializeMessages`, line 154-172) and response parser
(`parseChatResponse`, line 349-379) are shared.

### 9.3 Streaming

`streamChat` issues a non-streaming request with the body
`{ ..., stream: true, stream_options: { include_usage: true } }` and
parses the SSE stream with `readSSEStream` (line 381-433):

- Token-by-token `content` deltas → `type: 'content'`.
- `reasoning_content` deltas → `type: 'reasoning'` (used by reasoning models
  like o1).
- Tool-call deltas are accumulated by `id`; `tool_call_start` is emitted
  when a new id arrives, `tool_call_end` when the stream finalizes the
  call. Argument JSON is buffered incrementally and parsed at the end.
- Final `usage` block from `data.usage` is emitted as `type: 'done'`.

The loop's streaming counterpart (`streamReactLoop`,
`react-loop.ts:250-479`) reads these chunks and feeds them to
`onThinking(text)`.

### 9.4 Circuit Breaker & Fallbacks

`CircuitBreaker` (`provider.ts:104-143`):

- Opens after N consecutive failures (`failureThreshold: 5` default).
- Stays open for `resetTimeoutMs: 60_000` (default).
- `recordFailure()` returns `true` if it just opened.

`createAIProviderWithFallback` (line 292-309) wraps a primary provider with
a circuit breaker and up to N fallback providers. The chat path is:

```ts
tryProvider(primary, fallbacks, 0, cb, (p) => p.chat(messages, options))
```

`tryProvider` (line 311-335) checks `cb.try()`. If open, it advances to
the next fallback. On success, it `recordSuccess()`. On failure, it
`recordFailure()` and advances.

⚠️ **Note:** Only `chat` is wrapped with the breaker. `streamChat` always
goes through the primary (`provider.ts:305-306`). This is a design
choice — streaming fallbacks are out of scope.

### 9.5 Cache Invalidation by Prompt Version

`CacheStore.setCache` (cache.ts → repository) stores rows with
`prompt_version` and a 24-hour TTL. `invalidateByPromptVersion(pv)`
removes all rows for a version. This is how the system invalidates
cached results when prompts change.

The `promptVersion` is the 12-char SHA-256 prefix of all `SKILL.md` and
`references/*` files in the skills directory, computed by
`SkillCache.computeVersion` (`skill-cache.ts:52-70`). So changing any skill
file bumps the version and invalidates caches.

### 9.6 Token Limits

There are two layers:

1. **Provider fetch timeout** — `FETCH_TIMEOUT_MS = 600_000` (10 min,
   `provider.ts:347`). Every `chat` and `streamChat` is wrapped with
   `AbortSignal.timeout(FETCH_TIMEOUT_MS)` merged with the caller's
   signal (`mergeSignals`, `provider.ts:72-86`).
2. **Run-level token limit** — `providerConfigRow.monthly_token_limit`
   is read by `test-gen-service.ts:301-307` and pre-checked against
   `getMonthlyTokenUsage` (rejects the run if exceeded). The limit is
   also passed to each agent as `context.tokenLimit` and enforced inside
   the agent loop (`agent.ts:261-263`, `react-loop.ts:93-96`).

---

## 10. Server-Side Orchestration

### 10.1 TestGenService

`server/modules/ai-test-gen/application/test-gen-service.ts:30-766`. The
top-level orchestrator. State it carries:

```ts
class TestGenService {
  private readonly abortedRuns = new Set<string>();            // line 31
  private readonly abortControllers = new Map<string, AbortController>();  // line 32
  private readonly concurrencySlot: Semaphore;                  // line 33
  private readonly maxConcurrent: number;                      // line 34
  constructor(sseGateway, maxConcurrent = 3) {                 // line 36
    this.concurrencySlot = new Semaphore(maxConcurrent);
    useCacheStore(pipelineRepo.getCacheStore());
  }
}
```

`abortRun(runId)` (line 45-49) marks the run aborted, fires the
`AbortController`, and marks the DB row `FAILED`.

### 10.2 startPipeline

`startPipeline` (line 257-552) is the main entry point. Major stages:

1. **Acquire Semaphore** (line 274). The default cap is 3 simultaneous
   runs. This is a server-level global cap, not per-project.
2. **Create AbortController**, store it in `abortControllers` (line 277-279).
3. **Build the requirement index** for the project:
   `buildRequirementIndex(projectId)` (line 283). This is the server-side
   function in `server/modules/requirements/index-generator.ts` — it
   produces the same JSON layout that the `requirement-index` skill
   expects (see `requirement-index/SKILL.md`).
4. **Group requirements by epic** (`groupRequirementsByEpic`, line 285).
   Walks up the parent chain to the root epic for each selected
   requirement. The number of unique roots = number of batches.
5. **Load the active provider config** (line 292-296). If the request
   specified a `providerConfigName`, use that; otherwise the first
   `is_active = 1` row.
6. **Enforce monthly token limit** (line 301-307). Reject early if the
   configured `monthly_token_limit` is already reached.
7. **Build fallback configs** (line 309-310). Decrypts API keys of
   fallback provider rows via `buildFallbackConfigs` (`fallback-config-builder.ts`).
8. **Initialize provider** (line 322-330). Calls
   `createAIProviderWithFallback` with the decrypted primary config +
   fallbacks.
9. **Compute prompt version** (line 332). `computePromptVersion()` is a
   one-line wrapper over `skillCache.computeVersion()`.
10. **Persist provider info** on the run row (line 335-341) via
    `pipelineRepo.updateProviderInfo`.
11. **Create `TestGenExecutionScope`** (line 343-344). This is the façade
    for run state + persistence + SSE emission.
12. **Define `pipelineCallbacks`** (line 346-362). These wrap the
    `TestGenExecutionScope` methods, feeding the SSE stream and the
    persister.
13. **Define `agentOpts`** (line 364-372). `useReActLoop: true`,
    `timeoutMs: 300_000` (5 min per agent invocation), `useCache: false`
    by default (opt-in via request).
14. **Build the orchestrated pipeline factory** (line 374).
15. **Send preparation events** (line 390-403): `phase:start`,
    `pipeline:context` (flows + index size), `pipeline:budget`
    (estimated tokens vs. limit). A `preparation` row is also inserted
    into `test_gen_agent_logs` (line 405-420).
16. **Select resolver** based on mode (line 422-424). `auto` → `AutoResolver`
    (no-op). `interactive` → `InteractiveResolver` (emits SSE on
    interrupt).
17. **Create `TestGenSession`** (line 426-430).
18. **Branch on `includeFlowCases`** (line 435-529). If true, run a single
    batch of expanded flow requirements. Otherwise, build an
    `inputState` per epic and pass to `BatchOrchestrator.runAll`.
19. **After all batches**: deduplicate (`deduplicateTestCases`,
    `result-deduplicator.ts:7-26`) and call `scope.markComplete`
    (`test-gen-scope.ts:92-99`).
20. **`finally`**: release the semaphore, clean up abort state, close SSE
    unless the run is `WAITING_REVIEW` (line 544-551).

### 10.3 TestGenSession

`server/modules/ai-test-gen/application/test-gen-session.ts:77-268`. Owns
the lifecycle of a single compiled graph + checkpoint resume cycle.

- `startBatch(batchIndex, inputState)` (line 143-202): builds
  `threadId = ${runId}-batch-${batchIndex}`, calls `pipeline.stream`,
  reads `__interrupt__` from the last state chunk. If the run is
  `auto` mode, it builds the resume state from the interrupt payload via
  `buildResumeState` and re-invokes with `new Command({ resume: ... })`.
  In `interactive` mode, returns the interrupt to the caller.
- `resumeBatch(batchIndex, threadId, resolution)` (line 209-263): same
  shape as `startBatch` but uses the existing thread.
- `abort()` (line 265-267): set the aborted flag; `isAborted()` is
  checked between stream iterations.

`buildResumeState` (line 25-54) and `detectCheckpointNumber` (line 56-60)
encode the checkpoint → state-key mapping. The mapping is *separate* from
the orchestrator's `buildCheckpointResolve` because the session needs to
build a *generic* resume payload without knowing which mode of the graph
is active.

`detectCheckpointNumber` uses a key heuristic:
- payload has `conditions` → checkpoint 1
- payload has `matrix` → checkpoint 3
- otherwise → checkpoint 2 (draft cases)

### 10.4 BatchOrchestrator

`server/modules/ai-test-gen/application/batch-orchestrator.ts:22-101`.
Drives multi-batch runs. Its `runAll(batches)` (line 28-55) iterates
batches, calls `session.startBatch` for each, and aggregates results.
The orchestrator's options (`onBatchStart`, `onBatchComplete`,
`onBatchError`, `onBatchInterrupt`, `isAborted`) are how
`test-gen-service.ts` wires its persistence + SSE concerns.

A single `BatchInput` is shaped like:

```ts
interface BatchInput {
  batchIndex: number;
  inputState: {
    projectId, requirementIds, currentBatch: Requirement[],
    batchContext: { currentBatch, totalBatches, processedCount },
    projectContext: { name, pages, endpoints },
    businessFlowBlueprints: PipelineBusinessFlowBlueprint[],
    phase: 'analysis', errors: []
  }
}
```

### 10.5 Requirement Grouper

`server/modules/ai-test-gen/application/requirement-grouper.ts:15-40`.
Walks up to 20 levels of `parentId` for each selected requirement to find
its root epic. Returns:

```ts
{ epics: IndexEntry[], rootGroups: Map<rootId, childIds[]>, totalBatches, selectedIndex }
```

`totalBatches` equals `epics.length` — one batch per root epic.

### 10.6 Result Deduplicator

`server/modules/ai-test-gen/application/result-deduplicator.ts:7-26`.
Normalizes titles (lowercase, trim, collapse whitespace), groups identical
titles, and reports conflicts (same title but different step sequences).
Returns `{ allCases, conflicts, removedCount }`.

### 10.7 Checkpoint Resolvers

`checkpoint-resolver.ts:1-52`. Two implementations of the
`CheckpointResolver` interface:

- `AutoResolver` (line 19-27) — no-op (mode === 'auto' uses this; the
  session auto-resumes each interrupt with `action: 'approve'`).
- `InteractiveResolver` (line 29-51) — emits `checkpoint:waiting` over
  SSE with a friendly `summary` (e.g. "16 Test Conditions", "12 Draft
  Cases", "Final Review") derived from the payload.

### 10.8 Phase Machine

`server/modules/ai-test-gen/application/phase-machine.ts:1-82`. Pure
state machine for the 7 phases. Although the LangGraph orchestrator has
its own routing logic, the phase machine is the canonical reference used
in tests, audit-log snapshots, and the session's `buildResumeState` /
`detectPhase` helpers.

### 10.9 TestGenExecutionScope

`server/modules/ai-test-gen/test-gen-scope.ts:18-109`. Façade for
event/persistence/state coordination. Its API:

- `setBatch(batch, total)` / `restoreBatchState(batch)`
- `recordAgentStart(name, batch, inputPrompt)` — persists the
  `RUNNING` agent log row + emits `agent:start`.
- `recordAgentComplete(name, batch, params)` — finalizes the log row +
  emits `agent:complete` with token usage, latency, and an
  output-summary string derived from `outputData.testConditions.length`
  / `draftTestCases.length` / `finalTestCases.length`.
- `recordAgentError(name, batch, error)` — marks log `FAILED` + emits
  `agent:error`.
- `recordAgentStep(name, batch, idx, name)` — appends to `rawTrace`.
- `recordAgentThinking(name, text)` — emits `agent:thinking`.
- `recordCheckpointResolved(cpNum, action)` — audit log + emits
  `checkpoint:resolved`.
- `markComplete({ totalCases, totalBatches })` — updates DB status to
  `COMPLETED` + emits `pipeline:complete`.
- `markFailed(error)` — updates DB status to `FAILED` + emits
  `pipeline:error`.

### 10.10 TestGenRunState

`server/modules/ai-test-gen/test-gen-run-state.ts:27-124`. In-memory
state used inside the scope:

- `Map<agentName:batch, AgentRunSnapshot>`
- `totalPromptTokens / totalCompletionTokens / totalReasoningTokens`
- `totalLatencyMs`
- `currentBatch`

The `getUsage()` method (line 116-123) returns the aggregated token usage
in the shape persisted into `test_gen_runs.token_usage`.

---

## 11. Checkpoint / Human-in-the-Loop

### 11.1 The Interrupt Mechanism

`@langchain/langgraph`'s `interrupt<T>()` (imported in
`pipeline-nodes.ts:1`) is the only way the graph yields control. The
`createCheckpointNode` function (`pipeline-nodes.ts:113-131`) wraps it:

```ts
return async (state: any) => {
  logEnter?.(state);
  const response = interrupt<T>(buildPayload(state));
  if (response?.retry) {
    logRetry?.();
    return onRetry(state, response);
  }
  logExit?.(state, response);
  return onResolve(state, response);
};
```

`interrupt<T>` throws a special exception that the LangGraph runtime
catches; the graph is suspended; the `stream` iterator yields the last
state chunk with `__interrupt__: [{ value: T, … }]` attached.

### 11.2 Checkpoint Payloads

The `buildPayload(state)` functions are:

| Checkpoint | Payload | Where |
|---|---|---|
| 1 | `{ conditions: state.testConditions, analysis: state.requirementAnalysis }` | `test-generation.ts:133` |
| 2 | `{ cases: state.draftTestCases }` | `test-generation.ts:187` |
| 3 | `{ cases: state.finalTestCases, matrix: state.coverageMatrix }` | `test-generation.ts:237` |

### 11.3 Checkpoint Response

The response is a JSON object with optional `retry` flag and
checkpoint-specific fields:

```ts
interface Checkpoint1Response { conditions?, analysis?, feedback?, retry? }
interface Checkpoint2Response { cases?, feedback?, retry? }
interface Checkpoint3Response { cases?, matrix?, feedback?, retry? }
```

The session converts this to a LangGraph `Command({ resume: payload })`
(`test-gen-session.ts:161, 225`).

### 11.4 Persistence

The `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite`
(`test-gen-service.ts:1, 235, 245`) writes the graph state to a
`checkpoints` table in the project's SQLite DB on every graph step. This
means:

- A process crash mid-batch leaves the graph in a recoverable state.
- A resume after restart uses the same `threadId` and replays from the
  last persisted checkpoint.
- `recoverInterruptedRuns()` (`test-gen-service.ts:179-207`) is called
  on server startup: it finds every `WAITING_REVIEW` run and re-emits
  the `checkpoint:waiting` SSE event so the browser can resume.

### 11.5 The 30-Minute Auto-Abandon

`startCheckpointTimeoutMonitor(intervalMs = 60_000)`
(`test-gen-service.ts:209-227`) polls every minute for runs that have
been `WAITING_REVIEW` for more than 30 minutes and aborts them with a
`checkpoint:timeout` SSE event. This prevents zombie runs from
monopolizing a slot in the semaphore.

### 11.6 Edit Workflow

The `POST /:runId/checkpoint-update` route (`index.ts:78-82`) lets a human
*edit* the data *before* approving. The flow:

1. User edits JSON in the checkpoint UI.
2. Frontend calls `saveCheckpointEdits(runId, editedData, cpNum)`.
3. Service maps the payload keys to graph state keys (line 67-75).
4. `applyStateUpdate` (line 103-114) uses a `dummyProvider` to
   instantiate a graph *just* to call `graph.updateState({thread_id},
   stateKeys)`. This is the LangGraph-native way to merge keys into
   persisted state.
5. The `agent_log` row is also updated with the edits
   (`pipelineRepo.updateAgentLogOutput`).
6. The SSE gateway emits a fresh `checkpoint:waiting` with the new
   payload so the UI re-fetches.

Then when the user clicks **Approve**, the service is called with the
*edited* payload. In `auto` mode the edit is irrelevant; in
`interactive` mode the human can rewrite cases before they're persisted.

---

## 12. Database Schema

The migration is `server/migrations/013_ai_test_gen_schema.ts`. It creates
8 tables.

### 12.1 `test_gen_runs`

```sql
id                    TEXT PRIMARY KEY
project_id            TEXT NOT NULL DEFAULT ''
status                TEXT NOT NULL DEFAULT 'RUNNING'    -- RUNNING | WAITING_REVIEW | COMPLETED | FAILED
phase                 TEXT NOT NULL DEFAULT 'init'
state                 TEXT                              -- (reserved; unused by code)
current_batch         INTEGER NOT NULL DEFAULT 0
total_batches         INTEGER NOT NULL DEFAULT 0
mode                  TEXT DEFAULT 'draft'              -- 'auto' | 'interactive'
provider_config_name  TEXT
provider_type         TEXT
model_name            TEXT
prompt_version        TEXT
created_by            TEXT
approved_by           TEXT DEFAULT '[]'
token_usage           TEXT DEFAULT '{}'                 -- JSON: {prompt_tokens, completion_tokens, reasoning_tokens, total_tokens}
token_limit           INTEGER
error_count           INTEGER NOT NULL DEFAULT 0
config                TEXT                              -- JSON of the start request
checkpoint_data       TEXT                              -- (reserved)
created_at            TEXT NOT NULL DEFAULT (datetime('now'))
updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
```

Note: the schema has a few unused columns (`state`, `checkpoint_data`,
`error_count`, `approved_by`) that are reserved for future use. Current
code reads and writes the *used* subset.

### 12.2 `test_gen_coverages`

Stores the coverage matrix produced by the Quality Manager:

```sql
id                    TEXT PRIMARY KEY
test_gen_run_id       TEXT NOT NULL
requirement_id        TEXT NOT NULL
requirement_title     TEXT NOT NULL
level                 TEXT NOT NULL
total_conditions      INTEGER NOT NULL DEFAULT 0
test_case_count       INTEGER NOT NULL DEFAULT 0
technique_breakdown   TEXT NOT NULL DEFAULT '{}'
category_breakdown    TEXT NOT NULL DEFAULT '{}'
coverage_percentage   REAL NOT NULL DEFAULT 0
uncovered_risks       TEXT NOT NULL DEFAULT '[]'
```

(Code reference: not currently written by the orchestrator, but the
schema and the `QualityManager` output match this shape — to be wired in
future.)

### 12.3 `test_gen_agent_logs`

Per-agent execution log:

```sql
id                    TEXT PRIMARY KEY
run_id                TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE
batch                 INTEGER NOT NULL
agent_name            TEXT NOT NULL
phase                 TEXT NOT NULL
input_prompt          TEXT                              -- JSON: ChatMessage[]
output_data           TEXT                              -- JSON: agent output
token_usage           TEXT                              -- JSON: {input, output, reasoning}
latency_ms            INTEGER
raw_trace             TEXT                              -- JSON: TraceEntry[]
status                TEXT NOT NULL DEFAULT 'RUNNING'  -- RUNNING | COMPLETED | FAILED
created_at            TEXT NOT NULL DEFAULT (datetime('now'))
```

### 12.4 `test_gen_audit_log`

HITL audit trail:

```sql
id                    TEXT PRIMARY KEY
run_id                TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE
checkpoint_id         TEXT NOT NULL   -- e.g. 'review-conditions'
action                TEXT NOT NULL   -- 'approve' | 'retry' | 'checkpoint-update'
user_id               TEXT NOT NULL
snapshot              TEXT            -- JSON: edited data
created_at            TEXT NOT NULL DEFAULT (datetime('now'))
```

### 12.5 `test_conditions`

Persistent store of the test conditions produced by the analyst. (Schema
is created but the orchestrator currently keeps conditions in
`test_gen_agent_logs.output_data` and the graph state, not here.)

### 12.6 `natural_language_test_cases`

Persistent store of the final test cases. The
`POST /:runId/save-cases` endpoint (`index.ts:85-106`) writes here when
the user clicks "Save Cases".

### 12.7 `provider_configs`

AI provider configurations:

```sql
id                    TEXT PRIMARY KEY
project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
name                  TEXT NOT NULL
type                  TEXT NOT NULL  -- 'azure-openai' | 'nvidia-nim' | 'openrouter' | 'openai'
endpoint              TEXT
encrypted_api_key     TEXT NOT NULL  -- (encrypted at rest)
deployment            TEXT
api_version           TEXT
model                 TEXT
fallback_config_ids   TEXT DEFAULT '[]'  -- JSON array of provider id strings
monthly_token_limit   INTEGER
is_active             BOOLEAN NOT NULL DEFAULT 1
created_at            TEXT NOT NULL DEFAULT (datetime('now'))
```

### 12.8 `agent_cache`

LLM response cache:

```sql
cache_key             TEXT PRIMARY KEY
input_hash            TEXT NOT NULL
prompt_version        TEXT NOT NULL
model                 TEXT NOT NULL
output                TEXT NOT NULL   -- JSON.stringify(validated output)
created_at            TEXT NOT NULL DEFAULT (datetime('now'))
expires_at            TEXT NOT NULL   -- = created_at + 24h
```

The cache key is `agent:cache:<sha256(input+prompt_version+model)>`. Reads
filter by `expires_at > now` (`test-gen-repository.ts:45-47`).

---

## 13. REST API

Base path: `/api/test-gen` (declared in `index.ts:157`).

| Method | Path | Body / Query | Handler | Description |
|---|---|---|---|---|
| GET | `/runs/:projectId` | — | `listRunsByProject` | List last 50 runs for a project. |
| GET | `/active/:projectId` | — | `getActiveRun` | Most recent `RUNNING` or `WAITING_REVIEW` run. |
| GET | `/:runId/logs` | `?agent=…` | `getAgentLogs` | Agent logs (filtered by agent name). |
| GET | `/:runId` | — | `getRun` + `getRunInfo` | Run summary + full info. |
| GET | `/:runId/info` | — | `getRunInfo` | Full run row. |
| DELETE | `/:runId` | — | `deleteRun` | Cascade-deletes run, logs, audit. |
| POST | `/:runId/abort` | — | `abortRun` | Abort the run. |
| POST | `/:runId/resume` | `{ action, feedback?, editedData? }` | `resumeRun` | Approve or retry a checkpoint. |
| POST | `/:runId/checkpoint-update` | `{ editedData, checkpointNumber }` | `saveCheckpointEdits` | Persist user edits before approval. |
| POST | `/:runId/save-cases` | — | `saveCasesToNlCases` | Export final cases to `natural_language_test_cases`. |
| GET | `/:runId/audit` | — | `getAuditLogs` | HITL audit log. |
| GET | `/:runId/checkpoint-state` | — | `getCheckpointState` | Snapshot of current checkpoint payload. |
| POST | `/:projectId/start` | `{ requirementIds, providerConfigName, mode, flowIds?, name?, includeFlowCases?, useCache? }` | `startPipeline` | Start a new run. |
| GET | `/:runId/stream` | — | `sseGateway.attachStream` | SSE event stream. |

Schemas (`schema.ts`):

```ts
startPipelineSchema = {
  requirementIds: string[] (min 1),
  providerConfigName: string (min 1),
  mode: 'auto' | 'interactive' (default 'auto'),
  flowIds?: string[],
  name?: string,
  includeFlowCases?: boolean (default false),
  useCache?: boolean (default false),
}
resumePipelineSchema = {
  action: 'approve' | 'retry',
  feedback?: string,
  editedData?: any,
}
checkpointUpdateSchema = {
  editedData: Record<string, unknown>,
  checkpointNumber: number (1-3),
}
```

All bodies are validated with `validateWithSchema(res, req.body)` from
`server/shared/validation/validate.ts`. The router wraps handlers with
`withErrorHandling` from `server/shared/http/async-handler.ts` to
centralize error responses.

### 13.1 Recovery on Startup

`recoverInterruptedTestGenRuns()` (`index.ts:152-155`) is exported and
called by the app bootstrapper. It:

1. Invokes `pipelineService.recoverInterruptedRuns()` which finds every
   `WAITING_REVIEW` row and re-emits `checkpoint:waiting`.
2. Starts the periodic timeout monitor.

---

## 14. Server-Sent Events (SSE) Protocol

### 14.1 Transport

`SSEGateway` (`infrastructure/sse/sse-gateway.ts:11-127`) is a per-runId
event broker. The stream itself is plain `text/event-stream` with a
15-second heartbeat.

It maintains:

- `emitters: Map<runId, EventEmitter>` — the actual fan-out.
- `streams: Map<runId, SseStream>` — active HTTP responses + their
  heartbeat timers.
- `eventBuffers: Map<runId, [{ event, data }]>` — events emitted before
  the client subscribed.
- `bufferTimers: Map<runId, Timeout>` — 5-minute TTL to GC unused buffers.
- `lastEvents: Map<runId, { event, data }>` — sticky `checkpoint:waiting`
  for reconnect replay.

### 14.2 Behavior

1. **`emit(runId, event, data)`** (line 28-48) — if `event ===
   'checkpoint:waiting'`, store as the sticky `lastEvents[runId]`. If
   `event === 'pipeline:complete' | 'pipeline:error'`, clear the sticky
   event. If there's at least one attached stream, emit through it.
   Otherwise, buffer the event (capped at 5 min via `bufferTimers`).
2. **`attachStream(runId, res)`** (line 50-108) — sets standard SSE
   headers, listens for `res.on('close')` to clean up, replays any
   buffered events for the run, and writes the sticky `lastEvents` entry
   if any. Heartbeat every 15s.
3. **`cleanup(runId)`** (line 110-126) — ends the HTTP response, clears
   the heartbeat, schedules a 5-min buffer TTL (to support clients
   reconnecting after a network blip).

### 14.3 Event Catalog

| Event | Where emitted | Payload (shape) |
|---|---|---|
| `agent:start` | `scope.recordAgentStart` | `{ agentName, batch, timestamp }` |
| `agent:step` | `scope.recordAgentStep` | `{ agentName, stepIndex, stepName, timestamp }` |
| `agent:thinking` | `scope.recordAgentThinking` | `{ agentName, text, timestamp }` |
| `agent:complete` | `scope.recordAgentComplete` | `{ agentName, batch, outputCount, outputSummary, outputLabel, tokenUsage, latencyMs, timestamp }` |
| `agent:error` | `scope.recordAgentError` | `{ agentName, batch, message, timestamp }` |
| `batch:start` | `scope.setBatch` | `{ batch, total, timestamp }` |
| `batch:complete` | `test-gen-service.ts:483, 495, 740` | `{ batch, total, testCases }` |
| `phase:start` | `test-gen-service.ts:390, 460` | `{ phase, message }` |
| `pipeline:context` | `test-gen-service.ts:391` | `{ flows, indexEntries }` |
| `pipeline:budget` | `test-gen-service.ts:400, 402` | `{ estimated, limit, warning, message }` |
| `pipeline:dedup` | `test-gen-service.ts:534, 667` | `{ removed, remaining, conflicts? }` |
| `checkpoint:waiting` | `InteractiveResolver.onInterrupt` and `recoverInterruptedRuns` | `{ checkpointId, checkpointNumber, type, summary, payload, recovered? }` |
| `checkpoint:resolved` | `test-gen-service.ts:158, 639` | `{ checkpointNumber, action }` |
| `checkpoint:timeout` | `test-gen-service.ts:220-223` | `{ checkpointId, message }` |
| `checkpoint:auto-resolved` | `test-gen-session.ts:181, 241` | `{ checkpointNumber, action, timestamp }` |
| `pipeline:complete` | `scope.markComplete` | `{ summary, stats: { totalCases, totalBatches, totalTokens, totalLatencyMs } }` |
| `pipeline:error` | `scope.markFailed`, `test-gen-service.ts:314, 498, 542, 668` | `{ phase, message, recoverable?, batch? }` |
| `heartbeat` | `sse-gateway.ts:103` | `{ ts }` |

### 14.4 Reconnect Semantics

If a browser reconnects after a network drop, the gateway:

1. Replays all events buffered since the start of the run (or since the
   last 5-minute boundary, whichever is more recent).
2. If the last sticky event was `checkpoint:waiting`, replays it on
   reconnect so the UI can re-render the review form.
3. The `complete` / `error` sticky events are *not* stored (they're
   terminal — replay would be misleading).

---

## 15. Frontend Architecture

### 15.1 Page Composition

`client/features/ai-test-gen/AiTestGenPage.tsx:17-282` is the entry. It
maintains a small amount of local UI state:

- `view: 'config' | 'history'` (which view to render).
- `showAbortConfirm`, `showRetryConfirm` (modal visibility).
- `reviewMode: boolean` (whether the user is in edit mode at a
  checkpoint).
- `checkpointEditedData: useRef<any>` (the in-flight edits).

It uses a `useTestGenRun(currentProjectId)` hook (provided by
`@/shared/test-gen-run`) for the long-lived run state. That hook
encapsulates:

- The reducer for `runId`, `isRunning`, `nodes`, `selectedNodeId`,
  `checkpointData`, `agentLogs`, `thinkingText`, `runSummary`, `error`.
- The `start / resume / abort / refresh / loadRun` actions.
- The SSE connection lifecycle (`createFetchSSEConnection`).

### 15.2 Sub-panels

| Component | Role |
|---|---|
| `TestGenConfigPanel` | Renders a form: requirement multi-select, business-flow multi-select, mode toggle, provider dropdown, cache toggle, Start button. |
| `TestGenStepper` | Live graph: 6 nodes (3 agents + 3 checkpoints) wired with the static edges. Active node pulses; failed nodes turn red. |
| `TestGenDetailPanel` | Right pane. Renders the selected node's: agent log (input prompt, output data, latency, token usage), live thinking text, or the checkpoint review form. |
| `TestGenRunHistory` | List of past runs. Each row links to `loadRun(runId)`. |

### 15.3 Edit-Approve-Retry Loop

In interactive mode:

1. SSE delivers `checkpoint:waiting` with `payload`.
2. `TestGenDetailPanel` renders a JSON editor.
3. User clicks **Toggle Review** → `setReviewMode(true)`.
4. User edits JSON → `onCheckpointDataChange(data)` → stored in
   `checkpointEditedData.current`.
5. User clicks **Done Reviewing** →
   `api.testGen.saveCheckpointEdits(runId, data, cpNum)` →
   `pipeline.refreshCheckpointData()` (re-fetches the checkpoint
   payload so the UI updates with the merged state).
6. User clicks **Approve** → `pipeline.resume('approve', { editedData })`.
7. The server applies the edits via `updateState` and resumes the
   graph.

For **Retry** the user clicks Retry → `pipeline.resume('retry')` (no
payload). The server sends `{ retry: true }` to the interrupt, and the
graph re-runs the agent that produced the checkpoint.

### 15.4 Auto-Follow Mode

`pipeline.autoFollowEnabled: boolean`. When `true`, every
`onThinking` / `agent:step` / `agent:complete` SSE event auto-selects the
newest node in the stepper. The user can click any node to override
(set `autoFollowEnabled: false`). Clicking the X on the detail panel
re-enables auto-follow (`AiTestGenPage.tsx:78-82`).

---

## 16. Quality, Repair & Guardrails

### 16.1 JSON Extraction (`agent.ts:489-503`)

`extractJsonFromText` tries in order:

1. Triple-backtick code block (```json ... ```).
2. Outer `{...}` brace match.
3. Outer `[...]` bracket match.

If all fail, the LLM response is rejected with `"No JSON object found in
LLM response"`.

### 16.2 Output Normalization (`agent.ts:508-548`)

LLMs sometimes wrap their output in a single root key like
`{ "testConditions": [...] }` or even return a bare array. The normalizer
detects top-level array shapes (conditionId / condition / requirementId →
testConditions, steps / testData → draftTestCases, changeLog /
reviewSummary → finalTestCases) and rewraps. This is critical because
the strict Zod schema validation rejects the bare shapes.

### 16.3 Output Repair (`agent.ts:649-659`, `repairTestCase` 635-647,
`repairSelfReview` 615-633)

After normalization, the *enum-heavy* fields are coerced:

| Field | Repair strategy |
|---|---|
| `selfReview.issues[].category` | Pattern match (`atomic|granular|single` → `atomicity`, `cover|gap|missing` → `coverage`, etc.). Fallback: `clarity`. |
| `selfReview.issues[].severity` | If string not in `['blocker','major','minor']` → `minor`. |
| `selfReview.issues[].suggestion` | If empty/missing → `'Refine the test case to address this concern'`. |
| `priority` | Pattern match (`low|minor|p3` → `low`; `high|imp` → `high`; `crit|block|p0|p1` → `critical`). Fallback: `medium`. |
| `category` (test case) | Pattern match (`happy|positive|main` → `happy-path`; `alt|second` → `alternate`; `err|fail|invalid` → `error`; `bound|edge|limit` → `boundary`). Fallback: `happy-path`. |
| `id` (test case) | Empty string → `tc-${Date.now()}-${rand}`. |
| `conditionId` / `requirementId` | Empty → `''`. |
| `techniqueApplied` | Empty → `'use-case'`. |
| `selfReview.score` | Clamp to [0, 1]; non-numeric → 0.8. |
| `selfReview.pass` | If not boolean → derived from `issues.length === 0`. |

This is the *first* defense against validation failures. The second
defense is the retry mechanism (see § 16.6).

### 16.4 Prompt-Injection Guard (`guard.ts:1-24`)

`inspectUserInput(input)` scans the serialized user input (which
includes the requirements, conditions, and human feedback) for six
patterns:

- `ignore (all )?(previous|above|prior) (instructions|prompts|directions|messages)`
- `you (are|must|will) (now|free) (to )?ignore`
- `system (prompt|message|instruction)`
- `forget (all )?(previous|above|prior)`
- `output (your )?(system )?prompt`
- `do (not|never) (follow|obey) (previous|above|prior) (instructions|rules)`

If any match, the input is *flagged* (logged) but **not blocked** — the
guard is observational only (`agent.ts:103-106`). This is intentionally
permissive; the deterministic repair layer and schema validation catch
the actual damage.

### 16.5 Token Limit Checks

Two layers, both throw `Error("Token limit exceeded (X > Y). Run aborted.")`:

- Inside `runAgent` for single-shot path (`agent.ts:261-263`).
- Inside `runReactLoop` for tool-using path (`react-loop.ts:93-96`).

`TokenTracker` (`token-tracker.ts:14-33`) accumulates per-call usage
with optional cost estimation. The `context.tokenLimit` value comes
from the active provider config's `monthly_token_limit`.

### 16.6 Retry Strategy (`agent.ts:212-349`)

The agent's single-shot path retries up to 3 attempts (`RETRY_DELAYS =
[2000, 4000, 8000]`, `agent.ts:81`) with per-error-type handling:

| Error type | Detected by | Action |
|---|---|---|
| `AgentAbortError` | `options.signal.aborted` | Throw immediately. |
| Timeout | `err.name === 'TimeoutError'` etc. | Throw `AgentTimeoutError`. |
| 429 / rate limit | `err.message.includes('429')` or `rate limit` | Wait `RETRY_DELAYS[i] * 2` (4-16s), retry. |
| Transient network | `fetch failed`, `ECONNRESET`, `socket hang up`, `network` | Wait `RETRY_DELAYS[i]` (2-8s), retry. |
| Validation error | `SyntaxError`, `ZodError`, `Invalid input` | Wait, append nudge message to history, retry. |
| Other | — | Throw (non-retryable). |

The validation retry *appends* two messages to the chat history before
the next attempt:

```
assistant: '(previous response failed validation)'
user:      'Your previous response was invalid: <summary>. Re-read the
            system prompt above which describes the required output
            fields and their structure. Output the COMPLETE JSON object
            with ALL required fields — never omit any field.'
```

This nudges the LLM to try again with the schema in mind.

The retry summary is rendered human-readable by `summarizeError`
(`agent.ts:422-437`): for Zod errors, it shows up to 5 issues with their
`path`, `expected`, `received`; for other errors, it shows the first
500 chars of the message.

---

## 17. Persistence, Caching & Versioning

### 17.1 Caching

Two cache layers, both keyed on `input + prompt_version + model`:

#### Agent cache (`shared/ai/cache.ts`)

- Stored in `agent_cache` table with 24h TTL.
- `getCached(input, promptVersion, model)` returns `JSON.parse(row.output)`.
- `setCache(input, promptVersion, model, output)` inserts with `expires_at
  = now + 24h`.
- `invalidateCache(promptVersion?)` removes by version (used when prompts
  change) or all rows.

#### ReAct cache (`shared/ai/react-loop.ts:73-77`)

The ReAct path uses a slightly different key —
`{ userInput: string, loadedSkills: string[] (sorted) }` — so two runs
that load the same set of skills in the same order hit the same cache
entry. This is essential for progressive disclosure: if the LLM loaded
`test-analyst` and `requirement-index` in run 1, the same `load_skill`
sequence in run 2 yields the same result.

#### Bypass when `humanFeedback` is present (`agent.ts:198-200`)

```ts
const hasFeedback = parsedInput && 'humanFeedback' in parsedInput && !!(parsedInput as any).humanFeedback;
const useCache = hasFeedback ? false : (options.useCache ?? true);
```

This prevents stale cache hits when the user is *refining* a result.

### 17.2 Prompt Version

`SkillCache.computeVersion` (`skill-cache.ts:52-70`) walks every skill
directory (sorted), reads `SKILL.md` + every `references/*`, and
SHA-256-hashes them. Result is the first 12 hex chars. This string is:

- Stored on every `test_gen_runs` row as `prompt_version` (so
  `prompt_version` IS the cache invalidation key).
- Used in `getCached` / `setCache` for both the agent and ReAct caches.
- Surfaced in the UI for debuggability (the runs list shows it).

### 17.3 Persister Pattern

`TestGenPersister` (`test-gen-persister.ts:11-61`) is the writer for
`test_gen_agent_logs` rows. It uses `INSERT … ON CONFLICT(id) DO UPDATE`
so that re-saving the same `logId` (because a run resumes) merges
fields without losing previous data. The merging rules:

- `input_prompt`, `output_data`, `token_usage`, `latency_ms`, `raw_trace`,
  `error_message`, `error_raw_response`, `tool_history`: COALESCE — keep
  the existing value if the new one is null.
- `status`: always replaced with the new value.

This is the *only* database writer in the agent lifecycle; everything
else is in-memory and is persisted when the agent completes (or
errors).

### 17.4 Pipeline State Persistence

The graph itself persists via `SqliteSaver`
(`@langchain/langgraph-checkpoint-sqlite`). Every node transition writes
to a `checkpoints` table. The `thread_id` (per-batch, e.g. `${runId}-batch-0`)
is the partition key. On resume, the graph loads the latest snapshot for
the thread and continues.

---

## 18. Observability, Limits & Failure Modes

### 18.1 Logging Conventions

The code uses a uniform `[scope:tag]` prefix scheme:

- `[agent] ${role.name}: …` — `agent.ts`
- `[provider:${name}] …` — `provider.ts` (one of `azure | nvidia |
  openrouter | openai`).
- `[test-gen:graph] …` — `test-generation.ts` (graph build, edges,
  routing).
- `[react-loop]` (no prefix in `react-loop.ts`).
- `[test-gen:graph] [agent_test_analyst] ENTER/EXIT …` — per-node entry
  and exit.
- `[TestGenService] …` — `test-gen-service.ts`.
- `[guard] Input flagged for agent "${role.name}": …` — when injection
  patterns are detected.

This makes it possible to grep logs and trace a single run:

```bash
grep "ai-pl-abc" logs/server.log
```

### 18.2 Limits

| Limit | Default | Where |
|---|---|---|
| Server-side concurrent runs | 3 | `TestGenService` constructor |
| Per-agent LLM timeout | 300,000 ms (5 min) | `test-gen-service.ts:368, 613` |
| ReAct max iterations | 15 | `react-loop.ts:43` |
| Fetch timeout | 600,000 ms (10 min) | `provider.ts:347` |
| Checkpoint wait timeout | 30 min | `test-gen-service.ts:213` |
| Cache TTL | 24 h | `test-gen-repository.ts:51` |
| Run history limit (per project) | 50 | `test-gen-repository.ts:87` |
| Max parent walk depth (req grouper) | 20 | `requirement-grouper.ts:21` |
| SSE heartbeat | 15 s | `sse-gateway.ts:4` |
| Sticky-event replay buffer | 5 min | `sse-gateway.ts:120` |
| Estimated tokens per requirement | 1,000 | `test-gen-service.ts:393` |

### 18.3 Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| LLM 429 | `err.message.includes('429')` | Backoff (4-16 s) and retry; ultimately throws. |
| LLM transient network | `fetch failed` / `ECONNRESET` | Backoff (2-8 s) and retry. |
| LLM schema violation | ZodError after `repairAgentOutput` | Append a corrective message, retry up to 3 times. |
| Agent timeout (5 min) | `AbortController` + `TimeoutError` | Throw `AgentTimeoutError`; no retry. The run is marked `FAILED`. |
| Circuit breaker open | `cb.try() === false` | Fall through to fallback providers. If all fail, throw. |
| Browser disconnect mid-run | `res.on('close')` in `sse-gateway.ts:130` | Cleanup heartbeat. Run continues server-side; client can reconnect and replay events. |
| Server crash mid-run | DB persists via `SqliteSaver` | On restart, `recoverInterruptedRuns` re-emits `checkpoint:waiting` for `WAITING_REVIEW` runs. |
| Stale `WAITING_REVIEW` (no client) | 30-min timeout monitor | `abortRun` + emit `checkpoint:timeout`. |
| User closes browser during run | `signal?.aborted` from `AbortController` | All in-flight `streamChat` calls are aborted; run marks `FAILED`. |
| Provider config has no `monthly_token_limit` | check at start | Allowed (no pre-check). |
| Provider config has `monthly_token_limit` and it's exhausted | `getMonthlyTokenUsage >= limit` | Reject the start request with a clear error. |
| No `requirements` matching selection | `epics.length === 0` | Throw "No matching requirements found for selected IDs". |
| No active provider config | `providerConfigRow` is undefined | Throw "No active AI provider configuration found. Go to Settings → AI Provider to configure one." |
| `init` takes > 30 s | `setTimeout(…, 30_000)` in `test-gen-service.ts:312-320` | Emit `pipeline:error` and abort. |

---

## 19. Sequence Walkthroughs

### 19.1 Start → End (Auto Mode, Single Batch)

```text
[Browser] POST /api/test-gen/proj-1/start
          { requirementIds: ['req-1','req-2'], providerConfigName: 'gpt4o', mode: 'auto' }
[Router]  validateWithSchema → pipelineRepo.createRun(runId) → 200 {runId}
          (fire-and-forget) TestGenService.startPipeline(runId, ...)
[SSE]     phase:start { phase: 'preparation' }
          pipeline:context { flows: 0, indexEntries: 2 }
          pipeline:budget { estimated: 2000, limit: 100000 }
[Service] buildRequirementIndex → 2 items
          groupRequirementsByEpic → 1 root epic → 1 batch
          createAIProviderWithFallback → AIProvider
          createOrchestratedPipeline → CompiledPipeline
          new TestGenSession(...)
          new BatchOrchestrator(...)
          (begin batch 0)
[Service] pipelineRepo.updateThreadId(runId, "runId-batch-0")
          setBatch(1, 1)
[SSE]     batch:start { batch: 1, total: 1 }
[Session] pipeline.stream(inputState, { configurable: { thread_id: 'runId-batch-0' } })
[Graph]   START → agent_test_analyst
[Agent]   prepareAgentRun → runReactLoop
[ReAct]   iter 1: chat → tool_call[load_skill('test-analyst')] → inject SKILL.md
          iter 2: chat → tool_call[execute_skill_module('test-analyst','analyzeConditions',[…])] → base conditions
          iter 3: chat → tool_call[fetch_requirement_resource('resource://requirement-index/requirement-epic-req-aut-auth.json')]
          iter 4: chat → final JSON (no tool calls) → cache write
[Graph]   agent_test_analyst → checkpoint_1 → interrupt({conditions, analysis})
[Session] detectCheckpointNumber: 1
[Resolver] AutoResolver (no-op)
[Session] buildResumeState(1, { action: 'approve' }, payload) → {conditions, analysis, feedback:''}
          Command({ resume: ... }) → pipeline.stream(...)
[SSE]     checkpoint:auto-resolved { checkpointNumber: 1, action: 'approve' }
[Graph]   → agent_test_designer → checkpoint_2 → interrupt
          → resume auto → agent_quality_manager → checkpoint_3 → interrupt
          → resume auto → END
[Service] deduplicateTestCases([…]) → { allCases, removedCount: 0, conflicts: [] }
          scope.markComplete({ totalCases: 3, totalBatches: 1 })
[SSE]     pipeline:complete { summary, stats }
[Service] sseGateway.cleanup(runId)
[Service] semaphore.release
```

### 19.2 Start → Interactive Checkpoint → Approve with Edits

```text
[Browser] Start (mode: 'interactive')
[Service] (same as above up to first interrupt)
[Graph]   agent_test_analyst → checkpoint_1 → interrupt
[Resolver] InteractiveResolver.onInterrupt(runId, 1, 'review-conditions', payload)
[SSE]     checkpoint:waiting { checkpointId, checkpointNumber: 1, type: 'review-conditions',
                              summary: '16 Test Conditions', payload }
[Browser] renders review form; user edits conditions
[Browser] POST /api/test-gen/runId/checkpoint-update
          { editedData: { conditions: [...edited...] }, checkpointNumber: 1 }
[Service] applyStateUpdate(threadId, { testConditions: ... })
          pipelineRepo.updateAgentLogOutput(runId, 'test_analyst', { testConditions: ... })
          getCheckpointState(runId) → snapshot from LangGraph
          sseGateway.emit 'checkpoint:waiting' (re-emit with fresh payload)
[Browser] POST /api/test-gen/runId/resume
          { action: 'approve', editedData: { conditions: [...edited...] } }
[Service] insertAuditLog(runId, 'review-conditions', 'approve', editedData)
          setRunRunning(runId)
          sseGateway.emit 'checkpoint:resolved' { checkpointNumber: 1, action: 'approve' }
          resumePipeline → session.resumeBatch(0, threadId, { action: 'approve', edits: {…} })
[Session] buildResumeState → Command({ resume: { conditions: …, analysis: …, feedback: '' } })
[Graph]   resumes at checkpoint_1 → onResolve → phase='design' → agent_test_designer …
[Service] (continues through remaining checkpoints and completes)
```

### 19.3 Start → Retry at Checkpoint 1

```text
[Browser] Start (mode: 'interactive')
[Service] (same as 19.2 up to first interrupt)
[SSE]     checkpoint:waiting { …, summary: '16 Test Conditions', payload }
[Browser] User clicks Retry
[Browser] POST /api/test-gen/runId/resume  { action: 'retry', feedback: 'Focus on boundary conditions' }
[Service] insertAuditLog(runId, 'review-conditions', 'retry', null)
          setRunRunning(runId)
          sseGateway.emit 'checkpoint:resolved' { action: 'retry' }
          resumePipeline → session.resumeBatch(0, threadId, { action: 'retry', feedback: '…' })
[Session] resumeState = { retry: true, feedback: 'Focus on boundary conditions' }
          Command({ resume: { retry: true, feedback: '…' } })
[Graph]   checkpoint_1 → onRetry → phase='analysis' → agent_test_analyst
[Agent]   humanFeedback is present → cache BYPASSED → fresh run
[Service] (continues)
```

### 19.4 Abort

```text
[Browser] POST /api/test-gen/runId/abort
[Service] abortedRuns.add(runId); abortControllers.get(runId).abort();
          markRunFailed(runId)
[Agent]   runAgent sees options.signal.aborted → throws AgentAbortError
[Service] (catch) → sseGateway.emit 'pipeline:error' { phase, message, recoverable: false }
          concurrencySlot.release()
          sseGateway.cleanup(runId)  (ends the SSE response)
```

### 19.5 Crash Recovery

```text
[Server]  Boot. recoverInterruptedTestGenRuns() invoked.
[Service] pipelineRepo.getWaitingRuns() → [runA, runB]
          for each run:
            pipelineRepo.touchRun(runId)
            getCheckpointState(runId) → current payload from LangGraph
            sseGateway.emit 'checkpoint:waiting' { …, recovered: true }
          startCheckpointTimeoutMonitor()
[Browser] (when it reconnects) replays sticky checkpoint:waiting event
```

---

## 20. Configuration Reference

### 20.1 Server-side

| Key | Source | Default | Notes |
|---|---|---|---|
| `maxConcurrent` | `new TestGenService(sseGateway, 3)` | 3 | Per-server global semaphore. |
| `agentOpts.timeoutMs` | `test-gen-service.ts:368, 613` | 300_000 (5 min) | Per-agent timeout. |
| `agentOpts.useCache` | request body | `false` | Cache is opt-in. |
| `agentOpts.useReActLoop` | `test-gen-service.ts:371, 616` | `true` | Always on in production. |
| `monthly_token_limit` | `provider_configs` row | none | Enforced pre-start + per-iteration. |
| `fallback_config_ids` | `provider_configs.fallback_config_ids` | `[]` | JSON array of provider IDs. |
| `circuitBreaker.failureThreshold` | `provider.ts:294` | 5 | Failures before open. |
| `circuitBreaker.resetTimeoutMs` | `provider.ts:295` | 60_000 | Open period. |
| `maxIterations` (ReAct) | `react-loop.ts:43` | 15 | Per-agent tool-use budget. |
| `FETCH_TIMEOUT_MS` | `provider.ts:347` | 600_000 | Provider fetch timeout. |
| `TIMEOUT_MS` (checkpoint wait) | `test-gen-service.ts:213` | 1_800_000 (30 min) | Auto-abandon. |
| `MONITOR_INTERVAL_MS` | `test-gen-service.ts:209` | 60_000 | Checkpoint timeout monitor period. |
| `HEARTBEAT_INTERVAL` | `sse-gateway.ts:4` | 15_000 | SSE heartbeat. |
| `CACHE_TTL_HOURS` | `cache.ts:16` | 24 | Cache row lifetime. |
| `MAX_PARENT_DEPTH` | `requirement-grouper.ts:21` | 20 | Parent-chain walk depth. |
| `MAX_ERROR_LENGTH` | `agent.ts:420` | 500 | Truncate error message summaries. |
| `THROTTLE_MS` (thinking) | `agent.ts:227` | 80 | Throttle `onThinking` callbacks. |
| `INIT_TIMEOUT` | `test-gen-service.ts:320` | 30_000 | Provider init timeout. |
| `AVG_TOKENS_PER_REQ` | `test-gen-service.ts:393` | 1_000 | Token budget estimation. |

### 20.2 Skill frontmatter

`shared/ai/skills/<name>/SKILL.md` frontmatter:

```yaml
---
name: <skill-id>
description: <single sentence — used in progressive disclosure index>
tags: [<tag1>, <tag2>]
module: ./index.ts         # relative to skill dir
allowedTools: [<tool1>, <tool2>]   # informational; runtime whitelist is in AgentRole
---
```

### 20.3 Role configuration

`shared/ai/roles/<name>.ts`:

| Field | Purpose |
|---|---|
| `name` | Display name + node id (`test-analyst` → `agent_test_analyst`). |
| `systemPromptTemplate` | Body. Must contain `{{input}}` and `{{skills}}`. |
| `requiredSkills` | Used in *non-progressive* mode only. |
| `inputSchema` | Zod — gates LLM input. |
| `outputSchema` | Zod — gates LLM output. |
| `options.maxTokens` | Provider override. |
| `useProgressiveDisclosure` | `true` for all 3 production roles. |
| `allowedTools` | ReAct tool whitelist. |

### 20.4 Provider config row

```ts
{
  id: string,
  projectId: string,
  name: string,                // human label, used in `providerConfigName`
  type: 'azure-openai' | 'nvidia-nim' | 'openrouter' | 'openai',
  endpoint: string | null,     // Azure / NIM only
  encryptedApiKey: string,     // decrypted on use
  deployment: string | null,   // Azure only
  apiVersion: string | null,   // Azure only
  model: string | null,        // OpenAI / NIM / OpenRouter
  fallbackConfigIds: string[], // JSON array of provider IDs
  monthlyTokenLimit: number | null,
  isActive: boolean,
}
```

---

## Appendix A — File Index

For the full file inventory, see the project tree under
`shared/ai/`, `shared/ai-test-gen/`, `server/modules/ai-test-gen/`,
`client/features/ai-test-gen/`, and `server/migrations/013_ai_test_gen_schema.ts`.

## Appendix B — Term Glossary

- **Agent** — a role + context pair that runs `runAgent`. Three
  production agents: test-analyst, test-designer, quality-manager.
- **Batch** — a single epic's worth of requirements, processed through
  the full 3-agent graph as one `runId-batch-N` thread.
- **Checkpoint** — a LangGraph node that calls `interrupt<T>()`. Three
  production checkpoints: `checkpoint_1` (conditions), `checkpoint_2`
  (draft cases), `checkpoint_3` (final cases + matrix).
- **HITL** — Human-in-the-Loop. The mechanism for approving, editing, or
  retrying at a checkpoint.
- **Progressive disclosure** — see § 7.3. The mechanism for starting
  agents with a one-line skill index and pulling full bodies on demand.
- **ReAct loop** — see § 8.1. The bounded iteration tool-use loop.
- **Run** — a single user-initiated execution. May contain multiple
  batches and multiple HITL pauses.
- **Skill** — a directory under `shared/ai/skills/` with a
  `SKILL.md` + optional `index.ts` + `references/` + `resources/`.
- **Tool** — an LLM-callable function exposed via ReAct: `search_skills`,
  `load_skill`, `execute_skill_module`, `fetch_requirement_resource`,
  or domain-specific registered tools.
