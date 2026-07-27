# Flow as Requirement (BDD-aligned) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Business Flows into the Epic > Story > AC hierarchy using BDD Feature/Scenario model, eliminating the separate BusinessFlow entity.

**Architecture:** A Story marked `isFlow: true` represents a BDD Feature (one business process). Each AC under it represents a BDD Scenario (one path: happy/alternate/exception) written in Given/When/Then markdown. ACs carry `relatedRequirementIds` for traceability to functional requirements. The AI test gen pipeline loads flow blueprints from flow stories + their AC children instead of `businessFlowRepo`.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, TanStack Query, Zod

---

## File Structure

**Shared contracts:**
- Modify: `shared/contracts/index.ts` — add `isFlow` and `relatedRequirementIds` to Requirement interface

**Server:**
- Modify: `server/shared/db/types.ts` — add `is_flow` and `related_requirement_ids` to `DbRequirementRow`
- Create: `server/migrations/007_add_is_flow_and_related_requirements.ts` — DB migration
- Modify: `server/migrations/index.ts` — register migration 007
- Modify: `server/modules/requirements/schema.ts` — add fields to Zod schema
- Modify: `server/modules/requirements/validation.ts` — add validation for `isFlow` and `relatedRequirementIds`
- Modify: `server/modules/requirements/repository.ts` — persist new fields
- Modify: `server/modules/requirements/mapper.ts` — normalize new fields
- Modify: `server/modules/requirements/index-generator.ts` — include `isFlow` in index
- Modify: `server/modules/ai-test-gen/business-flow-blueprint.ts` — new `buildBlueprintsFromFlowStories()`
- Modify: `server/modules/ai-test-gen/orchestrator.ts` — load flows from requirements
- Modify: `server/modules/ai-test-gen/graph/skills/data-skills.ts` — update `flow_detail_query` and `requirement_graph_query`
- Modify: `server/modules/ai-test-gen/orchestrator.ts` — update `globalEpicEntry.flowCount`

**Client:**
- Modify: `client/features/requirements/RequirementTree.tsx` — flow story icon/badge
- Modify: `client/features/requirements/StoryDetailView.tsx` — isFlow toggle + info banner
- Modify: `client/features/requirements/ACCard.tsx` — relatedRequirementIds multi-select (flow context)
- Modify: `client/features/requirements/ACFormatHelpTooltip.tsx` — context-aware text
- Modify: `client/app/routing/routes.ts` — remove BusinessFlowsPage route, add redirect

**Deletion (Slice 4):**
- Delete: `server/modules/business-flows/` (entire directory)
- Delete: `client/features/business-flows/` (entire directory)
- Delete: `client/shared/hooks/useBusinessFlowHooks.ts`
- Modify: `client/shared/services/api.ts` — remove BusinessFlowsCrudService
- Modify: `client/shared/hooks/queryKeys.ts` — remove businessFlows key
- Delete: `server/seed-data/seed-business-flows.ts`

---

## Task 1: Shared Contracts — Add `isFlow` and `relatedRequirementIds`

**Files:**
- Modify: `shared/contracts/index.ts:445-459` (Requirement interface)

- [ ] **Step 1: Add fields to Requirement interface**

In `shared/contracts/index.ts`, find the Requirement interface (line 445) and add two new fields after `flowType`:

```typescript
export interface Requirement {
  id: string;
  projectId: string;
  parentId?: string | null;
  humanId?: string | null;
  title: string;
  description: string;
  dependencies?: string[];
  level: 'epic' | 'story' | 'ac';
  flowType?: 'atomic' | 'flow' | null;
  status: 'DRAFT' | 'APPROVED' | 'DEPRECATED';
  type?: 'functional' | 'non-functional' | 'security' | 'data';
  position: number;
  // NEW – story-level only: marks this story as a business flow (BDD Feature)
  isFlow?: boolean;
  // NEW – AC-level only: functional requirements this scenario involves
  relatedRequirementIds?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/contracts/index.ts
git commit -m "feat: add isFlow and relatedRequirementIds to Requirement interface"
```

---

## Task 2: DB Migration — Add columns

**Files:**
- Create: `server/migrations/007_add_is_flow_and_related_requirements.ts`
- Modify: `server/shared/db/types.ts:190-203` (DbRequirementRow)
- Modify: `server/migrations/index.ts:13-21` (register migration)

- [ ] **Step 1: Add fields to DbRequirementRow**

In `server/shared/db/types.ts`, find `DbRequirementRow` (line 190) and add two columns:

```typescript
export type DbRequirementRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  dependencies: string;
  level: string;
  status: string;
  position: number;
  human_id: string | null;
  flow_type: string | null;
  type: string | null;
  is_flow: number;
  related_requirement_ids: string;
};
```

- [ ] **Step 2: Create migration file**

Create `server/migrations/007_add_is_flow_and_related_requirements.ts`:

```typescript
import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

/**
 * 007_add_is_flow_and_related_requirements
 *
 * Adds two columns to the requirements table:
 *   - is_flow: marks a story as a business flow (BDD Feature). 0 = false, 1 = true.
 *   - related_requirement_ids: JSON array of requirement IDs an AC scenario involves.
 *
 * These columns replace the separate business_flows table by modeling flows
 * within the existing Epic > Story > AC hierarchy.
 */
export const migration007AddIsFlowAndRelatedRequirements: Migration = {
  id: '007_add_is_flow_and_related_requirements',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;
    const hasIsFlow = reqCols.some((c) => c.name === 'is_flow');
    const hasRelatedReqIds = reqCols.some((c) => c.name === 'related_requirement_ids');

    if (!hasIsFlow) {
      Log.for('migration-007').info('Adding requirements.is_flow column');
      db.exec('ALTER TABLE requirements ADD COLUMN is_flow INTEGER NOT NULL DEFAULT 0');
    }
    if (!hasRelatedReqIds) {
      Log.for('migration-007').info('Adding requirements.related_requirement_ids column');
      db.exec("ALTER TABLE requirements ADD COLUMN related_requirement_ids TEXT NOT NULL DEFAULT '[]'");
    }
  },
};
```

- [ ] **Step 3: Register migration in index.ts**

In `server/migrations/index.ts`, add import and register:

```typescript
import { migration007AddIsFlowAndRelatedRequirements } from './007_add_is_flow_and_related_requirements.ts';

export const migrations: Migration[] = [
  migration000InitialSchema,
  migration001AddTestLevelToNlCases,
  migration002RequirementsHumanIdAndFlowType,
  migration003RemoveFeatureLevel,
  migration004RequirementsTestScenario,
  migration005DropPriorityAndTagsAndInProgress,
  migration006DropMetadataAndTestScenario,
  migration007AddIsFlowAndRelatedRequirements,
];
```

- [ ] **Step 4: Run migrations to verify**

Run: `npx tsx -e "import('./server/migrations/index.ts').then(m => m.runMigrations())"`
Expected: No errors; migration 007 applied.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/007_add_is_flow_and_related_requirements.ts server/migrations/index.ts server/shared/db/types.ts
git commit -m "feat: add DB migration for is_flow and related_requirement_ids"
```

---

## Task 3: Schema + Validation — Zod and validation rules

**Files:**
- Modify: `server/modules/requirements/schema.ts:5-17` (requirementPayloadSchema)
- Modify: `server/modules/requirements/validation.ts:88-104` (add validation functions)

- [ ] **Step 1: Add fields to Zod schema**

In `server/modules/requirements/schema.ts`, add `isFlow` and `relatedRequirementIds` to `requirementPayloadSchema`:

```typescript
export const requirementPayloadSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  humanId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  level: stringEnum(['epic', 'story', 'ac'] as const).optional(),
  flowType: stringEnum(['atomic', 'flow'] as const).nullable().optional(),
  status: stringEnum(['DRAFT', 'APPROVED', 'DEPRECATED'] as const).optional(),
  type: stringEnum(['functional', 'non-functional', 'security', 'data'] as const).optional(),
  position: z.number().optional(),
  isFlow: z.boolean().optional(),
  relatedRequirementIds: z.array(z.string()).optional(),
});
```

- [ ] **Step 2: Add validation function for isFlow**

In `server/modules/requirements/validation.ts`, add after `validateRequirementFlowType`:

```typescript
export function validateRequirementIsFlow(
  requirement: Requirement,
  existingRequirements: Requirement[],
): void {
  if (!requirement.isFlow) {
    return;
  }

  if (requirement.level !== 'story') {
    throw new ValidationError(
      `isFlow may only be set on story-level requirements (got level="${requirement.level}").`,
    );
  }

  // Flow stories must not declare dependencies (use AC relatedRequirementIds instead)
  if (requirement.dependencies && requirement.dependencies.length > 0) {
    throw new ValidationError(
      'Flow stories cannot declare dependencies. Use AC-level relatedRequirementIds instead.',
    );
  }
}

export function validateRelatedRequirementIds(
  requirement: Requirement,
  existingRequirements: Requirement[],
): void {
  const ids = requirement.relatedRequirementIds;
  if (!ids || ids.length === 0) {
    return;
  }

  if (requirement.level !== 'ac') {
    throw new ValidationError(
      `relatedRequirementIds may only be set on AC-level requirements (got level="${requirement.level}").`,
    );
  }

  const requirementIds = new Set(existingRequirements.map((r) => r.id));
  for (const refId of ids) {
    if (!requirementIds.has(refId)) {
      throw new ValidationError(
        `relatedRequirementIds references unknown requirement: ${refId}`,
      );
    }
    if (refId === requirement.id) {
      throw new ValidationError('relatedRequirementIds cannot reference itself.');
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/modules/requirements/schema.ts server/modules/requirements/validation.ts
git commit -m "feat: add Zod schema and validation for isFlow and relatedRequirementIds"
```

---

## Task 4: Repository + Mapper — Persist new fields

**Files:**
- Modify: `server/modules/requirements/repository.ts:36-103` (save + rowToRequirement)
- Modify: `server/modules/requirements/mapper.ts:4-22` (normalizeRequirement)

- [ ] **Step 1: Update mapper to normalize new fields**

In `server/modules/requirements/mapper.ts`, update `normalizeRequirement`:

```typescript
export function normalizeRequirement(input: Partial<Requirement>): Requirement {
  const level = (input.level || 'story') as Requirement['level'];
  const flowType = input.flowType ?? null;
  return {
    id: asId(input.id, 'req'),
    projectId: asText(input.projectId),
    parentId: nullableText(input.parentId) || undefined,
    humanId: nullableText(input.humanId) || null,
    title: asText(input.title, 'New Requirement'),
    description: asText(input.description),
    dependencies: Array.isArray(input.dependencies)
      ? input.dependencies.filter((value): value is string => typeof value === 'string')
      : [],
    level,
    flowType: level === 'ac' ? (flowType as Requirement['flowType']) : null,
    status: (input.status || 'DRAFT') as Requirement['status'],
    type: ((input.type || 'functional') as Requirement['type']),
    position: typeof input.position === 'number' ? input.position : 0,
    isFlow: level === 'story' ? (input.isFlow ?? false) : false,
    relatedRequirementIds: level === 'ac'
      ? (Array.isArray(input.relatedRequirementIds) ? input.relatedRequirementIds.filter((v): v is string => typeof v === 'string') : [])
      : [],
  };
}
```

- [ ] **Step 2: Update repository save() to persist new fields**

In `server/modules/requirements/repository.ts`, update the `save` method (line 36-85). Update the SQL and parameters:

```typescript
  save(record: Partial<Requirement>): Requirement {
    const id = record.id || randomId('req');
    const existing = record.id ? this.get(record.id) : null;
    const normalizedRecord = {
      ...existing,
      ...record,
      id,
      projectId: record.projectId || existing?.projectId || '',
      dependencies: record.dependencies ?? existing?.dependencies ?? [],
    } as Requirement;

    validateRequirementDependencies(normalizedRecord, this.listByProject(normalizedRecord.projectId));
    validateRequirementHumanId(normalizedRecord, this.listByProject(normalizedRecord.projectId));
    validateRequirementFlowType(normalizedRecord);
    validateRequirementIsFlow(normalizedRecord, this.listByProject(normalizedRecord.projectId));
    validateRelatedRequirementIds(normalizedRecord, this.listByProject(normalizedRecord.projectId));

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        dependencies = excluded.dependencies,
        level = excluded.level,
        status = excluded.status,
        position = excluded.position,
        human_id = excluded.human_id,
        flow_type = excluded.flow_type,
        type = excluded.type,
        is_flow = excluded.is_flow,
        related_requirement_ids = excluded.related_requirement_ids,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || existing?.projectId || '',
      record.parentId !== undefined ? (record.parentId || null) : (existing?.parentId || null),
      record.title || existing?.title || '',
      record.description ?? existing?.description ?? '',
      JSON.stringify(record.dependencies ?? existing?.dependencies ?? []),
      record.level || existing?.level || 'story',
      record.status || existing?.status || 'DRAFT',
      record.position ?? existing?.position ?? 0,
      record.humanId !== undefined ? (record.humanId || null) : (existing?.humanId || null),
      record.flowType !== undefined ? (record.flowType || null) : (existing?.flowType || null),
      record.type || existing?.type || 'functional',
      record.isFlow !== undefined ? (record.isFlow ? 1 : 0) : (existing?.isFlow ? 1 : 0),
      JSON.stringify(record.relatedRequirementIds ?? existing?.relatedRequirementIds ?? []),
    );

    const result = this.get(id)!;
    regenerateIndexFile(result.projectId);
    return result;
  }
```

- [ ] **Step 3: Update rowToRequirement to map new fields**

In `server/modules/requirements/repository.ts`, update `rowToRequirement` (line 87-102):

```typescript
  rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      humanId: row.human_id || null,
      title: row.title,
      description: row.description,
      dependencies: JSON.parse(row.dependencies || '[]'),
      level: (row.level || 'story') as Requirement['level'],
      flowType: (row.flow_type as Requirement['flowType']) || null,
      status: row.status as Requirement['status'],
      type: ((row.type || 'functional') as Requirement['type']),
      position: row.position,
      isFlow: row.is_flow === 1,
      relatedRequirementIds: JSON.parse(row.related_requirement_ids || '[]'),
    };
  }
```

- [ ] **Step 4: Update imports in repository.ts**

Add the new validation imports at the top of `server/modules/requirements/repository.ts`:

```typescript
import { validateRequirementDependencies, validateRequirementHumanId, validateRequirementFlowType, validateRequirementIsFlow, validateRelatedRequirementIds } from './validation.ts';
```

- [ ] **Step 5: Run existing tests to verify no regression**

Run: `npx vitest run server/modules/requirements/`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/modules/requirements/repository.ts server/modules/requirements/mapper.ts
git commit -m "feat: persist isFlow and relatedRequirementIds in requirement repository"
```

---

## Task 5: Index Generator — Include isFlow

**Files:**
- Modify: `server/modules/requirements/index-generator.ts:6-17,56-78`

- [ ] **Step 1: Add isFlow to IndexItem**

In `server/modules/requirements/index-generator.ts`, update the `IndexItem` interface:

```typescript
interface IndexItem {
  id: string;
  title: string;
  level: number;
  parent: string | null;
  dependencies: string[];
  summary: string;
  tags: string[];
  testType: string[];
  childCount: number;
  children: string[];
  isFlow: boolean;
}
```

- [ ] **Step 2: Add isFlow to buildRequirementIndex output**

In the same file, update the `buildRequirementIndex` return mapping (line 66-78):

```typescript
  return allReqs.map(r => ({
    id: r.id,
    title: r.title,
    level: computeLevel(r.id, parentMap),
    parent: r.parentId || null,
    dependencies: r.dependencies || [],
    summary: truncate(r.description, 200),
    tags: extractTags(r.title + ' ' + r.description),
    testType: inferTestTypes({ description: r.description }),
    childCount: (childMap.get(r.id) || []).length,
    children: childMap.get(r.id) || [],
    isFlow: r.isFlow ?? false,
  }));
```

- [ ] **Step 3: Commit**

```bash
git add server/modules/requirements/index-generator.ts
git commit -m "feat: include isFlow in requirement index"
```

---

## Task 6: AI Pipeline — New converter and orchestrator changes

**Files:**
- Modify: `server/modules/ai-test-gen/business-flow-blueprint.ts` (replace buildBusinessFlowBlueprints)
- Modify: `server/modules/ai-test-gen/orchestrator.ts:150-157,159-184` (load from requirements)

- [ ] **Step 1: Replace converter function**

Replace the entire content of `server/modules/ai-test-gen/business-flow-blueprint.ts`:

```typescript
import { requirementRepo } from '../requirements/repository.ts';
import type { Requirement, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBlueprintsInput {
  flowStories: Requirement[];
}

export function buildBlueprintsFromFlowStories({ flowStories }: BuildBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  return flowStories.map(story => ({
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

- [ ] **Step 2: Update orchestrator flow loading**

In `server/modules/ai-test-gen/orchestrator.ts`, update lines 150-157. Replace the old flow loading:

```typescript
      // ── Load flow blueprints from requirement hierarchy ──
      const allFlowStories = requirementRepo.listByProject(projectId)
        .filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');
      const selectedFlowSet = new Set(params.flowIds || []);
      const filteredFlowStories = selectedFlowSet.size > 0
        ? allFlowStories.filter(s => selectedFlowSet.has(s.id))
        : allFlowStories;
      const businessFlows = buildBlueprintsFromFlowStories({ flowStories: filteredFlowStories });
      log.info(`Flow stories: ${allFlowStories.length} total, ${filteredFlowStories.length} selected, ${businessFlows.length} blueprints`);
```

- [ ] **Step 3: Update imports in orchestrator**

In `server/modules/ai-test-gen/orchestrator.ts`, replace the old imports:

```typescript
import { buildBlueprintsFromFlowStories } from './business-flow-blueprint.ts';
```

Remove the old `businessFlowRepo` import:
```typescript
// Remove: import { businessFlowRepo } from '../business-flows/repository.ts';
```

- [ ] **Step 4: Update globalEpicEntry flowCount computation**

In `server/modules/ai-test-gen/orchestrator.ts`, find the `epicFlowCount` computation (around line 169-171) and replace:

```typescript
        const epicFlowCount = allFlowStories.filter(s => {
          const storyParent = s.parentId;
          // Check if the flow story is under this epic (directly or via parent chain)
          const storyEpicId = reqEpicMap.get(s.id)?.epicId;
          return storyEpicId === epic.id;
        }).length;
```

Note: `reqEpicMap` is not available at this point in orchestrator. Simpler approach — count flow stories whose parentId matches any child of this epic:

```typescript
        const epicFlowCount = allFlowStories.filter(s =>
          childReqSet.has(s.id) || childReqSet.has(s.parentId || '')
        ).length;
```

- [ ] **Step 5: Update globalStats totalFlows**

In the same file, update `globalStats` (around line 160-164):

```typescript
      const globalStats = {
        totalRequirements: requirements.length,
        totalEpics: epics.length,
        totalFlows: allFlowStories.length,
      };
```

- [ ] **Step 6: Run existing AI test gen tests to verify**

Run: `npx vitest run server/modules/ai-test-gen/`
Expected: Tests may fail if they reference `businessFlowRepo` — fix by mocking or updating test setup.

- [ ] **Step 7: Commit**

```bash
git add server/modules/ai-test-gen/business-flow-blueprint.ts server/modules/ai-test-gen/orchestrator.ts
git commit -m "feat: load flow blueprints from requirement hierarchy"
```

---

## Task 7: AI Pipeline — Update data skills

**Files:**
- Modify: `server/modules/ai-test-gen/graph/skills/data-skills.ts:3,191,226-229,294-352`

- [ ] **Step 1: Remove businessFlowRepo import**

In `server/modules/ai-test-gen/graph/skills/data-skills.ts`, remove line 3:

```typescript
// Remove: import { businessFlowRepo } from '../../../business-flows/repository.ts';
```

- [ ] **Step 2: Update requirement_graph_query — associated flows**

In the same file, find the `requirementGraphQuery` skill (line 163). Replace the `allFlows` and `associatedFlows` logic (lines 191, 226-229):

```typescript
    // === Build graph for each seed ===
    // (Remove: const allFlows = businessFlowRepo.listByProject(projectId);)
    const allFlowStories = requirementRepo.listByProject(projectId)
      .filter(r => r.level === 'story' && r.isFlow);

    const graphEntries: Record<string, unknown> = {};
    const collectedReqIds = new Set<string>(seedIds);
    const collectedFlowIds = new Set<string>();

    for (const seedId of seedIds) {
      const req = requirementRepo.get(seedId);
      if (!req) continue;

      // Parent
      const parent = req.parentId ? requirementRepo.get(req.parentId) : null;
      if (parent) collectedReqIds.add(parent.id);

      // Children
      const children = allReqs.filter((r) => r.parentId === seedId);
      children.forEach((c) => collectedReqIds.add(c.id));

      // Siblings
      const siblings = req.parentId
        ? allReqs.filter((r) => r.parentId === req.parentId && r.id !== seedId)
        : [];
      siblings.forEach((s) => collectedReqIds.add(s.id));

      // Upstream dependencies
      const deps = (req.dependencies || [])
        .filter((depId) => allReqs.some((r) => r.id === depId));
      deps.forEach((d) => collectedReqIds.add(d));

      // Downstream dependents
      const dependents = allReqs.filter((r) => (r.dependencies || []).includes(seedId));
      dependents.forEach((d) => collectedReqIds.add(d.id));

      // Associated flow stories — flows where any AC has this seedId in relatedRequirementIds
      const associatedFlows = allFlowStories.filter(flowStory => {
        const flowACs = allReqs.filter(r => r.parentId === flowStory.id && r.level === 'ac');
        return flowACs.some(ac => (ac.relatedRequirementIds ?? []).includes(seedId));
      });
      associatedFlows.forEach((f) => collectedFlowIds.add(f.id));

      graphEntries[seedId] = {
        seed: { id: req.id, title: req.title, level: req.level },
        parent: parent ? { id: parent.id, title: parent.title, level: parent.level } : null,
        children: children.map((c) => ({ id: c.id, title: c.title, level: c.level })),
        siblings: siblings.map((s) => ({ id: s.id, title: s.title, level: s.level })),
        dependencies: deps,
        dependents: dependents.map((d) => ({ id: d.id, title: d.title, level: d.level })),
        associatedFlows: associatedFlows.map((f) => ({
          id: f.id,
          name: f.title,
          type: 'happy-path',
          matchedSteps: allReqs
            .filter(r => r.parentId === f.id && r.level === 'ac')
            .filter(ac => (ac.relatedRequirementIds ?? []).includes(seedId))
            .map(ac => ({ sequence: ac.position ?? 0, actionSummary: ac.title })),
        })),
      };
    }
```

- [ ] **Step 3: Update flow_detail_query — query from requirements**

In the same file, find `flowDetailQuery` (line 296). Replace the `queryOne` function:

```typescript
    const queryOne = (flowId: string) => {
      const flowStory = requirementRepo.get(flowId);
      if (!flowStory || !flowStory.isFlow) return { error: `Flow ${flowId} not found` };

      const flowACs = requirementRepo
        .listByProject(flowStory.projectId)
        .filter(r => r.parentId === flowId && r.level === 'ac')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const stepsWithDetails = flowACs.map((ac) => ({
        sequence: ac.position ?? 0,
        actionSummary: ac.title,
        requirements: (ac.relatedRequirementIds ?? []).map((reqId) => {
          const req = requirementRepo.get(reqId);
          if (!req) return { id: reqId, title: 'Unknown' };
          const acs = requirementRepo
            .listByProject(req.projectId)
            .filter(r => r.parentId === reqId && r.level === 'ac')
            .map((ac) => ac.title);
          return {
            id: req.id,
            title: req.title,
            level: req.level,
            acceptanceCriteria: acs,
          };
        }),
      }));

      const result = {
        id: flowStory.id,
        name: flowStory.title,
        type: 'happy-path',
        description: flowStory.description,
        steps: stepsWithDetails,
      };
      flowDetailCache.set(flowId, result);
      return result;
    };
```

- [ ] **Step 4: Commit**

```bash
git add server/modules/ai-test-gen/graph/skills/data-skills.ts
git commit -m "feat: update flow_detail_query and requirement_graph_query for flow stories"
```

---

## Task 8: UI — RequirementTree flow story badge

**Files:**
- Modify: `client/features/requirements/RequirementTree.tsx:4,30-33,154-156`

- [ ] **Step 1: Add GitBranch import**

In `client/features/requirements/RequirementTree.tsx`, add `GitBranch` to the lucide-react import (line 4):

```typescript
import {
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  Copy,
  ClipboardPaste,
  GitBranch,
} from "lucide-react";
```

- [ ] **Step 2: Add flow badge for flow stories**

In the same file, after the level dot (line 154-156), add flow badge before the title:

```typescript
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${levelDotColors[r.level as keyof typeof levelDotColors]}`}
              />
              {r.level === "story" && r.isFlow && (
                <>
                  <GitBranch size={11} className="text-purple-500 shrink-0" />
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 uppercase tracking-wider shrink-0">
                    Flow
                  </span>
                </>
              )}
```

- [ ] **Step 3: Commit**

```bash
git add client/features/requirements/RequirementTree.tsx
git commit -m "feat: add flow story badge in RequirementTree"
```

---

## Task 9: UI — StoryDetailView isFlow toggle

**Files:**
- Modify: `client/features/requirements/StoryDetailView.tsx:121-141,163-183,247-308`

- [ ] **Step 1: Add isFlow state**

In `client/features/requirements/StoryDetailView.tsx`, add `isFlow` state after the `dependencies` state (around line 129):

```typescript
  const [isFlow, setIsFlow] = useState<boolean>(story.isFlow ?? false);
```

And in the useEffect (around line 132-141), add:

```typescript
    setIsFlow(story.isFlow ?? false);
```

- [ ] **Step 2: Update handleSave to include isFlow**

In the same file, update `handleSave` (line 163-183):

```typescript
  const handleSave = async () => {
    if (!title.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await update(story.id, {
        title,
        description,
        humanId: humanId || null,
        status,
        type,
        dependencies,
        isFlow,
      });
      setSaveStatus("success");
      setMode("preview");
      setTimeout(() => setSaveStatus("idle"), 2000);
      onSaved();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };
```

- [ ] **Step 3: Add isFlow toggle in the header**

In the same file, in the metadata row (around line 247-308), add an isFlow toggle before the Dependencies selector:

```typescript
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Flow
            </label>
            <button
              type="button"
              onClick={() => setIsFlow(!isFlow)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isFlow ? "bg-purple-500" : "bg-slate-300"
              }`}
              aria-pressed={isFlow}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isFlow ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>
```

- [ ] **Step 4: Add info banner when isFlow is true**

In the same file, after the header section (before the description section), add:

```typescript
      {isFlow && (
        <div className="mx-auto max-w-5xl px-8 py-2">
          <div className="px-3 py-2 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-xs flex items-center gap-2">
            <GitBranch size={14} />
            <span>This is a flow story — its ACs are BDD scenarios (Given/When/Then paths).</span>
          </div>
        </div>
      )}
```

Also add `GitBranch` to the imports at the top of the file.

- [ ] **Step 5: Disable dependencies selector when isFlow**

In the Dependencies section, wrap the `DependenciesMultiSelect` with a disabled state:

```typescript
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Dependencies
            </label>
            {isFlow ? (
              <span className="text-[11px] text-slate-400 italic">
                Flow stories use AC-level relatedRequirementIds instead
              </span>
            ) : (
              <DependenciesMultiSelect
                story={story}
                knownHumanIds={dependencyCandidates}
                selected={dependencies}
                onChange={setDependencies}
              />
            )}
          </div>
```

- [ ] **Step 6: Commit**

```bash
git add client/features/requirements/StoryDetailView.tsx
git commit -m "feat: add isFlow toggle and info banner in StoryDetailView"
```

---

## Task 10: UI — ACCard relatedRequirementIds multi-select

**Files:**
- Modify: `client/features/requirements/ACCard.tsx:33-47,106-153`

- [ ] **Step 1: Add parentStoryIsFlow prop**

In `client/features/requirements/ACCard.tsx`, update the Props interface (line 11-17):

```typescript
interface Props {
  ac: Requirement;
  index: number;
  parentStoryId: string;
  parentStoryIsFlow: boolean;
  projectId: string;
  onSaved: (ac: Requirement) => void;
}
```

Update the component signature (line 33):

```typescript
export function ACCard({ ac, index, parentStoryIsFlow, projectId, onSaved }: Props) {
```

- [ ] **Step 2: Add relatedRequirementIds state**

After the `flowType` state (line 36), add:

```typescript
  const [relatedRequirementIds, setRelatedRequirementIds] = useState<string[]>(ac.relatedRequirementIds || []);
```

In the useEffect (line 42-47), add:

```typescript
    setRelatedRequirementIds(ac.relatedRequirementIds || []);
```

- [ ] **Step 3: Add relatedRequirementIds candidates**

After the `parsed` variable (line 49), add candidates lookup:

```typescript
  const { data: allItems = [] } = useRequirements(projectId);
  const relatedReqCandidates = useMemo(() => {
    return allItems
      .filter(r => r.id !== ac.id && (r.level === 'story' || r.level === 'ac'))
      .map(r => ({ humanId: r.humanId || r.id, title: r.title, id: r.id }));
  }, [allItems, ac.id]);
```

Add necessary imports at top of file:

```typescript
import { useRequirements } from "../../shared/hooks/useQueryHooks";
import { useMemo } from "react";
```

- [ ] **Step 4: Update handleSave to include relatedRequirementIds**

Update `handleSave` (line 53-66):

```typescript
  const handleSave = async () => {
    if (saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await update(ac.id, {
        description,
        flowType: parentStoryIsFlow ? "flow" : flowType,
        status,
        relatedRequirementIds: parentStoryIsFlow ? relatedRequirementIds : undefined,
      });
      setMode("preview");
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      onSaved({ ...ac, description, flowType: parentStoryIsFlow ? "flow" : flowType, status, relatedRequirementIds });
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };
```

- [ ] **Step 5: Hide flowType toggle when parentStoryIsFlow**

In the header section (line 120-151), wrap the flowType toggle with a condition:

```typescript
        {/* Segmented control for Atomic / Flow — hidden when parent is flow story */}
        {!parentStoryIsFlow && (
          <div
            role="group"
            aria-label="Flow type"
            className="inline-flex items-stretch rounded-md border border-slate-200 overflow-hidden bg-slate-50"
          >
            {/* ... existing atomic/flow buttons ... */}
          </div>
        )}
        {parentStoryIsFlow && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Scenario
          </span>
        )}
```

- [ ] **Step 6: Add relatedRequirementIds selector when parentStoryIsFlow**

After the format help tooltip (line 153), add the relatedRequirements selector:

```typescript
        {parentStoryIsFlow && (
          <RelatedRequirementsMultiSelect
            selected={relatedRequirementIds}
            candidates={relatedReqCandidates}
            onChange={setRelatedRequirementIds}
          />
        )}
```

Add the `RelatedRequirementsMultiSelect` component at the end of the file (before the export or as a separate component in the same file). Reuse the same pattern as `DependenciesMultiSelect` from StoryDetailView:

```typescript
function RelatedRequirementsMultiSelect({
  selected,
  candidates,
  onChange,
}: {
  selected: string[];
  candidates: { humanId: string; title: string; id: string }[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Link2 size={11} className="text-slate-400" />
        {selected.length === 0 ? (
          <span className="text-slate-400">No related requirements</span>
        ) : (
          <span className="font-mono">{selected.length} linked</span>
        )}
        <ChevronDown size={11} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-1.5"
        >
          {candidates.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-slate-400 text-center">
              No other requirements in this project
            </div>
          ) : (
            candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] font-semibold text-slate-700">{c.humanId}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.title}</div>
                </div>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

Add necessary imports: `Link2`, `ChevronDown`, `useRef` from lucide-react and react.

- [ ] **Step 7: Update ACList to pass parentStoryIsFlow**

Find `client/features/requirements/ACList.tsx` and update it to pass `parentStoryIsFlow` to each `ACCard`. The `ACList` component receives `acs` and `parentStoryId` — it needs to also receive or look up the parent story's `isFlow`:

```typescript
interface ACListProps {
  acs: Requirement[];
  parentStoryId: string;
  parentStoryIsFlow: boolean;
  projectId: string;
  onSaved: () => void;
}
```

And pass it to each `ACCard`:

```typescript
<ACCard
  key={ac.id}
  ac={ac}
  index={index}
  parentStoryId={parentStoryId}
  parentStoryIsFlow={parentStoryIsFlow}
  projectId={projectId}
  onSaved={onSaved}
/>
```

Then in `StoryDetailView.tsx`, update the ACList usage (line 371):

```typescript
<ACList acs={acs} parentStoryId={story.id} parentStoryIsFlow={isFlow} projectId={projectId} onSaved={onSaved} />
```

- [ ] **Step 8: Commit**

```bash
git add client/features/requirements/ACCard.tsx client/features/requirements/ACList.tsx client/features/requirements/StoryDetailView.tsx
git commit -m "feat: add relatedRequirementIds multi-select in ACCard for flow stories"
```

---

## Task 11: UI — ACFormatHelpTooltip context-aware text

**Files:**
- Modify: `client/features/requirements/ACFormatHelpTooltip.tsx`

- [ ] **Step 1: Make tooltip accept isFlow prop**

Update `client/features/requirements/ACFormatHelpTooltip.tsx`:

```typescript
import React from "react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";

export function ACFormatHelpTooltip({ isFlow = false }: { isFlow?: boolean }) {
  const content = isFlow ? (
    <div className="space-y-1.5">
      <div className="font-semibold">Scenario format (recommended):</div>
      <div className="font-mono text-[11px] leading-relaxed">
        <div>Given &lt;precondition&gt;</div>
        <div>When &lt;action&gt;</div>
        <div>Then &lt;observable result&gt;</div>
      </div>
      <div className="text-slate-300 text-[10.5px] pt-1 border-t border-slate-600 mt-1.5">
        Each AC = one path (happy/alternate/exception).
        A soft warning appears if no segments are detected.
      </div>
    </div>
  ) : (
    <div className="space-y-1.5">
      <div className="font-semibold">AC format (recommended):</div>
      <div className="font-mono text-[11px] leading-relaxed">
        <div>Given &lt;precondition&gt;</div>
        <div>When &lt;action&gt;</div>
        <div>Then &lt;observable result&gt;</div>
      </div>
      <div className="text-slate-300 text-[10.5px] pt-1 border-t border-slate-600 mt-1.5">
        Checklists, free-form prose, and plain Markdown are also supported.
        A soft warning appears if no segments are detected.
      </div>
    </div>
  );
  return <HelpTooltip content={content} maxWidthClass="max-w-xs" />;
}
```

- [ ] **Step 2: Pass isFlow prop in ACCard**

In `client/features/requirements/ACCard.tsx`, update the tooltip usage:

```typescript
        <ACFormatHelpTooltip isFlow={parentStoryIsFlow} />
```

- [ ] **Step 3: Commit**

```bash
git add client/features/requirements/ACFormatHelpTooltip.tsx client/features/requirements/ACCard.tsx
git commit -m "feat: context-aware AC format tooltip for flow scenarios"
```

---

## Task 12: UI — Remove BusinessFlowsPage route

**Files:**
- Modify: `client/app/routing/routes.ts:16,121-123`

- [ ] **Step 1: Remove BusinessFlowsPage import and route**

In `client/app/routing/routes.ts`, remove line 16:

```typescript
// Remove: import { BusinessFlowsPage } from '@/features/business-flows/BusinessFlowsPage';
```

Remove lines 121-123:

```typescript
// Remove:
// registerRoute('BUSINESS_FLOWS', BusinessFlowsPage, (ctx) => ({
//   currentProjectId: ctx.currentProjectId,
// }));
```

Add a redirect instead (if the router supports it). If not, simply removing the route is sufficient — navigating to the old URL will show a 404 or default page.

- [ ] **Step 2: Commit**

```bash
git add client/app/routing/routes.ts
git commit -m "feat: remove BusinessFlowsPage route registration"
```

---

## Task 13: Data Migration — Convert existing BusinessFlows

**Files:**
- Create: `server/migrations/008_migrate_business_flows_to_requirements.ts`
- Modify: `server/migrations/index.ts`

- [ ] **Step 1: Create data migration**

Create `server/migrations/008_migrate_business_flows_to_requirements.ts`:

```typescript
import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

/**
 * 008_migrate_business_flows_to_requirements
 *
 * Migrates existing BusinessFlow records into the requirement hierarchy:
 *   - Creates a "System Flows" epic per project (if flows exist)
 *   - For each BusinessFlow, creates a flow Story (isFlow=true) under the epic
 *   - For each step, creates an AC with relatedRequirementIds
 */
export const migration008MigrateBusinessFlows: Migration = {
  id: '008_migrate_business_flows_to_requirements',
  up: () => {
    // Check if business_flows table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='business_flows'"
    ).get();

    if (!tableExists) {
      Log.for('migration-008').info('business_flows table not found, skipping migration');
      return;
    }

    const flows = db.prepare('SELECT * FROM business_flows').all() as any[];
    if (flows.length === 0) {
      Log.for('migration-008').info('No business flows to migrate');
      return;
    }

    const { randomId } = require('../shared/utils/index.ts');
    const projectsWithFlows = new Set(flows.map(f => f.project_id));

    for (const projectId of projectsWithFlows) {
      // Create "System Flows" epic if not exists
      const existingEpic = db.prepare(
        "SELECT id FROM requirements WHERE project_id = ? AND title = 'System Flows' AND level = 'epic'"
      ).get(projectId);

      let epicId: string;
      if (existingEpic) {
        epicId = existingEpic.id;
      } else {
        epicId = randomId('req');
        db.prepare(`
          INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
          VALUES (?, ?, NULL, 'System Flows', 'Auto-created epic for migrated business flows', '[]', 'epic', 'APPROVED', 0, 'FLOW-0', NULL, 'functional', 0, '[]')
        `).run(epicId, projectId);
        Log.for('migration-008').info(`Created System Flows epic for project ${projectId}`);
      }

      // Migrate each flow
      const projectFlows = flows.filter(f => f.project_id === projectId);
      let position = 0;
      for (const flow of projectFlows) {
        // Create flow story
        const storyId = flow.id; // Preserve original ID
        const existingStory = db.prepare('SELECT id FROM requirements WHERE id = ?').get(storyId);
        if (existingStory) {
          Log.for('migration-008').info(`Flow story ${storyId} already exists, skipping`);
          continue;
        }

        db.prepare(`
          INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
          VALUES (?, ?, ?, ?, ?, '[]', 'story', ?, ?, NULL, NULL, 'functional', 1, '[]')
        `).run(
          storyId,
          projectId,
          epicId,
          flow.name,
          flow.description || '',
          flow.status || 'DRAFT',
          position++,
        );

        // Create AC for each step
        const steps = JSON.parse(flow.steps || '[]');
        for (const step of steps) {
          const acId = randomId('req');
          const requirementIds = JSON.stringify(step.requirementIds || []);
          db.prepare(`
            INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
            VALUES (?, ?, ?, ?, '', '[]', 'ac', 'DRAFT', ?, NULL, 'flow', 'functional', 0, ?)
          `).run(
            acId,
            projectId,
            storyId,
            step.actionSummary || `Step ${step.sequence}`,
            step.sequence || 0,
            requirementIds,
          );
        }

        Log.for('migration-008').info(`Migrated flow ${flow.name} (${steps.length} steps)`);
      }
    }

    Log.for('migration-008').info(`Migration complete: ${flows.length} flows migrated`);
  },
};
```

- [ ] **Step 2: Register migration in index.ts**

In `server/migrations/index.ts`, add:

```typescript
import { migration008MigrateBusinessFlows } from './008_migrate_business_flows_to_requirements.ts';

export const migrations: Migration[] = [
  // ... existing ...
  migration007AddIsFlowAndRelatedRequirements,
  migration008MigrateBusinessFlows,
];
```

- [ ] **Step 3: Run migrations to verify**

Run: `npx tsx -e "import('./server/migrations/index.ts').then(m => m.runMigrations())"`
Expected: Migration 008 runs, existing flows migrated to requirements.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/008_migrate_business_flows_to_requirements.ts server/migrations/index.ts
git commit -m "feat: add data migration from business_flows to requirements"
```

---

## Task 14: Seed Data — Update for flow stories

**Files:**
- Modify: `server/seed-data/seed-business-flows.ts` (convert to flow stories in requirements)
- Or: Create `server/seed-data/seed-flow-stories.ts` and update `server/seed.ts`

- [ ] **Step 1: Update seed-business-flows.ts to seed flow stories as requirements**

Replace the content of `server/seed-data/seed-business-flows.ts` to save flow stories as requirements entities instead of business_flow entities. For each flow, create a Story with `isFlow: true` and AC children for each step:

```typescript
import { Log } from '../shared/services/logger';
import { requirementRepo } from '../modules/requirements/repository.ts';
import type { Requirement } from '../../shared/contracts/index.ts';

const AUT_PROJECT_ID = 'p-aut-demo';
const FLOWS_EPIC_ID = 'req-aut-flows-epic';

interface SeedFlow {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'APPROVED';
  steps: { sequence: number; requirementIds: string[]; actionSummary: string }[];
}

const flows: SeedFlow[] = [
  // ... copy the flow definitions from the existing file, keeping the same data ...
  // (Keep the same flow objects but without BusinessFlow type)
];

export function seedBusinessFlows(): void {
  // Ensure the System Flows epic exists
  const existingEpic = requirementRepo.get(FLOWS_EPIC_ID);
  if (!existingEpic) {
    requirementRepo.save({
      id: FLOWS_EPIC_ID,
      projectId: AUT_PROJECT_ID,
      parentId: null,
      title: 'System Flows',
      description: 'Business flow scenarios (BDD Features)',
      level: 'epic',
      status: 'APPROVED',
      humanId: 'FLOW-0',
      position: 999,
      isFlow: false,
    } as Requirement);
  }

  let count = 0;
  for (const flow of flows) {
    const existing = requirementRepo.get(flow.id);
    if (existing) continue;

    // Create flow story
    requirementRepo.save({
      id: flow.id,
      projectId: AUT_PROJECT_ID,
      parentId: FLOWS_EPIC_ID,
      title: flow.name,
      description: flow.description,
      level: 'story',
      status: flow.status,
      position: count,
      isFlow: true,
      dependencies: [],
    } as Requirement);

    // Create AC for each step
    for (const step of flow.steps) {
      requirementRepo.save({
        projectId: AUT_PROJECT_ID,
        parentId: flow.id,
        title: step.actionSummary,
        description: '',
        level: 'ac',
        status: 'APPROVED',
        position: step.sequence,
        flowType: 'flow',
        relatedRequirementIds: step.requirementIds,
      } as Requirement);
    }
    count++;
  }

  if (count > 0) {
    Log.for('seed').info(`Seeded ${count} new flow stories (skipped ${flows.length - count} existing).`);
  } else {
    Log.for('seed').info(`All ${flows.length} flow stories already exist, skipped.`);
  }
}

// Allow running directly
import path from 'node:path';
if (import.meta.url.endsWith(path.basename(process.argv[1]!))) {
  const { runMigrations } = await import('../migrations/index.ts');
  runMigrations();
  seedBusinessFlows();
}
```

Note: Copy the actual flow data from the existing file — only the save mechanism changes.

- [ ] **Step 2: Call seedBusinessFlows from seed.ts**

In `server/seed.ts`, add import and call after `seedBusinessConfig()`:

```typescript
import { seedBusinessFlows } from './seed-data/seed-business-flows.ts';

// In seedDefaults():
export function seedDefaults(): void {
  clearAllData();
  seedBusinessConfig();
  seedBusinessFlows();
  Log.for('seed').info('Database reset and business config seed data applied!');
}
```

- [ ] **Step 3: Commit**

```bash
git add server/seed-data/seed-business-flows.ts server/seed.ts
git commit -m "feat: seed flow stories as requirements instead of business_flows"
```

---

## Task 15: Cleanup — Remove Business Flows module

**Files:**
- Delete: `server/modules/business-flows/` (entire directory)
- Delete: `client/features/business-flows/` (entire directory)
- Delete: `client/shared/hooks/useBusinessFlowHooks.ts`
- Modify: `client/shared/services/api.ts` (remove BusinessFlows service)
- Modify: `client/shared/hooks/queryKeys.ts` (remove businessFlows key)

- [ ] **Step 1: Remove server business-flows module**

Delete the entire directory: `server/modules/business-flows/`

- [ ] **Step 2: Remove client business-flows feature**

Delete the entire directory: `client/features/business-flows/`

- [ ] **Step 3: Remove client hooks**

Delete: `client/shared/hooks/useBusinessFlowHooks.ts`

- [ ] **Step 4: Remove BusinessFlows from API service**

In `client/shared/services/api.ts`, remove the `BusinessFlow` import, the `businessFlows` service object (lines ~125-129), and any related types.

- [ ] **Step 5: Remove businessFlows from queryKeys**

In `client/shared/hooks/queryKeys.ts`, remove line 13:

```typescript
// Remove: businessFlows: ['business-flows'] as const,
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors (fix any remaining references to removed modules).

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (update tests that reference business-flows module).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove Business Flows module (unified into requirements)"
```

---

## Task 16: Final — Run full test suite and verify

- [ ] **Step 1: Run migrations**

Run: `npx tsx -e "import('./server/migrations/index.ts').then(m => m.runMigrations())"`
Expected: All migrations apply successfully.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Start dev server and smoke test**

Run: `npm run dev`

Verify:
- Requirements page loads, tree shows flow stories with purple Flow badge
- Clicking a flow story shows the isFlow toggle (on) and info banner
- Flow story ACs show "Scenario" badge instead of Atomic/Flow toggle
- Flow story ACs show relatedRequirementIds multi-select
- Non-flow stories look unchanged
- Old Business Flows URL redirects or shows 404 (no crash)

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "test: verify flow-as-requirement integration"
```
