# Business Flow Integration Design

## Goal

Integrate `Business Flow` into QuantumQA as a first-class module that bridges the existing requirement tree and the AI pipeline without coupling flow management to pipeline orchestration.

## Scope

This design covers:

- Extending `Requirement` with `dependencies: string[]`
- Adding a standalone `business_flows` persistence model and CRUD module
- Adding a dedicated frontend page for business flow editing and approval
- Defining how approved flows are transformed into pipeline-ready blueprints

This design does not cover:

- Automatic flow derivation by an AI agent
- Full pipeline implementation beyond blueprint assembly
- Other requirement-management improvements from `docs/requirement-management-evaluation.md`

## Current Architecture Baseline

The current codebase already has the right modular shape for this feature:

- `server/modules/requirements/` owns requirement CRUD and import
- `client/features/requirements/` owns the requirement tree and editor UI
- `server/modules/test-conditions/`, `server/modules/nl-cases/`, and `server/modules/ai-pipeline/` already represent downstream phases
- `server/modules/requirements/index-generator.ts` already builds a lightweight requirement index for AI context

The main gap is that requirements currently model tree structure only. They do not express cross-node temporal dependencies, and there is no separate business-path abstraction that can be approved and consumed by the pipeline.

## Architecture Decision

Adopt a dual-model approach:

- `Requirement` remains the source of truth for spatial hierarchy
- `Requirement.dependencies` represents logical prerequisite edges between requirements
- `BusinessFlow` represents a curated temporal path through the requirement graph
- `ai-pipeline` consumes approved flows as an expanded blueprint input

This preserves clean boundaries:

- Tree = ownership and decomposition
- Dependencies = graph edges
- Flow = reviewed execution path
- Pipeline = downstream consumer

## Data Model

### Requirement

Add one field to the shared contract and persistence layer:

```ts
dependencies?: string[]
```

Semantics:

- Stores prerequisite requirement IDs only
- Defaults to an empty array
- Primarily used on `story` nodes, but not artificially restricted by level in the first version
- Must not include the current requirement itself
- Must not create cycles in the per-project dependency graph

### BusinessFlowStep

```ts
export interface BusinessFlowStep {
  sequence: number;
  requirementId: string;
  actionSummary: string;
}
```

### BusinessFlow

```ts
export interface BusinessFlow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  type: 'happy-path' | 'alternate' | 'exception';
  status: 'DRAFT' | 'APPROVED';
  steps: BusinessFlowStep[];
}
```

Deliberately omitted from v1:

- version history
- author/reviewer metadata
- branch/fork semantics
- auto-generated confidence fields
- embedded requirement snapshots

## Database Changes

### Requirements table

Add:

- `dependencies TEXT NOT NULL DEFAULT '[]'`

### Business flows table

Add:

```sql
CREATE TABLE IF NOT EXISTS business_flows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'happy-path',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  steps TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The design intentionally follows existing project conventions:

- TEXT primary keys
- `project_id` foreign key with cascade delete
- JSON arrays stored as TEXT columns

## Backend Module Design

### Requirements module changes

Update these files:

- `shared/contracts/index.ts`
- `server/shared/db/types.ts`
- `server/modules/requirements/schema.ts`
- `server/modules/requirements/mapper.ts`
- `server/modules/requirements/repository.ts`
- `server/modules/requirements/index-generator.ts`

Responsibilities:

- Accept and persist `dependencies`
- Return `dependencies` in API responses
- Include dependency data in the generated requirement index
- Reject invalid graphs when creating or updating requirements

### Business flows module

Add a new module under `server/modules/business-flows/` with the same pattern used elsewhere in the monolith:

- `schema.ts`
- `mapper.ts`
- `repository.ts`
- `index.ts`

Core routes:

- `GET /api/business-flows/by-project/:projectId`
- `POST /api/business-flows`
- `PATCH /api/business-flows/:id`
- `DELETE /api/business-flows/:id`
- `POST /api/business-flows/:id/approve`
- `POST /api/business-flows/:id/unapprove`

### Approval rules

Approving a flow requires:

- `steps.length > 0`
- contiguous `sequence` values
- all referenced requirements exist
- all referenced requirements belong to the same project as the flow
- no duplicate `requirementId` entries in the same flow

The API should reject invalid approval attempts with `400` responses.

## Frontend Design

Add a new feature area:

- `client/features/business-flows/BusinessFlowsPage.tsx`

Add a new top-level tab in navigation, separate from `REQUIREMENTS`.

### Page layout

Left panel:

- list of flows for the current project
- create button
- per-item type and status indicator

Right panel:

- flow metadata editor
- ordered timeline-style step list
- per-step `actionSummary` editor as the primary content
- per-step linked story summary with explicit edit affordance
- per-step acceptance criteria reference section sourced from the linked story
- move up / move down controls
- delete step control
- approve / unapprove action

The page should load both:

- project requirements
- business flows for the same project

The UI should resolve `requirementId` references at render time so users can review the current requirement title and level rather than stale copied text.

The step-card information hierarchy is intentionally action-first:

- `actionSummary` is the main business narrative that AI should prioritize
- linked `story` is a requirement anchor and context reference
- child `ac` items are read-only acceptance references for downstream AI usage

## Pipeline Integration Contract

The pipeline does not own flow data. It reads approved flows and expands them into a prompt-friendly structure.

Recommended blueprint shape:

```ts
interface PipelineBusinessFlowBlueprint {
  id: string;
  name: string;
  type: 'happy-path' | 'alternate' | 'exception';
  steps: Array<{
    sequence: number;
    requirementId: string;
    requirementTitle: string;
    requirementLevel: string;
    actionSummary: string;
    acceptanceCriteria: string[];
  }>;
}
```

Pipeline behavior:

- If approved flows are selected or found for the target scope, build and inject blueprints
- If no approved flows are available, fall back to requirement-tree analysis only
- Pipeline code should consume expanded blueprints, not raw database rows

This keeps the pipeline loosely coupled to storage details and preserves room for a future flow-derivation agent.

## Validation Rules

### Requirement dependency validation

- A requirement cannot depend on itself
- A dependency must reference an existing requirement in the same project
- A dependency update must not create a cycle in the project dependency graph

### Business flow validation

- All steps must reference valid requirements in the same project
- Step sequence must be normalized and contiguous
- Duplicate requirement references are rejected in v1
- `APPROVED` status can only be set through the approval endpoint

## Testing Strategy

### Backend unit tests

- requirement mapper/repository handles `dependencies`
- dependency graph validation rejects self-reference and cycles
- business flow repository serializes and deserializes `steps`
- approval validation rejects missing or invalid steps

### Backend integration tests

- CRUD routes for business flows
- approve and unapprove routes
- requirement updates persist dependency data

### Frontend tests

- business flow list rendering and selection
- step add/remove/reorder interactions
- invalid flows cannot be approved
- requirement title/level display resolves correctly from requirement references

### Pipeline tests

- approved flow rows are expanded into blueprint objects
- blueprint includes requirement title, level, and acceptance criteria
- fallback behavior works when no approved flows exist

## Acceptance Criteria

The design is complete when:

1. Requirements still function as the system of record for hierarchy.
2. Requirements can express non-tree prerequisite edges through `dependencies`.
3. Users can create and approve business flows per project.
4. Approved flows can be transformed into pipeline-ready blueprints.
5. No part of the design requires flow logic to be embedded into the requirement tree UI.
