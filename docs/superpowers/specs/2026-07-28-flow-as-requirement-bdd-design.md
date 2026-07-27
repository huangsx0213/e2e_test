# Flow as Requirement (BDD-aligned) — Design Spec

**Date:** 2026-07-28
**Status:** Approved
**Scope:** Backend + Frontend — unify Business Flows into the Requirement hierarchy
**Approach:** BDD Feature/Scenario model. A flow Story = BDD Feature; its ACs = BDD Scenarios (paths).

## 1. Goal

Eliminate the separate `BusinessFlow` entity by modeling flows within the existing Epic > Story > AC hierarchy. A Story marked as flow (`isFlow: true`) represents one business process (a BDD Feature). Each AC under it represents one path (a BDD Scenario) written in Given/When/Then markdown.

**Success criteria:**
1. `server/modules/business-flows/` and `client/features/business-flows/` are removed
2. AI test gen pipeline reads flow blueprints from requirement hierarchy (flow stories + their AC children)
3. All existing AI test gen capabilities (flow-step coverage tracking, `flowStepRefs`, integration tests) are preserved
4. Existing Business Flows data is migratable to the new model
5. No regression in test generation output

## 2. Data Model

### 2.1 Requirement interface additions

```typescript
interface Requirement {
  // existing fields...
  level: 'epic' | 'story' | 'ac';
  flowType?: 'atomic' | 'flow' | null;   // existing, AC-level

  // NEW – story-level only: marks this story as a business flow (BDD Feature)
  isFlow?: boolean;

  // NEW – AC-level only: functional requirements this scenario involves
  relatedRequirementIds?: string[];
}
```

### 2.2 Validation rules

| Field | Level | Rule |
|-------|-------|------|
| `isFlow` | story | Must be false/null for non-story levels |
| `relatedRequirementIds` | ac | Must be empty for non-AC levels; refs must exist in same project |
| `isFlow` + `dependencies` | story | Flow stories may NOT declare `dependencies` (use AC `relatedRequirementIds` instead) |

### 2.3 Flow concept remapping

| Current Business Flow | New model |
|----------------------|-----------|
| `BusinessFlow.id` | Flow story's `id` |
| `BusinessFlow.name` | Flow story's `title` |
| `BusinessFlow.description` | Flow story's `description` |
| `BusinessFlow.type` ('happy-path'/etc) | Not migrated — a flow Story contains ALL paths as ACs |
| `BusinessFlow.status` ('DRAFT'/'APPROVED') | Flow story's `status` |
| `BusinessFlow.steps[].sequence` | AC's `position` |
| `BusinessFlow.steps[].actionSummary` | AC's `title` |
| `BusinessFlow.steps[].requirementIds` | AC's `relatedRequirementIds` |

### 2.4 Hierarchy example

```
Epic: "Auth System"
  ├── Story: "User Login" (isFlow: true)          ← BDD Feature
  │   ├── AC: "Happy path"    (flowType: flow, relatedRequirementIds: [req-login-ui, req-auth-api])
  │   │   └── description: Given user on login page\nWhen valid credentials\nThen session created
  │   ├── AC: "Invalid password" (flowType: flow, relatedRequirementIds: [req-login-ui])
  │   │   └── description: Given user on login page\nWhen wrong password\nThen error shown
  │   └── AC: "Account locked"  (flowType: flow, relatedRequirementIds: [req-auth-api])
  │       └── description: Given 5 failed attempts\nWhen login attempted\nThen account locked
  │
  └── Story: "Password Reset" (isFlow: false)     ← normal Story
      └── AC: "Reset via email" (flowType: atomic)
          └── description: Given user forgot password...
```

## 3. DB Migration

Add two columns to `requirements` table:

```sql
ALTER TABLE requirements ADD COLUMN is_flow INTEGER DEFAULT 0;
ALTER TABLE requirements ADD COLUMN related_requirement_ids TEXT DEFAULT '[]';
```

Migration file: `007_add_is_flow_and_related_requirements.ts`

### 3.1 Data migration

For each existing BusinessFlow in a project:
1. Create a Story with `isFlow: true`, `title = flow.name`, `description = flow.description`, `status = flow.status`, parent = a "System Flows" epic (created if not exists)
2. For each step in the flow, create an AC under the story with `title = step.actionSummary`, `position = step.sequence`, `relatedRequirementIds = step.requirementIds`, `flowType = 'flow'`

## 4. AI Test Gen Pipeline

### 4.1 Flow loading (orchestrator.ts)

**Current** (L150-156):
```typescript
const allProjectFlows = businessFlowRepo.listByProject(projectId);
const filteredFlows = selectedFlowSet.size > 0
  ? allProjectFlows.filter(f => selectedFlowSet.has(f.id))
  : allProjectFlows;
const businessFlows = buildBusinessFlowBlueprints({ flows: filteredFlows });
```

**New:**
```typescript
const allFlowStories = requirementRepo.listByProject(projectId)
  .filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');
const selectedFlowSet = new Set(params.flowIds || []);
const filteredFlowStories = selectedFlowSet.size > 0
  ? allFlowStories.filter(s => selectedFlowSet.has(s.id))
  : allFlowStories;
const businessFlows = buildBlueprintsFromFlowStories(filteredFlowStories);
```

### 4.2 New converter function

Replace `buildBusinessFlowBlueprints` in `business-flow-blueprint.ts`:

```typescript
function buildBlueprintsFromFlowStories(stories: Requirement[]): PipelineBusinessFlowBlueprint[] {
  return stories.map(story => ({
    id: story.id,
    name: story.title,
    type: 'happy-path',  // flow story contains all paths as ACs; type is default
    steps: requirementRepo.listByProject(story.projectId)
      .filter(r => r.parentId === story.id && r.level === 'ac')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(ac => {
        const requirementIds = ac.relatedRequirementIds ?? [];
        const primaryReqId = requirementIds[0] ?? story.id;
        const primaryReq = primaryReqId ? requirementRepo.get(primaryReqId) : null;
        return {
          sequence: ac.position ?? 0,
          requirementId: primaryReqId,
          requirementIds,
          requirementTitle: primaryReq?.title ?? ac.title,
          requirementLevel: (primaryReq?.level ?? 'story') as any,
          actionSummary: ac.title,
          acceptanceCriteria: [ac.description].filter(Boolean),
        };
      }),
  }));
}
```

### 4.3 Skills

| Skill | Change |
|-------|--------|
| `flow_detail_query` | Query flow story + AC children from `requirementRepo` instead of `businessFlowRepo` |
| `requirement_graph_query` | Find flows via `relatedRequirementIds` on ACs |

### 4.4 Flow selection

`flowIds` parameter remains in pipeline config for backward compat. When provided, it filters which flow stories to use (by story id). When absent, all APPROVED flow stories are used.

## 5. UI Changes

### 5.1 RequirementTree

Flow stories show:
- **Icon**: `GitBranch` icon instead of default story icon
- **Badge**: "Flow" purple badge
- Non-flow stories: unchanged

### 5.2 StoryDetailView

- Header: add "Flow" toggle (sets `isFlow`)
- When `isFlow: true`:
  - Show info banner: "This is a flow story — its ACs are BDD scenarios (Given/When/Then paths)"
  - New ACs default to `flowType: 'flow'`
  - `dependencies` selector disabled (flow stories use AC `relatedRequirementIds`)

### 5.3 ACCard (when parent story `isFlow: true`)

- Add `relatedRequirementIds` multi-select (reuse `DependenciesMultiSelect` pattern, candidates = functional stories/ACs in project)
- Format help tooltip text: "Scenario format: Given / When / Then = one path (happy/alternate/exception)"
- `flowType` segmented control hidden (flow story ACs are always 'flow')
- Given/When/Then warning behavior preserved

### 5.4 ACCard (when parent story not flow)

- Unchanged — atomic/flow toggle + Given/When/Then warning as today

### 5.5 Remove BusinessFlowsPage

- Remove route registration
- Add redirect from old URL to Requirements page
- Remove `client/features/business-flows/` directory

## 6. Deletion: Business Flows Module

After migration and verification:

- Remove `server/modules/business-flows/` (index.ts, schema.ts, repository.ts, validation.ts, mapper.ts, __tests__/)
- Remove `client/features/business-flows/`
- Remove `BusinessFlowsCrudService` from `client/shared/services/api.ts`
- Remove `client/shared/hooks/useBusinessFlowHooks.ts`
- Remove `businessFlows` key from `client/shared/hooks/queryKeys.ts`
- Post-migration: `DROP TABLE IF EXISTS business_flows;`

## 7. Boundaries

### Always do
- Run full test suite after each slice
- Update `flow_detail_query` to work with new model
- Preserve `flowStepRefs` in TestCondition output
- Add `isFlow` and `relatedRequirementIds` to requirement index generator

### Never do
- Delete Business Flows module before migration is verified
- Remove `flow_detail_query` without a replacement
- Break the F8 coverage rule in prompts
- Lose existing Business Flow data during migration

## 8. Implementation Plan

### Slice 0: Schema + DB
- Add `isFlow` and `relatedRequirementIds` to Requirement interface (shared/contracts)
- Write DB migration `007_add_is_flow_and_related_requirements.ts`
- Update Zod schemas (`schema.ts`)
- Update validation (`validation.ts`)
- Update repository + mapper
- Update `requirement_detail_query` to return new fields

### Slice 1: AI Pipeline
- Write `buildBlueprintsFromFlowStories()` in `business-flow-blueprint.ts`
- Update orchestrator to load flows from requirements
- Update `flow_detail_query` to work with requirements
- Update `requirement_graph_query` to find flows via `relatedRequirementIds`
- Update `globalEpicEntry.flowCount` computation
- Update preparation.ts flow filtering

### Slice 2: Data + Migration
- Write data migration script (BusinessFlow → flow Story + AC children)
- Update seed data: add System Flows epic with flow stories
- Remove old `seed-business-flows.ts`

### Slice 3: UI
- Add flow story icon/badge to `RequirementTree`
- Handle `isFlow` toggle in `StoryDetailView`
- Handle `relatedRequirementIds` in `ACCard` (flow story context)
- Update `ACFormatHelpTooltip` context-aware text
- Remove `BusinessFlowsPage` from routes, add redirect

### Slice 4: Cleanup
- Remove Business Flows server module
- Remove Business Flows client files
- Remove Business Flows hooks/API service
- Drop `business_flows` table
- Update tests for removed module
