# Detailed Design: AI-Powered Requirement Management & Test Case Generation Pipeline

## 1. Scope & Context

This spec covers the complete design for M1 (Requirements), M2 (AI Pipeline), and M3 (NL→Automation Generation). The codebase is QuantumQA — a TypeScript 5.8 modular monolith with Express 5, React 19, SQLite, and Playwright.

See also:
- `docs/prd-requirements-pipeline.md` — PRD
- `docs/pipeline-istqb-design.md` — M2 3-agent ISTQB design
- `docs/skill-context-design.md` — Skill-based context management

## 2. Overall Pipeline Architecture

```
Requirements (M1)
  │  CRUD + tree UI + import
  │  DB: requirements table
  ▼
Test Conditions + NL Test Cases (M2)
  │  3-agent ISTQB pipeline
  │  Agent1(Test Analyst) → Agent2(Test Designer) → Agent3(Quality Manager)
  │  3 human-review checkpoints
  │  DB: test_conditions + natural_language_test_cases
  ▼
Automated Suite/Case/Step (M3)
  │  Agent4(Automation Engineer) → match POM/API → generate Suite/Case/Step
  │  Checkpoint → human review → save
  │  DB: existing suites/suite_cases/case_steps (with trace back to NL case)
  ▼
Execution (existing)
  │  runner.ts → context → executor → logger
  ▼
Report (existing)
```

## 3. New Module Map

| Module | Location | Type | Dependencies |
|--------|----------|------|-------------|
| `requirements` | `server/modules/requirements/` | CRUD | `shared/http/crud.ts`, `shared/db/client.ts` |
| `test-conditions` | `server/modules/test-conditions/` | CRUD | `shared/http/crud.ts` (follows same pattern as requirements) |
| `nl-cases` | `server/modules/nl-cases/` | CRUD | `shared/http/crud.ts` (follows same pattern as requirements) |
| AI Provider | `shared/ai/provider.ts` | Deep Module | none (pure `fetch()`) |
| AI Agent Runner | `shared/ai/agent.ts` | Deep Module | `AIProvider`, `SkillLoader` |
| AI Skill Loader | `shared/ai/skill-loader.ts` | Deep Module | `fs` |
| AI Skills Assets | `shared/ai/skills/` | Static | SKILL.md + references JSON/MD |
| AI Pipeline Engine | `shared/ai/pipeline.ts` | Deep Module | `@langchain/langgraph`, `AgentRunner` |
| AI Pipeline API | `server/modules/ai-pipeline/` | Custom Router | AI Pipeline, SSE, settings |
| Requirements Index Gen | `server/modules/requirements/index-generator.ts` | Utility | requirements repo |

## 4. M1: Requirement Management

### 4.1 DB Schema — `requirements` table (Migration 010)

```sql
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'MEDIUM',     -- CRITICAL/HIGH/MEDIUM/LOW
  risk_level TEXT NOT NULL DEFAULT 'MEDIUM',   -- HIGH/MEDIUM/LOW
  type TEXT NOT NULL DEFAULT 'functional',     -- functional/performance/security/usability/reliability
  status TEXT NOT NULL DEFAULT 'DRAFT',        -- DRAFT/APPROVED/IN_PROGRESS/DEPRECATED
  position INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',         -- JSON for extensible fields
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.2 Server Module — `server/modules/requirements/`

Follows CRUD module pattern exactly:

```
server/modules/requirements/
  schema.ts       — Zod: requirementPayloadSchema, requirementPatchSchema
  repository.ts   — extends BaseCrudRepository<Requirement>
  mapper.ts       — normalizeRequirement()
  index.ts        — createCrudModule({ basePath: '/api/requirements', ... })
```

**`mapper.ts` — `normalizeRequirement()`**:
```typescript
function normalizeRequirement(input: Partial<Requirement>): Requirement {
  return {
    id: asId(input.id, 'req'),
    projectId: asText(input.projectId),
    parentId: nullableText(input.parentId),
    title: asText(input.title, 'New Requirement'),
    description: asText(input.description),
    priority: asText(input.priority, 'MEDIUM'),
    riskLevel: asText(input.riskLevel, 'MEDIUM'),
    type: asText(input.type, 'functional'),
    status: asText(input.status, 'DRAFT'),
    position: typeof input.position === 'number' ? input.position : 0,
    metadata: typeof input.metadata === 'object' ? input.metadata : {},
  };
}
```

**`repository.ts`** — CRUD operations:
- `list()` — inherits from BaseCrudRepository
- `get(id)` — SELECT from requirements WHERE id = ?
- `save(record)` — UPSERT into requirements
- `remove(id)` — inherits from BaseCrudRepository (cascades children via FK)
- **Additional**: `listByProject(projectId)` — SELECT WHERE project_id = ? ORDER BY position

**`index.ts`** — standard CRUD module with schema validation:
```typescript
export const requirementsModule = createCrudModule({
  basePath: '/api/requirements',
  repository: new RequirementRepository(),
  normalize: normalizeRequirement,
  createSchema: requirementPayloadSchema,
  patchSchema: requirementPatchSchema,
});
```

### 4.3 Requirement Import — Custom Route

**`server/modules/requirements/import.ts`** — Custom handler registered in `index.ts`:

**POST `/api/requirements/:projectId/import`** — multipart file upload

**Markdown parser**:
- `# Title` → Epic (level 0, parent=null)
- `## Title` → Feature (level 1, parent=nearest #)
- `### Title` → Story (level 2, parent=nearest ##)
- `#### Title` → AC (level 3, parent=nearest ###)
- Content under headings becomes `description`
- Priority inferred from [CRITICAL]/[HIGH]/[MEDIUM]/[LOW] markers in text

**CSV parser**:
- Columns: `title, description, parent_title, priority, risk_level, type`
- `parent_title` matched by title lookup in same project
- Empty parent_title → root node

Returns: `{ imported: number, requirements: Requirement[] }`

### 4.4 Frontend — `client/features/requirements/`

| Component | Description |
|-----------|-------------|
| `RequirementsPage.tsx` | Main layout: left tree panel + right detail panel |
| `RequirementTree.tsx` | Recursive tree component using `<details>/<summary>` or custom indented list |
| `RequirementEditor.tsx` | Form: title, description, priority/risk/type dropdowns, status |
| `RequirementImport.tsx` | Upload modal: file picker + preview + confirm |
| `RequirementsDashboard.tsx` | Summary: total nodes, coverage by status, risk distribution |

**Data flow**: `useCrud('requirements')` from `shared/hooks/useCrud.ts`.
**Tree rendering**: Recursive component, each node loads children lazily via `GET /api/requirements?parentId=X`.
**Add node**: Create child under selected parent → refresh tree.
**Drag-to-reparent**: Out of scope for MVP (manual parent_id edit in form).

### 4.5 Server Module: test-conditions (`server/modules/test-conditions/`)

Same CRUD pattern as requirements. Schema validates: `condition`, `category`, `risk_level`, `priority`, `primary_technique`, `coverage_dimensions`. Repository extends `BaseCrudRepository<TestCondition>`. Module at `/api/test-conditions`.

### 4.6 Server Module: nl-cases (`server/modules/nl-cases/`)

Same CRUD pattern. Schema validates: `title`, `preconditions[]`, `steps[]`, `postconditions[]`, `tags[]`. Repository extends `BaseCrudRepository<FinalNlTestCase>`. Module at `/api/nl-cases`.

### 4.7 Requirements Index Generation

**`server/modules/requirements/index-generator.ts`** — called on every save/delete:

```typescript
function buildRequirementIndex(projectId: string): IndexItem[] {
  const allReqs = requirementRepo.listByProject(projectId);
  return allReqs.map(r => ({
    id: r.id,
    title: r.title,
    level: computeLevel(r, allReqs),          // 0=epic, 1=feature, 2=story, 3=ac
    parent: r.parentId,
    summary: truncate(r.description, 200),
    tags: extractTags(r.title + r.description),
    priority: r.priority,
    risk: r.riskLevel,
    type: r.type,
    testType: inferTestTypes(r),
    childCount: allReqs.filter(c => c.parentId === r.id).length,
    children: allReqs.filter(c => c.parentId === r.id).map(c => c.id),
  }));
}
```

Index written to `shared/ai/skills/requirement-index/references/index.json`.

## 5. M2: AI Infrastructure + 3-Agent Pipeline

### 5.1 Deep Module: AI Provider (`shared/ai/provider.ts`)

```typescript
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface ChatOptions { temperature?: number; maxTokens?: number; responseFormat?: 'json_object' | 'text'; }
interface ChatResponse { content: string; usage?: { promptTokens: number; completionTokens: number; }; }

interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}

type ProviderConfig =
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string; }
  | { type: 'nvidia-nim';   endpoint: string; apiKey: string; model: string; }
  | { type: 'openrouter';   apiKey: string; model: string; }
  | { type: 'openai';       apiKey: string; model: string; };

function createAIProvider(config: ProviderConfig): AIProvider;
```

**Implementation**: Each adapter calls provider's `/chat/completions` endpoint via `fetch()`. `streamChat` parses SSE response. No provider SDK dependencies.

**Storage**: Multiple named configs stored in `settings.ai_provider_configs` JSON column:
```json
{
  "azure-dev": { "type": "azure-openai", "endpoint": "...", "deployment": "gpt-4o", ... },
  "nvidia": { "type": "nvidia-nim", "endpoint": "...", "model": "llama-3.1-70b", ... }
}
```
Active provider selected in pipeline UI at launch time.

### 5.2 Deep Module: Skill Loader (`shared/ai/skill-loader.ts`)

```typescript
interface SkillContext {
  systemPrompt: string;            // SKILL.md content (all loaded skills concatenated)
  referenceFiles: { name: string; path: string; content: string }[];  // available for injection
}

function loadSkillContext(skillNames: string[]): SkillContext;
function readReferenceFile(skillName: string, referenceName: string): string;
```

**Progressive disclosure**: Only `SKILL.md` content loaded into `systemPrompt`. Reference files loaded on-demand via `readReferenceFile()`.

**Skill root**: `shared/ai/skills/`

### 5.3 Static Assets: AI Skills (`shared/ai/skills/`)

```
shared/ai/skills/
  requirement-index/
    SKILL.md
    references/index.json
  requirement-query/
    SKILL.md
    references/query-strategies.md
    references/coverage-checklist.md
  requirement-analysis/
    SKILL.md
    references/analysis-checklist.md
    references/technique-mapping.md
  test-analyst/
    SKILL.md                      # Agent 1 system prompt
  test-designer/
    SKILL.md                      # Agent 2 system prompt
  quality-manager/
    SKILL.md                      # Agent 3 system prompt
  automation-engineer/
    SKILL.md                      # Agent 4 system prompt
```

### 5.4 Deep Module: Agent Runner (`shared/ai/agent.ts`)

```typescript
interface AgentRole {
  name: string;                                    // e.g. "test-analyst"
  systemPromptTemplate: string;                    // prompt with {{placeholders}}
  requiredSkills: string[];                        // [requirement-query, test-analyst]
  inputSchema: ZodType;                            // validates input state
  outputSchema: ZodType;                           // validates LLM output
  options?: ChatOptions;                           // temperature, etc.
}

interface AgentContext {
  provider: AIProvider;
  role: AgentRole;
  skillContext: SkillContext;
}

async function runAgent(context: AgentContext, input: unknown): Promise<unknown>;
async function streamAgent(context: AgentContext, input: unknown): AsyncIterable<string>;
```

**Flow**:
1. Validate `input` against `role.inputSchema`
2. Compose `systemPrompt` from `role.systemPromptTemplate` + `skillContext.systemPrompt`
3. Fill template placeholders with input values
4. Call `provider.chat()` with response format = `json_object`
5. Parse and validate output against `role.outputSchema`
6. Return typed output

### 5.5 Deep Module: AI Pipeline (`shared/ai/pipeline.ts`)

Uses `@langchain/langgraph` (0.x) StateGraph with `SqliteSaver` checkpoint.

```typescript
// 3 agent nodes + 3 checkpoint nodes
const pipelineGraph = new StateGraph<PipelineState>({ channels: pipelineStateSchema })
  // Node 1: Agent A — Test Analyst
  .addNode('agent_test_analyst', async (state) => {
    const conditions = await runAgent(testAnalystContext, {
      requirements: loadRequirementsForBatch(state),
      projectContext: loadProjectContext(state.projectId),
    });
    return { testConditions: conditions, requirementAnalysis: ... };
  })
  // Checkpoint 1
  .addNode('review_conditions', (state) => state)  // interrupt point
  
  // Node 2: Agent B — Test Designer
  .addNode('agent_test_designer', async (state) => {
    const drafts = await runAgent(testDesignerContext, {
      conditions: state.approvedConditions,
      projectContext: loadProjectContext(state.projectId),
    });
    return { draftTestCases: drafts };
  })
  // Checkpoint 2
  .addNode('review_drafts', (state) => state)      // interrupt point
  
  // Node 3: Agent C — Quality Manager
  .addNode('agent_quality_manager', async (state) => {
    const result = await runAgent(qualityManagerContext, {
      draftCases: state.approvedDraftCases,
      humanFeedback: state.humanReviewFeedback,
    });
    return { finalTestCases: result.cases, coverageMatrix: result.matrix };
  })
  // Checkpoint 3
  .addNode('final_review', (state) => state)       // interrupt point
  
  // Edges
  .addEdge(START, 'agent_test_analyst')
  .addEdge('agent_test_analyst', 'review_conditions')
  .addEdge('review_conditions', 'agent_test_designer')
  .addEdge('agent_test_designer', 'review_drafts')
  .addEdge('review_drafts', 'agent_quality_manager')
  .addEdge('agent_quality_manager', 'final_review')
  .addEdge('final_review', END)
  
  .compile({ checkpointer: new SqliteSaver(db) });  // db is existing singleton from shared/db/client.ts

// Batch processing: Orchestrator filters index, calls Agent 1 per batch
async function runAgent1InBatches(state: PipelineState): Promise<TestCondition[]> { ... }
```

**Batch processing (orchestrator logic)**:
1. Read `index.json` from requirement-index skill
2. Group requirements by epic (root nodes with parent=null)
3. For each epic batch: load epic + children's full descriptions → inject into Agent 1 prompt
4. Collect all conditions from all batches
5. Deduplicate + cross-reference check
6. Return unified conditions list

**Human review flow**:
1. Pipeline reaches checkpoint → LangGraph interrupt
2. Frontend SSE receives `human_review:required` with phase info
3. User inspects results, optionally edits (stored to `approvedConditions` / `approvedDraftCases`)
4. User calls `POST /api/pipeline/:runId/continue { action: 'approve' | 'retry' }`
5. If retry → re-run current agent; if approve → resume graph

### 5.6 DB Tables for M2

**`test_conditions`** (Migration 011):
```sql
CREATE TABLE IF NOT EXISTS test_conditions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'happy-path',
  data_requirements TEXT,
  dependencies TEXT,                    -- JSON array
  risk_level TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  primary_technique TEXT NOT NULL,
  secondary_techniques TEXT,            -- JSON array
  technique_rationale TEXT,
  coverage_dimensions TEXT,             -- JSON [{dimension, variants[]}]
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`natural_language_test_cases`** (Migration 011):
```sql
CREATE TABLE IF NOT EXISTS natural_language_test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requirement_id TEXT REFERENCES requirements(id),
  condition_id TEXT REFERENCES test_conditions(id),
  technique_applied TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  preconditions TEXT NOT NULL DEFAULT '[]',     -- JSON array
  test_data TEXT NOT NULL DEFAULT '[]',          -- JSON [{key, value, description}]
  steps TEXT NOT NULL DEFAULT '[]',              -- JSON [{sequence, action, expected}]
  postconditions TEXT NOT NULL DEFAULT '[]',     -- JSON array
  tags TEXT NOT NULL DEFAULT '[]',               -- JSON array
  self_review TEXT,                              -- JSON {score, issues[]}
  review_summary TEXT,
  change_log TEXT,                               -- JSON [{source, changes}]
  status TEXT NOT NULL DEFAULT 'DRAFT',
  generated_suite_id TEXT,                       -- set after M3 generation
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`pipeline_runs`** (Migration 011):
```sql
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'RUNNING',        -- RUNNING/PAUSED/COMPLETED/FAILED
  phase TEXT NOT NULL DEFAULT 'init',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
LangGraph `SqliteSaver` manages its own checkpoint table. `pipeline_runs` tracks high-level status.

**`pipeline_coverages`** (Migration 011):
```sql
CREATE TABLE IF NOT EXISTS pipeline_coverages (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  requirement_title TEXT NOT NULL,
  level TEXT NOT NULL,
  total_conditions INTEGER NOT NULL DEFAULT 0,
  test_case_count INTEGER NOT NULL DEFAULT 0,
  technique_breakdown TEXT NOT NULL DEFAULT '{}',   -- JSON
  category_breakdown TEXT NOT NULL DEFAULT '{}',      -- JSON
  coverage_percentage REAL NOT NULL DEFAULT 0,
  uncovered_risks TEXT NOT NULL DEFAULT '[]'          -- JSON array
);
```

**`settings` update** (Migration 010):
```sql
ALTER TABLE settings ADD COLUMN ai_provider_configs TEXT NOT NULL DEFAULT '{}';
```

### 5.7 Custom Router: AI Pipeline API (`server/modules/ai-pipeline/`)

**Routes**:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pipeline/:projectId/start` | Launch NL generation pipeline for requirements. Returns SSE stream. |
| `POST` | `/api/pipeline/:runId/continue` | Continue from checkpoint. Body: `{ action: 'approve' \| 'retry', stateEdits?: {...} }` |
| `GET`  | `/api/pipeline/:runId/status` | Get current phase + state snapshot |
| `POST` | `/api/pipeline/:runId/abort` | Abort a running pipeline |
| `GET`  | `/api/pipeline/:runId/state` | Get full LangGraph state for UI inspection |

**`POST /api/pipeline/:projectId/start`** body:
```json
{
  "requirementIds": ["req-001", "req-002"],
  "providerConfigName": "azure-dev",
  "mode": "nl-generation"   // "nl-generation" | "auto-generation"
}
```

**SSE events**:
- `phase:start` — `{ phase: "analysis", agent: "test-analyst", batch: "1/3" }`
- `agent:thought` — `{ phase: "...", chunk: "..." }` — LLM token-level streaming output, emitted as raw text chunks before JSON parsing
- `agent:output` — `{ phase: "...", partial: {...} }` — structured JSON output, emitted after successful Zod validation of Agent output
- `phase:complete` — `{ phase: "...", summary: "..." }`
- `human_review:required` — `{ phase: "review-conditions", type: "checkpoint", checkpointId: 1 }`
- `pipeline:complete` — `{ summary: {...} }`
- `pipeline:error` — `{ phase: "...", message: "...", rawResponse?: "..." }`

**Implementation notes**:
- Reuse SSE pattern from `server/modules/execution/logger.ts` (res.set, res.write, connection management)
- Pipeline runs in same Node.js process, async, non-blocking
- Graph execution wrapped in try/catch → errors streamed as `pipeline:error` events

### 5.8 Frontend Components for M2

| Component | Location | Description |
|-----------|----------|-------------|
| `PipelinePage.tsx` | `client/features/ai-pipeline/` | Main pipeline launch + progress page |
| `PipelineLaunch.tsx` | same | Select requirements (tree picker), choose provider config, start |
| `PipelineProgress.tsx` | same | SSE stream viewer: phase indicator, agent output log, progress bar |
| `CheckpointReview.tsx` | same | Rendering panel for each checkpoint type (conditions table / draft cases / quality report) |
| `CoverageMatrix.tsx` | `client/features/nl-cases/` | Matrix display: requirements vs coverage |
| `NlCaseList.tsx` | `client/features/nl-cases/` | List view with status badges, structured display |
| `NlCaseEditor.tsx` | `client/features/nl-cases/` | Editor form: title, preconditions, steps[], postconditions, etc. |

**Settings extension**: `client/features/settings/` — add AI Provider configs management (CRUD for `ai_provider_configs`).

## 6. M3: NL Test Case → Automated Suite/Case/Step

### 6.1 Agent 4: Automation Engineer

**Role**: Converts approved NL test cases into QuantumQA Suite/Case/Step.

**Input**:
```typescript
interface AutomationEngineerInput {
  nlTestCase: FinalNlTestCase;
  projectContext: {
    name: string;
    pages: { name: string; elements: { name: string; selectorType: string; value: string }[] }[];
    endpoints: { name: string; method: string; baseUrls: Record<string, string> }[];
    suites: { id: string; name: string }[];    // existing suites (for grouping)
  };
}
```

**Output**: Suite/Case/Step + trace ID linking back to NL case.

**Matching strategy**: All POM element names and API endpoint names are injected into the Agent's system prompt as a structured list. The Agent uses semantic understanding to match NL case steps to existing elements. If no match found, the Agent flags the step for manual element creation.

**Generated Step** conforms to existing `TestStep` contract:
```typescript
{
  id: string,
  action: string,       // e.g. "CLICK", "FILL", "NAVIGATE", "API_GET", "API_POST"
  target: string,       // element name or endpoint name
  data: string,         // input value for FILL, request body for API
  description: string,  // human-readable description
  assertions?: StepAssertion[],  // auto-generated from NL "expected"
  extractors?: VariableExtractor[],
}
```

**Assertion generation**: NL step's `expected` field → Agent infers appropriate assertion type and value:
- "页面应该显示 '注册成功'" → `{ source: 'UI_TEXT', operator: 'CONTAINS', expectedValue: '注册成功' }`
- "响应状态码应该是 200" → `{ source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }`
- "返回的 token 不为空" → `{ source: 'API_BODY_JSON', expression: '$.token', operator: 'EXISTS' }`

### 6.2 M3 Flow

```
START
  │
  │ User selects approved NL test cases (status=APPROVED)
  ▼
Agent 4: Automation Engineer
  │
  │ Loads: POM elements + API endpoints from project
  │ For each NL case: match steps → generate TestSteps
  ▼
Checkpoint: Review generated Suite/Case/Step
  │
  │ User inspects generated steps
  │ Can edit step actions, targets, assertions
  │ Can flag unmapped elements (need POM entry)
  ▼
Save (confirmed)
  │
  │ Save Suite/Case/Step to existing tables via SuiteRepository
  │ Update nl_case.generated_suite_id → trace link
  │ Update nl_case.status → FINAL
  ▼
END
```

### 6.3 M3 API Endpoints

**`POST /api/pipeline/:projectId/start`** with `mode: "auto-generation"`:
```json
{
  "nlCaseIds": ["nl-001", "nl-002"],
  "providerConfigName": "azure-dev",
  "mode": "auto-generation"
}
```

**SSE events**: Same event types as M2: `phase:start`, `agent:thought`, `agent:output`, `phase:complete`, `human_review:required`, `pipeline:complete`.

M3 pipeline also uses LangGraph with a single Agent node + checkpoint:
```
[START] → agent_automation_engineer → [CHECKPOINT: review] → [END]
```

### 6.4 NL Case → Suite mapping

Each NL test case maps to one Suite containing one Case:
- **Suite**: named after NL case title, linked to project
- **Case**: single case with steps generated by Agent 4
- **Steps**: preconditions → setupSteps, main steps → steps, postconditions → teardownSteps

Multiple NL cases from the same feature can be manually grouped into a single Suite (post-generation).

## 7. Cross-Cutting: Shared Contracts (`shared/contracts/index.ts`)

**New types to add**:

```typescript
interface Requirement {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'functional' | 'performance' | 'security' | 'usability' | 'reliability';
  status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'DEPRECATED';
  position: number;
  metadata: Record<string, unknown>;
}

interface RequirementIndexItem {
  id: string;
  title: string;
  level: number;          // 0=epic, 1=feature, 2=story, 3=ac
  parent: string | null;
  summary: string;
  tags: string[];
  priority: string;
  risk: string;
  type: string;
  testType: string[];
  childCount: number;
  children: string[];
}

// TestCondition, DraftNlTestCase, FinalNlTestCase, CoverageMatrix —
// full definitions in docs/pipeline-istqb-design.md sections for
// Agent 1, Agent 2, and Agent 3 output schemas.
```

## 8. Cross-Cutting: Migration Plan

| # | Tables | Depends On |
|---|--------|------------|
| **010** | `requirements` + `settings.ai_provider_configs` | none |
| **011** | `test_conditions` + `natural_language_test_cases` + `pipeline_runs` + `pipeline_coverages` | 010 (FK to requirements) |
| **012** | LangGraph checkpoint tables (managed by SqliteSaver) | none |
| **013** | `natural_language_test_cases.generated_suite_id` column (if not in 011) + `suites.source_nl_case_id` | 011 + existing suites |

Migrations are forward-only, auto-applied on server startup (existing pattern in `server/migrations/index.ts`).

## 9. Error Handling

**AI provider errors**: Caught by Agent Runner → stored in `pipeline_runs.errors` → streamed to frontend as `pipeline:error` SSE event.

**LLM output validation failures**: Agent Runner validates output against Zod schema. On failure → retry once with explicit error feedback in the next prompt. On second failure → store error + set pipeline to FAILED.

**Pipeline abort**: User-triggered abort sends signal to AbortController, cancels current LLM call, saves partial state.

**Network issues during SSE**: Frontend reconnects SSE stream, requests current state from `GET /api/pipeline/:runId/state`.

## 10. Testing Strategy

### Unit Tests (Vitest, co-located `__tests__/`)

| Module | Test Focus |
|--------|-----------| 
| `shared/ai/provider.ts` | Each adapter: request formatting, response parsing, error handling. Mock fetch. |
| `shared/ai/agent.ts` | Prompt composition, output parsing, Zod validation, retry logic. Mock AIProvider. |
| `shared/ai/pipeline.ts` | StateGraph transitions, checkpoint save/restore, batch merging logic. Mock AgentRunner. |
| `server/modules/requirements/mapper.ts` | Normalization edge cases. |
| `server/modules/requirements/import.ts` | Markdown/CSV parsing with sample inputs. |

### Integration Tests

| Module | Test Focus |
|--------|-----------|
| `server/modules/requirements/` | CRUD routes through express router |
| `server/modules/test-conditions/` | CRUD routes |
| `server/modules/nl-cases/` | CRUD routes |
| `server/modules/ai-pipeline/` | Pipeline start/continue/abort endpoints, SSE stream events |

### Mock Strategy

- **AIProvider**: Test provider returns canned JSON responses matching agent output schemas
- **DB**: Use SQLite in-memory for integration tests (existing pattern)
- **SSE**: Capture events from response stream in test assertions

## 11. Out of Scope

- UI drag-and-drop for requirement reparenting (MVP uses form-based parent selection)
- Requirement sync with Jira/Linear/Azure DevOps
- LangSmith observability integration
- Automated sandbox execution of generated test cases (saved for manual run via existing executor)
- Multi-project cross-referencing of requirements
- Requirement change auto-detection triggering re-generation