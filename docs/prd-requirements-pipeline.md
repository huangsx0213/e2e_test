# PRD: AI-Powered Requirement Management & Test Case Generation Pipeline

## Problem Statement

QuantumQA currently has no requirement management capability. Users must manually author test suites, cases, and steps without any traceability to the original requirements. The entire test design process is manual — from understanding what to test, to writing test case descriptions, to configuring Playwright steps. This slows down test creation, makes it difficult to assess test coverage against requirements, and prevents leveraging AI to accelerate the testing lifecycle.

Users want to:
- **Manage requirements** in a structured, multi-level hierarchy within QuantumQA
- **Generate natural language test cases** from requirements using AI
- **Generate automated test cases** (Suite/Case/Step) from natural language test cases using AI
- **Review and edit** AI-generated output at every stage before it flows downstream
- **Maintain traceability** from requirement → natural language test case → automated test case

## Solution

A three-phase pipeline integrated into QuantumQA's existing modular monolith architecture:

1. **Requirement Management** — A new CRUD module for multi-level tree-structured requirements (Epic → Feature → Story → Acceptance Criteria), with manual editing and file import support.

2. **AI-Powered Natural Language Test Case Generation** — A 3-agent pipeline following ISTQB methodology: Agent 1 (Test Analyst) extracts test conditions with technique selection, Agent 2 (Test Designer) creates draft NL test cases with self-review, Agent 3 (Quality Manager) performs quality review and produces final cases with a coverage matrix. Human review checkpoints at each stage.

3. **AI-Powered Automated Test Case Generation** — A second agent ("Test Engineer" role) converts approved natural language test cases into QuantumQA Suite/Case/Step structures, matching existing Page Object Model elements and API endpoints.

**Key design principles:**
- Every stage supports human-in-the-loop review and editing
- Multi-agent role simulation with defined input/output contracts between stages
- Provider-agnostic LLM layer supporting Azure OpenAI, Nvidia NIM, and others
- Full traceability chain stored in the database
- Reuses existing CRUD factory, module pattern, and shared contract conventions

## User Stories

### Requirement Management
1. As a test manager, I want to create a requirement hierarchy (Epic → Feature → Story → Acceptance Criteria), so that I can organize requirements by granularity.
2. As a test manager, I want to edit requirement titles, descriptions, priorities, and statuses, so that I can maintain requirements as they evolve.
3. As a test manager, I want to import requirements from structured files (Markdown, CSV), so that I don't have to manually type everything.
4. As a test manager, I want to view the requirement tree in a navigable hierarchy, so that I can understand the full scope of requirements.
5. As a test manager, I want to link requirements to the natural language test cases generated from them, so that I can trace coverage.

### Natural Language Test Case Generation
6. As a test analyst, I want AI to analyze a requirement tree and generate test conditions with risk assessment and ISTQB technique selection, so that test design is grounded in methodology.
7. As a test analyst, I want to review and edit test conditions before they are used to design test cases, so that I can verify the coverage strategy.
8. As a test designer, I want AI to generate draft natural language test cases from approved test conditions with self-quality review, so that I get high-quality first drafts.
9. As a test designer, I want to review, edit, and approve each draft test case before it proceeds, so that I can ensure quality and correctness.
10. As a quality manager, I want AI to perform a 6-dimensional ISTQB quality review on all draft cases and auto-fix issues, so that the final output meets professional standards. The 6 dimensions are: (1) Atomicity — each step does one thing, (2) Testability — preconditions are achievable and expected results are verifiable, (3) Coverage completeness — positive/negative/boundary/error paths are covered, (4) Repeatability — cases are self-contained without cross-case dependencies, (5) Clarity — steps are unambiguous with concrete data, (6) Data completeness — all required inputs have specific values.
11. As a quality manager, I want to see a coverage matrix showing which requirements are covered and which have gaps, so that I can assess test completeness.
12. As a test manager, I want to approve the final natural language test cases and save them to the database, ready for automated test generation.

### Automated Test Case Generation
13. As a test engineer, I want AI to convert an approved natural language test case into a QuantumQA Suite/Case/Step structure, so that it's ready for execution.
14. As a test engineer, I want the AI to match test steps to existing UI elements (from the Page Object Model) and API endpoints, so that the generated steps use real selectors and URLs.
15. As a test engineer, I want to review the generated automated test case (steps, assertions, extractors) before saving, so that I can correct any mistakes.
16. As a test engineer, I want the generated automated test case to be stored as a proper QuantumQA Suite with Cases and Steps, so that it can be executed immediately.

### Pipeline Orchestration
17. As a test engineer, I want to trigger the full pipeline from a requirement to automated test cases, with a human review checkpoint at each stage, so that the entire process is streamlined.
18. As a test engineer, I want to see the pipeline progress in real-time (SSE streaming of agent activity), so that I can monitor long-running generation tasks.
19. As a test engineer, I want the pipeline to be resumable — if I pause or disconnect, I want to pick up where I left off, so that I don't lose work.
20. As a test engineer, I want to configure which LLM provider to use, so that I can choose based on cost, latency, or compliance requirements.
21. As a test manager, I want the AI pipeline to process large requirement trees (100+ nodes) in batches without missing any requirements, so that I can trust the coverage is comprehensive.

### Traceability & Coverage
22. As a test manager, I want to see which requirements have automated tests and which don't, so that I can prioritize test creation.
23. As a test manager, I want to see the full traceability chain: Requirement → NL Test Case → Automated Suite, so that I can prove coverage in audits.
24. As a test engineer, I want to be notified when a requirement changes, so that I can review potentially affected test cases.

## Implementation Decisions

### 1. Architecture: New modules within existing modular monolith

Requirements and NL cases follow the **existing CRUD module pattern** (`{ basePath, router }` with `CrudRepository → CrudService → CrudController → CrudRouter`). The AI pipeline uses a new LangGraph-based orchestration layer that integrates with the server as a custom router module (like execution and recording).

### 2. Database Schema Changes

**New table: `requirements`**
Columns: `id`, `project_id` (FK), `parent_id` (self-referencing FK, nullable), `title`, `description`, `priority` (CRITICAL/HIGH/MEDIUM/LOW), `status` (DRAFT/APPROVED/IN_PROGRESS/DEPRECATED), `position`, `metadata` (JSON for extensible fields)

**New table: `test_conditions`** — Agent 1 output
Columns: `id`, `project_id` (FK), `requirement_id` (FK to requirements), `condition` (atomic test objective), `category` (happy-path/alternate/error/boundary/non-functional), `data_requirements`, `dependencies` (JSON array), `risk_level`, `priority`, `primary_technique`, `secondary_techniques` (JSON array), `technique_rationale`, `coverage_dimensions` (JSON [{dimension, variants[]}]), `status`

**New table: `natural_language_test_cases`** — Agent 2/3 output
Columns: `id`, `project_id` (FK), `title`, `requirement_id` (FK), `condition_id` (FK to test_conditions), `technique_applied`, `priority`, `category`, `preconditions` (JSON array), `test_data` (JSON [{key, value, description}]), `steps` (JSON [{sequence, action, expected}]), `postconditions` (JSON array), `tags` (JSON array), `self_review` (JSON: Agent 2's quality self-review {score, issues[]}), `review_summary` (Agent 3's quality review summary), `change_log` (JSON [{source, changes}]), `status` (DRAFT/APPROVED/FINAL), `generated_suite_id` (nullable FK to suites, set later by auto-generation phase), `created_at`, `updated_at`

**New table: `pipeline_runs`**
Columns: `id`, `project_id` (FK), `status` (RUNNING/PAUSED/COMPLETED/FAILED), `phase`, `state` (JSON snapshot of LangGraph state, includes all intermediate outputs: requirement analysis, test conditions, draft/final cases, coverage matrix), `created_at`, `updated_at`

Pipeline state is persisted as a JSON snapshot in `pipeline_runs.state`. Intermediate artifacts (conditions, draft cases, coverage matrix) are also persisted in their respective tables for queryability. The pipeline state JSON serves as a single-source recovery point for pause/resume.

**New table: `pipeline_coverages`** — Coverage matrix persisted per pipeline run
Columns: `id`, `pipeline_run_id` (FK), `requirement_id`, `requirement_title`, `level`, `total_conditions`, `test_case_count`, `technique_breakdown` (JSON), `category_breakdown` (JSON), `coverage_percentage`, `uncovered_risks` (JSON array)

No changes to existing tables. The new tables use the same conventions (TEXT primary keys, `project_id` FK with ON DELETE CASCADE, JSON columns for complex nested data).

### 3. LLM Provider Abstraction (Deep Module)

A provider-agnostic interface `AIProvider` in the shared layer:

```typescript
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface ChatOptions { temperature?: number; maxTokens?: number; }
interface ChatResponse { content: string; usage?: { promptTokens: number; completionTokens: number; }; }

interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}

type ProviderConfig = 
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string; }
  | { type: 'nvidia-nim'; endpoint: string; apiKey: string; model: string; }
  | { type: 'openrouter'; apiKey: string; model: string; };
```

Factory `createAIProvider(config: ProviderConfig): AIProvider` handles provider selection. Each adapter uses plain `fetch()` / SSE — no provider-specific SDKs required.

### 4. Agent Skill Framework (Deep Module)

A lightweight agent framework inspired by the Agent Skills specification, adapted for Node.js:

- **`AgentRole`**: Defines a named role (e.g., "test-analyst", "test-designer", "quality-manager") with a system prompt template, input schema (Zod), output schema (Zod), and optional tool definitions.
- **`AgentRunner`**: Wraps an `AIProvider` and `AgentRole`, handles the prompt → LLM call → parse output cycle. Supports structured output via Zod validation of LLM responses. Injects skill context (SKILL.md + indexed references) into the system prompt at runtime.
- **`AgentSkill`**: Named collections of AgentRoles. Skills are loaded from `shared/ai/skills/<skill-name>/` directories with progressive disclosure.

Key design: agents are **stateless** — they receive input state, produce output state. State management is handled by the pipeline orchestrator.

### 5. Pipeline Orchestration (LangGraph)

The NL test case generation pipeline uses a LangGraph `StateGraph` with 3 agent nodes + 3 human review checkpoints:

```
[START] → Agent1(Test Analyst) → [CHECKPOINT 1: review conditions] → Agent2(Test Designer) → [CHECKPOINT 2: review drafts] → Agent3(Quality Manager) → [CHECKPOINT 3: final review] → [END]
```

- **Agent 1 (Test Analyst)**: Receives requirement tree + project context (existing POM pages and API endpoints). Risk assessment → Extract test conditions → Select ISTQB technique per condition  
- **Agent 2 (Test Designer)**: Design NL test cases per condition using selected technique → Self-quality review  
- **Agent 3 (Quality Manager)**: 6-dimension quality review (atomicity, testability, coverage completeness, repeatability, clarity, data completeness) → Fix issues → Incorporate human feedback → Generate coverage matrix  

Each checkpoint is a LangGraph `interrupt()` (breakpoint). Users can approve, edit-and-continue, or retry the current agent.

State shape:
```typescript
interface PipelineState {
  projectId: string;
  requirementIds: string[];
  requirementAnalysis?: RequirementAnalysis;
  testConditions?: TestCondition[];
  approvedConditions?: TestCondition[];
  draftTestCases?: DraftNlTestCase[];
  approvedDraftCases?: DraftNlTestCase[];
  humanReviewFeedback?: string;
  finalTestCases?: FinalNlTestCase[];
  coverageMatrix?: CoverageMatrix;
  phase: PipelinePhase;
  errors: { phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[];
}
```

Complete agent I/O schemas and ISTQB methodology details are in `docs/pipeline-istqb-design.md`.

### 6. SSE Streaming

The pipeline endpoint (`POST /api/pipeline/start`) returns an `EventSource` stream with real-time progress:
- `phase:start` — agent started working on a phase
- `agent:thought` — agent's reasoning (streaming from LLM)
- `agent:output` — agent's output (streaming structured results)
- `phase:complete` — agent finished, results available for review
- `human_review:required` — pipeline paused, waiting for human input
- `pipeline:complete` — full pipeline finished

### 7. Provider Configuration Storage

LLM provider config stored in the existing `settings` table as JSON (new column: `ai_provider_config`), editable via the settings UI. Supports multiple named provider configs so users can switch between Azure OpenAI, Nvidia, etc.

### 8. Requirement Import

- **Markdown import**: Parses heading levels (`#`, `##`, `###`, `####`) into tree hierarchy. Content under headings becomes descriptions.
- **CSV import**: Columns `title, description, parent_title, priority`. Matches parent by title lookup.
- Import endpoint: `POST /api/requirements/:projectId/import` with multipart file upload.

### 9. Requirement Context Management via Agent Skills (No RAG)

Requirement trees can grow to 100+ nodes, exceeding practical LLM context limits. The solution uses **Agent Skill-based structured indexing** instead of vector databases (RAG).

**Architecture: 3 skills form a knowledge index**

```
shared/ai/skills/
  requirement-index/    # Lightweight JSON index of all requirements
    SKILL.md            # "This skill provides a searchable index of requirements"
    references/index.json  # [{ id, title, level, summary(≤200字), tags, priority,
                         #    risk, testType, childCount, children[] }, ...]
  requirement-query/    # Tool-like retrieval instructions
    SKILL.md            # "Find relevant requirements by tag/level/priority/scope"
    references/query-strategies.md
    references/coverage-checklist.md
  requirement-analysis/  # Analysis checklist
    SKILL.md            # "Analyze requirements for completeness and testability"
    references/analysis-checklist.md
    references/technique-mapping.md
```

**How it works:**

1. **Index generation**: Pipeline orchestrator (TypeScript) reads the `requirement-index/references/index.json` to understand the full requirement landscape
2. **Batch filtering**: Orchestrator groups requirements by epic, filters one epic + its children per batch
3. **Batch processing**: Agent 1 receives one batch at a time in its system prompt, processes it, returns conditions. Orchestrator merges results across all batches.
4. **Cross-batch validation**: After all batches, the orchestrator runs deduplication and cross-reference checks, then presents the complete result at Checkpoint 1
5. **Auto-regeneration**: Index file is rebuilt from the `requirements` DB table on every requirement change

**Why this beats RAG:**
- Requirements are **structured data** (hierarchy, tags, priority) — deterministic filtering is more accurate than semantic similarity search
- **Zero additional infrastructure** — no vector DB, no embedding model, no chunking strategy
- **Deterministic and debuggable** — query by tag/level/priority is traceable; RAG retrieval is opaque
- **Supported by industry research**: Anthropic's 2025 "Effective Context Engineering" and Chroma's "Context Rot" research show that structured indexing + batched processing outperforms stuffing context windows

Full design details in `docs/skill-context-design.md`.

### 10. Frontend Components

- **Requirements page** (`client/features/requirements/`): Tree view (left panel) + detail editor (right panel), using existing UI conventions (Lucide icons, modal dialogs, CRUD list patterns)
- **NL Test Cases page** (`client/features/nl-cases/`): List view with status badges, structured case display (preconditions/steps/expected), approve/reject/edit inline actions
- **Pipeline page** (`client/features/ai-pipeline/`): Initiation panel (select requirements → choose provider → start), progress visualization with SSE stream, review panels at each checkpoint
- **Settings extension**: Add AI Provider config section to settings page

### 11. No LangChain SDK Dependency for Core Logic

The LLM provider layer uses direct `fetch()` calls, not LangChain's `@langchain/core` `ChatModel` wrappers. This keeps the dependency footprint minimal and avoids binding to LangChain's Node.js SDK versioning. Only `@langchain/langgraph` is used for pipeline orchestration (StateGraph + checkpointing).

## Testing Decisions

### What makes a good test
- Test external behavior, not implementation details
- For CRUD modules: use co-located `__tests__/` directories (matching `server/modules/execution/__tests__/` pattern) — test REST endpoints through the router with `vitest`
- For AI modules: test the provider adapter's request/response parsing, the agent's prompt composition + output parsing, and the pipeline's state transitions
- Mock LLM calls with a test provider that returns canned responses

### Modules to test

| Module | Test Type | Prior Art |
|--------|-----------|-----------|
| `server/modules/requirements/` | Integration (CRUD routes) | Follow `server/modules/execution/__tests__/` pattern — co-located `__tests__/` with Vitest |
| `server/modules/nl-cases/` | Integration (CRUD routes) | Same as above |
| `server/modules/test-conditions/` | Integration (CRUD routes) | Same as above |
| `shared/ai/provider/` | Unit (provider adapters) | No prior art — first AI tests |
| `shared/ai/agent/` | Unit (3 agent roles: TestAnalyst, TestDesigner, QualityManager) | No prior art |
| `shared/ai/pipeline/` | Unit (StateGraph transitions with 3 agents + 3 checkpoints) | No prior art |
| `server/modules/ai-pipeline/` | Integration (SSE streaming, pause/resume, human review endpoints) | No prior art |

### Test infrastructure
- Use existing `vitest` configuration
- Mock LLM providers by injecting a test provider that validates prompt structure and returns controlled responses
- Integration tests for CRUD endpoints use existing patterns with `supertest`-style setup

## Out of Scope

- **Requirement sync with external tools** (Jira, Linear, Azure DevOps, etc.) — the import capability covers file-based import; real-time API sync is deferred
- **Vector database / RAG for semantic retrieval** — replaced by the Skill-based structured indexing approach (Implementation Decision #9). Semantic search on requirements is unnecessary given their structured nature.
- **LangSmith integration** — observability uses existing QuantumQA logging (SSE + DB); LangSmith integration is deferred
- **Sandbox execution of generated tests** — automated test cases are saved for manual review and execution through the existing execution engine; automatic sandbox validation is deferred
- **Multi-project context awareness** — the pipeline operates on one project at a time
- **Requirement change detection triggering re-generation** — manual re-trigger of pipeline is sufficient for MVP

## Further Notes

- The entire pipeline runs server-side within the existing Node.js process. No separate AI microservice.
- Agent skill definitions (`shared/ai/skills/`) are organized as `SKILL.md` files with `references/` directories (JSON index, Markdown checklists), following the Agent Skills Progressive Disclosure pattern. A SkillLoader (TypeScript, server-side) reads skill content at runtime and injects it into Agent system prompts. Agents (LLM calls) never read filesystem directly.
- The pipeline's LangGraph state is serializable and stored in SQLite, enabling pause/resume across server restarts (durable execution).
- Generated automated test cases use the exact same `normalizeSuite` / `normalizeCase` / `normalizeStep` mappers as manual test creation, ensuring consistency.
- The provider abstraction uses a `ProviderConfig` discriminated union — the user selects a provider type and fills in the relevant fields in settings UI, and the factory creates the right adapter at runtime.
- **Design documents**:
  - `docs/pipeline-istqb-design.md` — Detailed 3-agent ISTQB pipeline with agent I/O schemas, technique selection rules, and quality review dimensions
  - `docs/skill-context-design.md` — Skill-based requirement context management (structured index + batch processing, replacing RAG)