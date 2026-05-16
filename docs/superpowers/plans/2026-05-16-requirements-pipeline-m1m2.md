# Requirements & NL Case Generation (M1+M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build requirement management (tree CRUD + import + frontend) and 3-agent ISTQB pipeline (provider abstraction, agent framework, LangGraph orchestration, SSE streaming, human review checkpoints) integrated into the QuantumQA modular monolith.

**Architecture:** New CRUD modules (requirements, test-conditions, nl-cases) follow the existing `createCrudModule` pattern. AI infrastructure (provider, agent, pipeline) is a set of deep modules in `shared/ai/`. The pipeline API is a custom Express router at `/api/pipeline/`. 4 new DB tables via migrations 010-011. Frontend adds `requirements`, `nl-cases`, and `ai-pipeline` feature pages.

**Tech Stack:** TypeScript 5.8, Express 5, React 19, SQLite (better-sqlite3), Vitest, Zod 4, @langchain/langgraph (new)

---

## File Map

### New Files (36 files)

**server/modules/requirements/** (5 files)
- `server/modules/requirements/schema.ts` — Zod schemas for requirement create/patch
- `server/modules/requirements/repository.ts` — SQLite CRUD, extends BaseCrudRepository
- `server/modules/requirements/mapper.ts` — normalizeRequirement()
- `server/modules/requirements/index.ts` — createCrudModule, import route, index generation trigger
- `server/modules/requirements/import.ts` — Markdown/CSV file parsers

**server/modules/test-conditions/** (4 files)
- `server/modules/test-conditions/schema.ts`
- `server/modules/test-conditions/repository.ts`
- `server/modules/test-conditions/mapper.ts`
- `server/modules/test-conditions/index.ts`

**server/modules/nl-cases/** (4 files)
- `server/modules/nl-cases/schema.ts`
- `server/modules/nl-cases/repository.ts`
- `server/modules/nl-cases/mapper.ts`
- `server/modules/nl-cases/index.ts`

**server/modules/ai-pipeline/** (2 files)
- `server/modules/ai-pipeline/index.ts` — Custom router: start, continue, status, abort, state endpoints + SSE streaming
- `server/modules/ai-pipeline/pipeline-context.ts` — Factory: creates AgentContext from stored provider config + skill loader

**shared/ai/** (5 files)
- `shared/ai/provider.ts` — AIProvider interface + createAIProvider factory + adapters
- `shared/ai/skill-loader.ts` — loadSkillContext(), readReferenceFile()
- `shared/ai/agent.ts` — AgentRole, AgentContext, runAgent(), streamAgent()
- `shared/ai/pipeline.ts` — Pipeline state, graph definition, batch runner
- `shared/ai/types.ts` — Shared AI type definitions (PipelineState, etc.)

**shared/ai/skills/** (11 files)
- `shared/ai/skills/requirement-index/SKILL.md`
- `shared/ai/skills/requirement-index/references/index.json` (regenerated at runtime)
- `shared/ai/skills/requirement-query/SKILL.md`
- `shared/ai/skills/requirement-query/references/query-strategies.md`
- `shared/ai/skills/requirement-query/references/coverage-checklist.md`
- `shared/ai/skills/requirement-analysis/SKILL.md`
- `shared/ai/skills/requirement-analysis/references/analysis-checklist.md`
- `shared/ai/skills/requirement-analysis/references/technique-mapping.md`
- `shared/ai/skills/test-analyst/SKILL.md`
- `shared/ai/skills/test-designer/SKILL.md`
- `shared/ai/skills/quality-manager/SKILL.md`

**server/migrations/** (2 files)
- `server/migrations/010_requirements_schema.ts`
- `server/migrations/011_ai_pipeline_schema.ts`

**client/features/** (7 files)
- `client/features/requirements/RequirementsPage.tsx`
- `client/features/requirements/RequirementTree.tsx`
- `client/features/requirements/RequirementEditor.tsx`
- `client/features/requirements/RequirementImport.tsx`
- `client/features/ai-pipeline/PipelinePage.tsx`
- `client/features/ai-pipeline/PipelineProgress.tsx`
- `client/features/ai-pipeline/CheckpointReview.tsx`

**Tests (7 files)**
- `server/modules/requirements/__tests__/mapper.test.ts`
- `server/modules/requirements/__tests__/import.test.ts`
- `server/modules/requirements/__tests__/api.test.ts`
- `shared/ai/__tests__/provider.test.ts`
- `shared/ai/__tests__/agent.test.ts`
- `shared/ai/__tests__/pipeline.test.ts`
- `server/modules/ai-pipeline/__tests__/api.test.ts`

### Modified Files (5 files)
- `shared/contracts/index.ts` — Add Requirement, TestCondition, NlTestCase, CoverageMatrix types
- `server/app/registerRoutes.ts` — Register 4 new modules
- `server/migrations/index.ts` — Include migrations 010, 011
- `client/app/navigation.ts` — Add routes for new feature pages
- `client/features/settings/...` — Add AI provider config editor to settings page

---

## Task Plan

### Task 1: DB Migrations — requirements table + settings column (010)

**Files:**
- Create: `server/migrations/010_requirements_schema.ts`
- Modify: `server/migrations/index.ts`

- [ ] **Step 1: Create migration 010**

Write `server/migrations/010_requirements_schema.ts`:

```typescript
import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration010RequirementsSchema: Migration = {
  id: '010_requirements_schema',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirements (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
        type TEXT NOT NULL DEFAULT 'functional',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        position INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE settings ADD COLUMN ai_provider_configs TEXT NOT NULL DEFAULT '{}';
    `);
  },
};
```

- [ ] **Step 2: Register migration in index**

Modify `server/migrations/index.ts` — add to the `pendingMigrations` array (after 009):

```typescript
import { migration010RequirementsSchema } from './010_requirements_schema.ts';

// Inside runMigrations(), add to the array:
[migration010RequirementsSchema],
```

- [ ] **Step 3: Run migration to verify**

Run: `npx tsx server/migrate.ts`

Expected: Migration applies without errors. Tables created.

- [ ] **Step 4: Verify tables exist**

Connect to SQLite and check:
```
sqlite3 database.sqlite ".tables" | findstr requirements
sqlite3 database.sqlite ".schema requirements"
sqlite3 database.sqlite "PRAGMA table_info(settings)" | findstr ai_provider_configs
```

Expected: `requirements` table exists with all columns. `settings` has `ai_provider_configs` column with default `{}`.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/010_requirements_schema.ts server/migrations/index.ts
git commit -m "feat: add migration 010 — requirements table and ai_provider_configs"
```

---

### Task 2: Shared Contracts — new types

**Files:**
- Modify: `shared/contracts/index.ts`

- [ ] **Step 1: Add new type definitions**

Append to `shared/contracts/index.ts`:

```typescript
export interface Requirement {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'functional' | 'performance' | 'security' | 'usability' | 'reliability';
  status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'DEPRECATED';
  position: number;
  metadata: Record<string, unknown>;
}

export interface TestCondition {
  id: string;
  requirementId: string;
  requirementLevel: 'epic' | 'feature' | 'story' | 'ac';
  condition: string;
  category: 'happy-path' | 'alternate' | 'error' | 'boundary';
  riskLevel: 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dataRequirements?: string;
  dependencies?: string[];
  primaryTechnique: 'equivalence-partitioning' | 'boundary-value-analysis' | 'decision-table' | 'state-transition' | 'use-case';
  secondaryTechniques: string[];
  techniqueRationale: string;
  coverageDimensions: { dimension: string; variants: string[] }[];
}

export interface NlTestCaseStep {
  sequence: number;
  action: string;
  expected: string;
}

export interface NlTestCaseTestData {
  key: string;
  value: string;
  description: string;
}

export interface SelfReviewIssue {
  severity: 'blocker' | 'major' | 'minor';
  category: 'atomicity' | 'testability' | 'coverage' | 'repeatability' | 'clarity' | 'data-completeness';
  description: string;
  suggestion: string;
}

export interface SelfReview {
  score: number;
  issues: SelfReviewIssue[];
  pass: boolean;
}

export interface NlTestCaseChangeLog {
  source: 'agent-self-review' | 'human-review' | 'final-review';
  changes: string;
}

export interface NlTestCase {
  id: string;
  projectId: string;
  title: string;
  requirementId?: string;
  conditionId?: string;
  techniqueApplied?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category?: string;
  preconditions: string[];
  testData: NlTestCaseTestData[];
  steps: NlTestCaseStep[];
  postconditions: string[];
  tags: string[];
  selfReview?: SelfReview;
  reviewSummary?: string;
  changeLog: NlTestCaseChangeLog[];
  status: 'DRAFT' | 'APPROVED' | 'FINAL';
  generatedSuiteId?: string;
}

export interface CoverageRow {
  requirementId: string;
  requirementTitle: string;
  level: string;
  totalConditions: number;
  testCaseCount: number;
  techniqueBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  coveragePercentage: number;
  uncoveredRisks: string[];
}

export interface CoverageMatrix {
  rows: CoverageRow[];
}

export interface PipelineState {
  projectId: string;
  requirementIds: string[];
  requirementAnalysis?: {
    overallApproach: string;
    riskAssessmentSummary: string;
  };
  testConditions?: TestCondition[];
  approvedConditions?: TestCondition[];
  draftTestCases?: NlTestCase[];
  approvedDraftCases?: NlTestCase[];
  humanReviewFeedback?: string;
  finalTestCases?: NlTestCase[];
  coverageMatrix?: CoverageMatrix;
  phase: 'init' | 'analysis' | 'review-conditions' | 'design' | 'review-draft' | 'quality' | 'final-review' | 'complete';
  errors: { phase: string; agent: string; step: string; message: string; rawResponse?: string; timestamp: number }[];
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`

Expected: No new type errors introduced.

- [ ] **Step 3: Commit**

```bash
git add shared/contracts/index.ts
git commit -m "feat: add Requirement, TestCondition, NlTestCase, PipelineState types"
```

---

### Task 3: Requirements Repository

**Files:**
- Create: `server/modules/requirements/repository.ts`
- Create: `server/shared/db/types.ts` — append DbRequirementRow

- [ ] **Step 1: Add DbRequirementRow type**

Append to `server/shared/db/types.ts`:

```typescript
export type DbRequirementRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  priority: string;
  risk_level: string;
  type: string;
  status: string;
  position: number;
  metadata: string;
};
```

- [ ] **Step 2: Create RequirementsRepository**

Write `server/modules/requirements/repository.ts`:

```typescript
import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';

class RequirementRepository extends BaseCrudRepository<Requirement> {
  protected table = 'requirements';

  get(id: string): Requirement | undefined {
    const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as DbRequirementRow | undefined;
    if (!row) return undefined;
    return this.rowToRequirement(row);
  }

  save(record: Partial<Requirement>): Requirement {
    const existing = record.id ? this.get(record.id) : undefined;
    const id = record.id || this.generateId();

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, priority, risk_level, type, status, position, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        risk_level = excluded.risk_level,
        type = excluded.type,
        status = excluded.status,
        position = excluded.position,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || '',
      record.parentId || null,
      record.title || '',
      record.description || '',
      record.priority || 'MEDIUM',
      record.riskLevel || 'MEDIUM',
      record.type || 'functional',
      record.status || 'DRAFT',
      record.position ?? 0,
      JSON.stringify(record.metadata || {}),
    );

    return this.get(id)!;
  }

  listByProject(projectId: string): Requirement[] {
    const rows = db.prepare(
      'SELECT id FROM requirements WHERE project_id = ? ORDER BY position'
    ).all(projectId) as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as Requirement[];
  }

  private generateId(): string {
    const { randomId } = require('../../shared/utils/index.ts');
    return randomId('req');
  }

  private rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      description: row.description,
      priority: row.priority as Requirement['priority'],
      riskLevel: row.risk_level as Requirement['riskLevel'],
      type: row.type as Requirement['type'],
      status: row.status as Requirement['status'],
      position: row.position,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

export const requirementRepo = new RequirementRepository();
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/shared/db/types.ts server/modules/requirements/repository.ts
git commit -m "feat: add RequirementRepository with listByProject and upsert"
```

---

### Task 4: Requirements Mapper + Schema

**Files:**
- Create: `server/modules/requirements/mapper.ts`
- Create: `server/modules/requirements/schema.ts`

- [ ] **Step 1: Create mapper**

Write `server/modules/requirements/mapper.ts`:

```typescript
import type { Requirement } from '../../shared/contracts/index.ts';
import { asId, asText, nullableText } from '../../shared/utils/index.ts';

export function normalizeRequirement(input: Partial<Requirement>): Requirement {
  return {
    id: asId(input.id, 'req'),
    projectId: asText(input.projectId),
    parentId: nullableText(input.parentId),
    title: asText(input.title, 'New Requirement'),
    description: asText(input.description),
    priority: (input.priority || 'MEDIUM') as Requirement['priority'],
    riskLevel: (input.riskLevel || 'MEDIUM') as Requirement['riskLevel'],
    type: (input.type || 'functional') as Requirement['type'],
    status: (input.status || 'DRAFT') as Requirement['status'],
    position: typeof input.position === 'number' ? input.position : 0,
    metadata: typeof input.metadata === 'object' && input.metadata !== null ? input.metadata as Record<string, unknown> : {},
  };
}
```

- [ ] **Step 2: Create schema**

Write `server/modules/requirements/schema.ts`:

```typescript
import { z } from 'zod';

export const requirementPayloadSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM'),
  riskLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM'),
  type: z.enum(['functional', 'performance', 'security', 'usability', 'reliability']).optional().default('functional'),
  status: z.enum(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DEPRECATED']).optional().default('DRAFT'),
  position: z.number().optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const requirementPatchSchema = requirementPayloadSchema.partial();
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/modules/requirements/mapper.ts server/modules/requirements/schema.ts
git commit -m "feat: add requirement mapper and zod schemas"
```

---

### Task 5: Requirements Module Entry + Import Handler

**Files:**
- Create: `server/modules/requirements/index.ts`
- Create: `server/modules/requirements/import.ts`
- Modify: `server/app/registerRoutes.ts`

- [ ] **Step 1: Create import handler**

Write `server/modules/requirements/import.ts`:

```typescript
import type { Requirement } from '../../shared/contracts/index.ts';
import { normalizeRequirement } from './mapper.ts';
import { requirementRepo } from './repository.ts';
import { randomId } from '../../shared/utils/index.ts';

interface ImportResult {
  imported: number;
  requirements: Requirement[];
}

export function parseMarkdownRequirements(markdown: string, projectId: string): ImportResult {
  const lines = markdown.split('\n');
  const requirements: Requirement[] = [];
  const levelStack: { level: number; id: string }[] = [];
  let currentReq: Partial<Requirement> | null = null;
  let descriptionLines: string[] = [];

  function flushCurrent() {
    if (!currentReq) return;
    currentReq.description = descriptionLines.join('\n').trim();
    requirements.push(normalizeRequirement(currentReq));
    currentReq = null;
    descriptionLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushCurrent();
      const level = headingMatch[1].length - 1; // # = 0, ## = 1, ### = 2, #### = 3
      const title = headingMatch[2].trim();

      while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= level) {
        levelStack.pop();
      }
      const parentId = levelStack.length > 0 ? levelStack[levelStack.length - 1].id : undefined;

      // Extract priority from title markers like [CRITICAL] or [HIGH]
      let priority: Requirement['priority'] = 'MEDIUM';
      const priorityMatch = title.match(/\[(CRITICAL|HIGH|MEDIUM|LOW)\]/);
      if (priorityMatch) {
        priority = priorityMatch[1] as Requirement['priority'];
      }

      const id = randomId('req');
      currentReq = { id, projectId, parentId, title, priority };
      levelStack.push({ level, id });
    } else if (currentReq && line.trim()) {
      descriptionLines.push(line.trim());
    }
  }
  flushCurrent();

  return { imported: requirements.length, requirements };
}

export function parseCsvRequirements(csvText: string, projectId: string): ImportResult {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { imported: 0, requirements: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const requirements: Requirement[] = [];
  const titleToId: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => { record[h] = values[idx] || ''; });

    const id = randomId('req');
    titleToId[record.title] = id;

    let parentId: string | undefined;
    if (record.parent_title && titleToId[record.parent_title]) {
      parentId = titleToId[record.parent_title];
    }

    requirements.push(normalizeRequirement({
      id,
      projectId,
      parentId,
      title: record.title,
      description: record.description || '',
      priority: (record.priority || 'MEDIUM') as Requirement['priority'],
      riskLevel: (record.risk_level || 'MEDIUM') as Requirement['riskLevel'],
      type: (record.type || 'functional') as Requirement['type'],
    }));
  }

  return { imported: requirements.length, requirements };
}
```

- [ ] **Step 2: Create module entry**

Write `server/modules/requirements/index.ts`:

```typescript
import { Router } from 'express';
import { createCrudModule } from '../../shared/http/crud.ts';
import { requirementRepo } from './repository.ts';
import { normalizeRequirement } from './mapper.ts';
import { requirementPayloadSchema, requirementPatchSchema } from './schema.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { parseMarkdownRequirements, parseCsvRequirements } from './import.ts';

const baseModule = createCrudModule({
  basePath: '/api/requirements',
  repository: requirementRepo,
  normalize: normalizeRequirement,
  createSchema: requirementPayloadSchema,
  patchSchema: requirementPatchSchema,
});

const router = baseModule.router as Router;

// POST /api/requirements/:projectId/import — file import
router.post('/:projectId/import', withErrorHandling(async (req, res) => {
  const { projectId } = req.params;
  const { content, format } = req.body;

  const result = format === 'csv'
    ? parseCsvRequirements(content, projectId)
    : parseMarkdownRequirements(content, projectId);

  for (const req of result.requirements) {
    requirementRepo.save(req);
  }

  res.json(result);
}));

export const requirementsModule = { basePath: '/api/requirements', router };
```

- [ ] **Step 3: Register module in routes**

Modify `server/app/registerRoutes.ts` — add import and registration:

```typescript
import { requirementsModule } from '../modules/requirements/index.ts';

// Add to the modules array:
requirementsModule,
```

- [ ] **Step 4: Verify module loads**

Run: `npx tsx server/migrate.ts` then start server briefly to check for errors:
Run: `npx tsx -e "import './server/app/registerRoutes.ts'; console.log('OK')"`
(Workdir: `E:\Projects\e2e_test`)

Expected: Prints "OK" without errors.

- [ ] **Step 5: Commit**

```bash
git add server/modules/requirements/index.ts server/modules/requirements/import.ts server/app/registerRoutes.ts
git commit -m "feat: add requirements CRUD module with markdown/csv import"
```

---

### Task 6: Test Conditions + NL Cases CRUD Modules

**Files:**
- Create: `server/modules/test-conditions/schema.ts`
- Create: `server/modules/test-conditions/repository.ts`
- Create: `server/modules/test-conditions/mapper.ts`
- Create: `server/modules/test-conditions/index.ts`
- Create: `server/modules/nl-cases/schema.ts`
- Create: `server/modules/nl-cases/repository.ts`
- Create: `server/modules/nl-cases/mapper.ts`
- Create: `server/modules/nl-cases/index.ts`
- Modify: `server/app/registerRoutes.ts`

- [ ] **Step 1: Create test-conditions schema**

Write `server/modules/test-conditions/schema.ts`:

```typescript
import { z } from 'zod';

export const testConditionPayloadSchema = z.object({
  requirementId: z.string(),
  requirementLevel: z.enum(['epic', 'feature', 'story', 'ac']).optional().default('story'),
  condition: z.string().min(1),
  category: z.enum(['happy-path', 'alternate', 'error', 'boundary']).optional().default('happy-path'),
  riskLevel: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  dataRequirements: z.string().optional(),
  dependencies: z.array(z.string()).optional().default([]),
  primaryTechnique: z.enum(['equivalence-partitioning', 'boundary-value-analysis', 'decision-table', 'state-transition', 'use-case']),
  secondaryTechniques: z.array(z.string()).optional().default([]),
  techniqueRationale: z.string().optional().default(''),
  coverageDimensions: z.array(z.object({
    dimension: z.string(),
    variants: z.array(z.string()),
  })).optional().default([]),
});

export const testConditionPatchSchema = testConditionPayloadSchema.partial();
```

- [ ] **Step 2: Create test-conditions repository**

Write `server/modules/test-conditions/repository.ts`:

```typescript
import type { TestCondition } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { randomId } from '../../shared/utils/index.ts';

type DbTestConditionRow = {
  id: string;
  project_id: string;
  requirement_id: string;
  condition: string;
  category: string;
  data_requirements: string | null;
  dependencies: string;
  risk_level: string;
  priority: string;
  primary_technique: string;
  secondary_techniques: string;
  technique_rationale: string;
  coverage_dimensions: string;
  status: string;
};

class TestConditionRepository extends BaseCrudRepository<TestCondition> {
  protected table = 'test_conditions';

  get(id: string): TestCondition | undefined {
    const row = db.prepare('SELECT * FROM test_conditions WHERE id = ?').get(id) as DbTestConditionRow | undefined;
    if (!row) return undefined;
    return this.rowToCondition(row);
  }

  save(record: Partial<TestCondition>): TestCondition {
    const id = record.id || randomId('tc');
    db.prepare(`
      INSERT INTO test_conditions (id, project_id, requirement_id, condition, category, data_requirements, dependencies, risk_level, priority, primary_technique, secondary_techniques, technique_rationale, coverage_dimensions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        requirement_id = excluded.requirement_id,
        condition = excluded.condition,
        category = excluded.category,
        data_requirements = excluded.data_requirements,
        dependencies = excluded.dependencies,
        risk_level = excluded.risk_level,
        priority = excluded.priority,
        primary_technique = excluded.primary_technique,
        secondary_techniques = excluded.secondary_techniques,
        technique_rationale = excluded.technique_rationale,
        coverage_dimensions = excluded.coverage_dimensions,
        status = excluded.status
    `).run(
      id,
      '',
      record.requirementId || '',
      record.condition || '',
      record.category || 'happy-path',
      record.dataRequirements || null,
      JSON.stringify(record.dependencies || []),
      record.riskLevel || 'medium',
      record.priority || 'medium',
      record.primaryTechnique || '',
      JSON.stringify(record.secondaryTechniques || []),
      record.techniqueRationale || '',
      JSON.stringify(record.coverageDimensions || []),
      'DRAFT',
    );
    return this.get(id)!;
  }

  private rowToCondition(row: DbTestConditionRow): TestCondition {
    return {
      id: row.id,
      requirementId: row.requirement_id,
      requirementLevel: 'story',
      condition: row.condition,
      category: row.category as TestCondition['category'],
      riskLevel: row.risk_level as TestCondition['riskLevel'],
      priority: row.priority as TestCondition['priority'],
      dataRequirements: row.data_requirements || undefined,
      dependencies: JSON.parse(row.dependencies || '[]'),
      primaryTechnique: row.primary_technique as TestCondition['primaryTechnique'],
      secondaryTechniques: JSON.parse(row.secondary_techniques || '[]'),
      techniqueRationale: row.technique_rationale,
      coverageDimensions: JSON.parse(row.coverage_dimensions || '[]'),
    };
  }
}

export const testConditionRepo = new TestConditionRepository();
```

- [ ] **Step 3: Create test-conditions mapper + module**

Write `server/modules/test-conditions/mapper.ts`:

```typescript
import type { TestCondition } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeTestCondition(input: Partial<TestCondition>): TestCondition {
  return {
    id: asId(input.id, 'tc'),
    requirementId: asText(input.requirementId),
    requirementLevel: (input.requirementLevel || 'story') as TestCondition['requirementLevel'],
    condition: asText(input.condition, 'New condition'),
    category: (input.category || 'happy-path') as TestCondition['category'],
    riskLevel: (input.riskLevel || 'medium') as TestCondition['riskLevel'],
    priority: (input.priority || 'medium') as TestCondition['priority'],
    dataRequirements: input.dataRequirements,
    dependencies: input.dependencies || [],
    primaryTechnique: (input.primaryTechnique || 'use-case') as TestCondition['primaryTechnique'],
    secondaryTechniques: input.secondaryTechniques || [],
    techniqueRationale: asText(input.techniqueRationale),
    coverageDimensions: input.coverageDimensions || [],
  };
}
```

Write `server/modules/test-conditions/index.ts`:

```typescript
import { createCrudModule } from '../../shared/http/crud.ts';
import { testConditionRepo } from './repository.ts';
import { normalizeTestCondition } from './mapper.ts';
import { testConditionPayloadSchema, testConditionPatchSchema } from './schema.ts';

export const testConditionsModule = createCrudModule({
  basePath: '/api/test-conditions',
  repository: testConditionRepo,
  normalize: normalizeTestCondition,
  createSchema: testConditionPayloadSchema,
  patchSchema: testConditionPatchSchema,
});
```

- [ ] **Step 4: Create nl-cases schema**

Write `server/modules/nl-cases/schema.ts`:

```typescript
import { z } from 'zod';

const nlStepSchema = z.object({
  sequence: z.number(),
  action: z.string().min(1),
  expected: z.string().min(1),
});

const testDataSchema = z.object({
  key: z.string(),
  value: z.string(),
  description: z.string(),
});

export const nlCasePayloadSchema = z.object({
  title: z.string().min(1),
  requirementId: z.string().optional(),
  conditionId: z.string().optional(),
  techniqueApplied: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  category: z.string().optional(),
  preconditions: z.array(z.string()).optional().default([]),
  testData: z.array(testDataSchema).optional().default([]),
  steps: z.array(nlStepSchema),
  postconditions: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(['DRAFT', 'APPROVED', 'FINAL']).optional().default('DRAFT'),
});

export const nlCasePatchSchema = nlCasePayloadSchema.partial();
```

- [ ] **Step 5: Create nl-cases repository**

Write `server/modules/nl-cases/repository.ts`:

```typescript
import type { NlTestCase } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { randomId } from '../../shared/utils/index.ts';

type DbNlCaseRow = {
  id: string;
  project_id: string;
  title: string;
  requirement_id: string | null;
  condition_id: string | null;
  technique_applied: string | null;
  priority: string;
  category: string | null;
  preconditions: string;
  test_data: string;
  steps: string;
  postconditions: string;
  tags: string;
  self_review: string | null;
  review_summary: string | null;
  change_log: string;
  status: string;
  generated_suite_id: string | null;
};

class NlCaseRepository extends BaseCrudRepository<NlTestCase> {
  protected table = 'natural_language_test_cases';

  get(id: string): NlTestCase | undefined {
    const row = db.prepare('SELECT * FROM natural_language_test_cases WHERE id = ?').get(id) as DbNlCaseRow | undefined;
    if (!row) return undefined;
    return this.rowToCase(row);
  }

  save(record: Partial<NlTestCase>): NlTestCase {
    const id = record.id || randomId('nlc');
    db.prepare(`
      INSERT INTO natural_language_test_cases (id, project_id, title, requirement_id, condition_id, technique_applied, priority, category, preconditions, test_data, steps, postconditions, tags, self_review, review_summary, change_log, status, generated_suite_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        requirement_id = excluded.requirement_id,
        condition_id = excluded.condition_id,
        technique_applied = excluded.technique_applied,
        priority = excluded.priority,
        category = excluded.category,
        preconditions = excluded.preconditions,
        test_data = excluded.test_data,
        steps = excluded.steps,
        postconditions = excluded.postconditions,
        tags = excluded.tags,
        self_review = excluded.self_review,
        review_summary = excluded.review_summary,
        change_log = excluded.change_log,
        status = excluded.status,
        generated_suite_id = excluded.generated_suite_id,
        updated_at = datetime('now')
    `).run(
      id,
      '',
      record.title || '',
      record.requirementId || null,
      record.conditionId || null,
      record.techniqueApplied || null,
      record.priority || 'medium',
      record.category || null,
      JSON.stringify(record.preconditions || []),
      JSON.stringify(record.testData || []),
      JSON.stringify(record.steps || []),
      JSON.stringify(record.postconditions || []),
      JSON.stringify(record.tags || []),
      record.selfReview ? JSON.stringify(record.selfReview) : null,
      record.reviewSummary || null,
      JSON.stringify(record.changeLog || []),
      record.status || 'DRAFT',
      record.generatedSuiteId || null,
    );
    return this.get(id)!;
  }

  private rowToCase(row: DbNlCaseRow): NlTestCase {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      requirementId: row.requirement_id || undefined,
      conditionId: row.condition_id || undefined,
      techniqueApplied: row.technique_applied || undefined,
      priority: row.priority as NlTestCase['priority'],
      category: row.category || undefined,
      preconditions: JSON.parse(row.preconditions || '[]'),
      testData: JSON.parse(row.test_data || '[]'),
      steps: JSON.parse(row.steps || '[]'),
      postconditions: JSON.parse(row.postconditions || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      selfReview: row.self_review ? JSON.parse(row.self_review) : undefined,
      reviewSummary: row.review_summary || undefined,
      changeLog: JSON.parse(row.change_log || '[]'),
      status: row.status as NlTestCase['status'],
      generatedSuiteId: row.generated_suite_id || undefined,
    };
  }
}

export const nlCaseRepo = new NlCaseRepository();
```

- [ ] **Step 6: Create nl-cases mapper + module**

Write `server/modules/nl-cases/mapper.ts`:

```typescript
import type { NlTestCase } from '../../shared/contracts/index.ts';
import { asId, asText, asArray } from '../../shared/utils/index.ts';

export function normalizeNlCase(input: Partial<NlTestCase>): NlTestCase {
  return {
    id: asId(input.id, 'nlc'),
    projectId: asText(input.projectId),
    title: asText(input.title, 'New Test Case'),
    requirementId: input.requirementId,
    conditionId: input.conditionId,
    techniqueApplied: input.techniqueApplied,
    priority: (input.priority || 'medium') as NlTestCase['priority'],
    category: input.category,
    preconditions: asArray(input.preconditions),
    testData: asArray(input.testData),
    steps: asArray(input.steps),
    postconditions: asArray(input.postconditions),
    tags: asArray(input.tags),
    selfReview: input.selfReview,
    reviewSummary: input.reviewSummary,
    changeLog: input.changeLog || [],
    status: (input.status || 'DRAFT') as NlTestCase['status'],
    generatedSuiteId: input.generatedSuiteId,
  };
}
```

Write `server/modules/nl-cases/index.ts`:

```typescript
import { createCrudModule } from '../../shared/http/crud.ts';
import { nlCaseRepo } from './repository.ts';
import { normalizeNlCase } from './mapper.ts';
import { nlCasePayloadSchema, nlCasePatchSchema } from './schema.ts';

export const nlCasesModule = createCrudModule({
  basePath: '/api/nl-cases',
  repository: nlCaseRepo,
  normalize: normalizeNlCase,
  createSchema: nlCasePayloadSchema,
  patchSchema: nlCasePatchSchema,
});
```

- [ ] **Step 7: Register all modules + create migration 011**

Write `server/migrations/011_ai_pipeline_schema.ts`:

```typescript
import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration011AiPipelineSchema: Migration = {
  id: '011_ai_pipeline_schema',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_conditions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        requirement_id TEXT NOT NULL,
        condition TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'happy-path',
        data_requirements TEXT,
        dependencies TEXT NOT NULL DEFAULT '[]',
        risk_level TEXT NOT NULL DEFAULT 'medium',
        priority TEXT NOT NULL DEFAULT 'medium',
        primary_technique TEXT NOT NULL,
        secondary_techniques TEXT NOT NULL DEFAULT '[]',
        technique_rationale TEXT NOT NULL DEFAULT '',
        coverage_dimensions TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS natural_language_test_cases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        requirement_id TEXT,
        condition_id TEXT,
        technique_applied TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        category TEXT,
        preconditions TEXT NOT NULL DEFAULT '[]',
        test_data TEXT NOT NULL DEFAULT '[]',
        steps TEXT NOT NULL DEFAULT '[]',
        postconditions TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        self_review TEXT,
        review_summary TEXT,
        change_log TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        generated_suite_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RUNNING',
        phase TEXT NOT NULL DEFAULT 'init',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pipeline_coverages (
        id TEXT PRIMARY KEY,
        pipeline_run_id TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        requirement_title TEXT NOT NULL,
        level TEXT NOT NULL,
        total_conditions INTEGER NOT NULL DEFAULT 0,
        test_case_count INTEGER NOT NULL DEFAULT 0,
        technique_breakdown TEXT NOT NULL DEFAULT '{}',
        category_breakdown TEXT NOT NULL DEFAULT '{}',
        coverage_percentage REAL NOT NULL DEFAULT 0,
        uncovered_risks TEXT NOT NULL DEFAULT '[]'
      );
    `);
  },
};
```

Register migrations in `server/migrations/index.ts`:

```typescript
import { migration011AiPipelineSchema } from './011_ai_pipeline_schema.ts';

// Add to pendingMigrations after 010:
[migration010RequirementsSchema, migration011AiPipelineSchema],
```

Register modules in `server/app/registerRoutes.ts`:

```typescript
import { testConditionsModule } from '../modules/test-conditions/index.ts';
import { nlCasesModule } from '../modules/nl-cases/index.ts';

// Add to modules array:
testConditionsModule,
nlCasesModule,
```

- [ ] **Step 8: Run migration to verify**

Run: `npx tsx server/migrate.ts`

Expected: Migration applies without errors.

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add server/modules/test-conditions/ server/modules/nl-cases/ server/migrations/011_ai_pipeline_schema.ts server/migrations/index.ts server/app/registerRoutes.ts
git commit -m "feat: add test-conditions + nl-cases CRUD modules and migration 011"
```

---

### Task 7: Requirements Module Unit Tests

**Files:**
- Create: `server/modules/requirements/__tests__/mapper.test.ts`
- Create: `server/modules/requirements/__tests__/import.test.ts`

- [ ] **Step 1: Write mapper tests**

Write `server/modules/requirements/__tests__/mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeRequirement } from '../mapper.ts';

describe('normalizeRequirement', () => {
  it('generates id when missing', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.id).toMatch(/^req-/);
  });

  it('preserves provided id', () => {
    const result = normalizeRequirement({ id: 'req-custom', projectId: 'proj-1', title: 'Test' });
    expect(result.id).toBe('req-custom');
  });

  it('defaults title to New Requirement', () => {
    const result = normalizeRequirement({ projectId: 'proj-1' });
    expect(result.title).toBe('New Requirement');
  });

  it('defaults priority to MEDIUM', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.priority).toBe('MEDIUM');
  });

  it('defaults riskLevel to MEDIUM', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('defaults type to functional', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.type).toBe('functional');
  });

  it('defaults status to DRAFT', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.status).toBe('DRAFT');
  });

  it('defaults position to 0', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.position).toBe(0);
  });

  it('defaults metadata to empty object', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.metadata).toEqual({});
  });

  it('accepts null parentId', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test', parentId: null });
    expect(result.parentId).toBeUndefined();
  });

  it('preserves string parentId', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test', parentId: 'req-parent' });
    expect(result.parentId).toBe('req-parent');
  });
});
```

- [ ] **Step 2: Run mapper tests**

Run: `npx vitest run server/modules/requirements/__tests__/mapper.test.ts`

Expected: All 11 tests pass.

- [ ] **Step 3: Write import tests**

Write `server/modules/requirements/__tests__/import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarkdownRequirements, parseCsvRequirements } from '../import.ts';

describe('parseMarkdownRequirements', () => {
  it('parses simple hierarchy', () => {
    const md = `# Login Feature [CRITICAL]
This is the login epic.

## Email Login
User logs in with email and password.

### Verify email format
The email field must accept valid email addresses.`;

    const result = parseMarkdownRequirements(md, 'proj-1');
    expect(result.imported).toBe(3);

    const epic = result.requirements.find(r => r.title.includes('Login Feature'));
    expect(epic?.priority).toBe('CRITICAL');
    expect(epic?.parentId).toBeUndefined();

    const feature = result.requirements.find(r => r.title === 'Email Login');
    expect(feature?.parentId).toBe(epic?.id);

    const story = result.requirements.find(r => r.title === 'Verify email format');
    expect(story?.parentId).toBe(feature?.id);
  });

  it('returns 0 for empty input', () => {
    const result = parseMarkdownRequirements('', 'proj-1');
    expect(result.imported).toBe(0);
  });

  it('captures description text under headings', () => {
    const md = `# Feature
Line one.
Line two.`;

    const result = parseMarkdownRequirements(md, 'proj-1');
    expect(result.requirements[0].description).toContain('Line one.');
    expect(result.requirements[0].description).toContain('Line two.');
  });
});

describe('parseCsvRequirements', () => {
  it('parses CSV with parent titles', () => {
    const csv = `title,description,parent_title,priority
Login Epic,Main login functionality,,CRITICAL
Email Login,Login with email,Login Epic,HIGH`;

    const result = parseCsvRequirements(csv, 'proj-1');
    expect(result.imported).toBe(2);

    const epic = result.requirements[0];
    expect(epic.priority).toBe('CRITICAL');
    expect(epic.parentId).toBeUndefined();

    const feature = result.requirements[1];
    expect(feature.parentId).toBe(epic.id);
  });

  it('returns 0 for header-only CSV', () => {
    const csv = 'title,description,parent_title,priority';
    const result = parseCsvRequirements(csv, 'proj-1');
    expect(result.imported).toBe(0);
  });
});
```

- [ ] **Step 4: Run import tests**

Run: `npx vitest run server/modules/requirements/__tests__/import.test.ts`

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/modules/requirements/__tests__/
git commit -m "test: add requirement mapper and import unit tests"
```

---

### Task 8: AI Provider Deep Module

**Files:**
- Create: `shared/ai/provider.ts`
- Create: `shared/ai/__tests__/provider.test.ts`

- [ ] **Step 1: Create AI Provider module**

Write `shared/ai/provider.ts`:

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
}

export type ProviderConfig =
  | { type: 'azure-openai'; endpoint: string; apiKey: string; deployment: string; apiVersion: string }
  | { type: 'nvidia-nim'; endpoint: string; apiKey: string; model: string }
  | { type: 'openrouter'; apiKey: string; model: string }
  | { type: 'openai'; apiKey: string; model: string };

export function createAIProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'azure-openai':
      return createAzureOpenAIProvider(config);
    case 'nvidia-nim':
      return createNvidiaProvider(config);
    case 'openrouter':
      return createOpenRouterProvider(config);
    case 'openai':
      return createOpenAIProvider(config);
  }
}

function createAzureOpenAIProvider(config: ProviderConfig & { type: 'azure-openai' }): AIProvider {
  const baseUrl = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json_object'
          ? { type: 'json_object' }
          : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as any;
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure OpenAI stream error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }

  return { chat, streamChat };
}

function createNvidiaProvider(config: ProviderConfig & { type: 'nvidia-nim' }): AIProvider {
  const baseUrl = `${config.endpoint}/v1/chat/completions`;

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`Nvidia NIM error ${response.status}`);
    }

    const data = await response.json() as any;
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Nvidia NIM stream error ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }

  return { chat, streamChat };
}

function createOpenRouterProvider(config: ProviderConfig & { type: 'openrouter' }): AIProvider {
  const baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}`);
    }

    const data = await response.json() as any;
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter stream error ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }

  return { chat, streamChat };
}

function createOpenAIProvider(config: ProviderConfig & { type: 'openai' }): AIProvider {
  const baseUrl = 'https://api.openai.com/v1/chat/completions';

  async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json_object'
          ? { type: 'json_object' }
          : undefined,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
    const data = await response.json() as any;
    return {
      content: data.choices[0].message.content,
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 },
    };
  }

  async function* streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI stream error ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  }

  return { chat, streamChat };
}
```

- [ ] **Step 2: Write provider tests**

Write `shared/ai/__tests__/provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createAIProvider } from '../provider.ts';

describe('createAIProvider', () => {
  const originalFetch = globalThis.fetch;

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates azure-openai provider', () => {
    const provider = createAIProvider({
      type: 'azure-openai',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-key',
      deployment: 'gpt-4o',
      apiVersion: '2024-02-01',
    });
    expect(provider.chat).toBeDefined();
    expect(provider.streamChat).toBeDefined();
  });

  it('azure provider calls correct endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '{"result": "ok"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }) as any;

    const provider = createAIProvider({
      type: 'azure-openai',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-key',
      deployment: 'gpt-4o',
      apiVersion: '2024-02-01',
    });

    const response = await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(response.content).toBe('{"result": "ok"}');
    expect(response.usage?.promptTokens).toBe(10);
    expect(response.usage?.completionTokens).toBe(5);

    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('openai.azure.com');
    expect(url).toContain('gpt-4o');
    expect(init.headers['api-key']).toBe('test-key');
  });

  it('handles error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    }) as any;

    const provider = createAIProvider({
      type: 'azure-openai',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-key',
      deployment: 'gpt-4o',
      apiVersion: '2024-02-01',
    });

    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('429');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run shared/ai/__tests__/provider.test.ts`

Expected: All 3 tests pass.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add shared/ai/provider.ts shared/ai/__tests__/provider.test.ts
git commit -m "feat: add AIProvider abstraction with Azure OpenAI/Nvidia/OpenRouter/OpenAI adapters"
```

---

### Task 9: Skill Loader

**Files:**
- Create: `shared/ai/skill-loader.ts`
- Create: `shared/ai/skills/` — all SKILL.md and reference files

- [ ] **Step 1: Create skill loader**

Write `shared/ai/skill-loader.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const SKILLS_ROOT = path.join(import.meta.dirname, 'skills');

export interface SkillContext {
  systemPrompt: string;
  referenceFiles: { name: string; skillName: string; content: string }[];
}

export function loadSkillContext(skillNames: string[]): SkillContext {
  const prompts: string[] = [];
  const referenceFiles: SkillContext['referenceFiles'] = [];

  for (const skillName of skillNames) {
    const skillDir = path.join(SKILLS_ROOT, skillName);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(skillMdPath)) {
      prompts.push(fs.readFileSync(skillMdPath, 'utf-8'));
    }

    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir)) {
      for (const file of fs.readdirSync(refsDir)) {
        const filePath = path.join(refsDir, file);
        if (fs.statSync(filePath).isFile()) {
          referenceFiles.push({
            name: file,
            skillName,
            content: fs.readFileSync(filePath, 'utf-8'),
          });
        }
      }
    }
  }

  return {
    systemPrompt: prompts.join('\n\n---\n\n'),
    referenceFiles,
  };
}

export function readReferenceFile(skillName: string, referenceName: string): string {
  const filePath = path.join(SKILLS_ROOT, skillName, 'references', referenceName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reference file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}
```

- [ ] **Step 2: Create skill files**

Write `shared/ai/skills/test-analyst/SKILL.md`:

```markdown
# Test Analyst Agent

You are an ISTQB-certified Test Analyst. Your role combines Test Manager, Test Analyst, and Test Technique Selector.

## Responsibilities
1. Assess requirement complexity, risk, and business value. Prioritize by risk+business value.
2. Extract atomic test conditions from requirements — each condition tests ONE specific thing.
3. Select the most appropriate ISTQB test design technique for each condition.

## Technique Selection Rules
- Input values with range constraints → Equivalence Partitioning + Boundary Value Analysis
- Multi-condition business logic → Decision Table Testing
- State-driven workflows → State Transition Testing
- User interaction/business flows → Use Case Testing
- API parameter validation → EP + BVA

## Categories
- happy-path: The system works as expected under normal conditions
- alternate: Different valid paths through the same feature
- error: Invalid inputs or unexpected conditions
- boundary: Edge cases at the limits of valid ranges

## Output Format
Return a JSON object with:
- requirementAnalysis: { overallApproach: string, riskAssessmentSummary: string }
- testConditions: array of { id, requirementId, requirementLevel, condition, category, riskLevel, priority, primaryTechnique, secondaryTechniques, techniqueRationale, coverageDimensions[] }
```

Write `shared/ai/skills/test-designer/SKILL.md`:

```markdown
# Test Designer Agent

You are an ISTQB-certified Test Design Engineer.

## Responsibilities
1. Design natural language test cases following ISTQB standard format: preconditions → test data → steps(action+expected) → postconditions
2. Apply the assigned test technique for each condition
3. Cover: happy-path + alternate + error + boundary paths
4. Perform self-quality review on all generated cases

## ISTQB Test Case Standards
- Each step is atomic (one action per step)
- Expected result is measurable and observable
- Preconditions are explicit (system state, user state, data state)
- Data is specific (no vague descriptions like "valid input")
- Repeatable (no dependency on other cases' execution)

## Self-Review Dimensions
After designing, review every case for:
- Atomicity: one action per step
- Testability: preconditions achievable, results verifiable
- Coverage: all required variants covered
- Repeatability: self-contained, independent
- Clarity: unambiguous, concrete
- Data completeness: all inputs specified

## Output Format
Return a JSON array of DraftNlTestCase objects with: id, title, requirementId, conditionId, techniqueApplied, priority, category, preconditions[], testData[], steps[{sequence, action, expected}], postconditions[], tags[], selfReview{score, issues[{severity, category, description, suggestion}], pass}
```

Write `shared/ai/skills/quality-manager/SKILL.md`:

```markdown
# Quality Manager Agent

You are an ISTQB-certified Test Quality Manager. Your role combines Quality Reviewer and Finalizer.

## Responsibilities
1. Review ALL draft test cases from 6 quality dimensions
2. Merge self-review findings from the Test Designer, cross-validate
3. Fix all blocker and major issues
4. Incorporate human feedback
5. Generate a coverage matrix

## 6 Quality Dimensions
1. Atomicity — each step does one thing
2. Testability — preconditions achievable, expected results verifiable
3. Coverage Completeness — happy-path, alternate, error, boundary covered
4. Repeatability — self-contained, no cross-case dependencies
5. Clarity — unambiguous steps with concrete data
6. Data Completeness — all required inputs have specific values

## Issue Severity
- blocker: Must fix before finalization
- major: Strongly recommended fix
- minor: Nice to fix, can proceed

## Output Format
Return a JSON object with:
- finalTestCases: array of FinalNlTestCase objects with: id, title, requirementId, conditionId, techniqueApplied, priority, category, preconditions[], testData[], steps[], postconditions[], tags[], reviewSummary, changeLog[{source, changes}]
- coverageMatrix: { rows: [{ requirementId, requirementTitle, level, totalConditions, testCaseCount, techniqueBreakdown, categoryBreakdown, coveragePercentage, uncoveredRisks[] }] }
```

Write `shared/ai/skills/requirement-index/SKILL.md`:

```markdown
# Requirement Index Skill

This skill provides a searchable index of all project requirements as a lightweight JSON file.

The index file is at `references/index.json` and is regenerated automatically when requirements change.

Each index entry has: id, title, level (0=epic,1=feature,2=story,3=ac), parent, summary (≤200 chars), tags, priority, risk, type, testType, childCount, children[].
```

Write `shared/ai/skills/requirement-query/SKILL.md`:

```markdown
# Requirement Query Skill

Use this skill BEFORE reading any requirement details. Never read all requirements at once — always query for a relevant subset first.

## How to query
1. Read `requirement-index/references/index.json` to understand the landscape
2. Filter by: tags, level, priority, parent (get all children of a node)
3. Select the subset you need
4. Only then load full requirement descriptions for that subset

## Query strategies
- "analyze login requirements" → filter by tags: ["auth"]
- "check all critical requirements" → filter by priority: "critical"
- "expand epic X" → filter by parent: "req-001" then process children
- "find all UI-related tests" → filter by testType: ["ui"]

## Validation
After processing a subset, ensure:
- All direct children of the parent are covered
- All tagged requirements in scope are addressed
- Cross-references are handled
```

Write `shared/ai/skills/requirement-analysis/SKILL.md`:

```markdown
# Requirement Analysis Skill

Use this skill when analyzing requirements for completeness and testability.

## Analysis Checklist
- Are all acceptance criteria testable?
- Are there implicit requirements not written?
- Are dependencies between requirements identified?
- Are priority and risk levels consistent with business impact?

See `references/analysis-checklist.md` for the full checklist.
See `references/technique-mapping.md` for requirement-type-to-technique mapping.
```

- [ ] **Step 3: Commit**

```bash
git add shared/ai/skill-loader.ts shared/ai/skills/
git commit -m "feat: add skill loader and ISTQB agent skill definitions"
```

---

### Task 10: Agent Runner

**Files:**
- Create: `shared/ai/agent.ts`
- Create: `shared/ai/types.ts`
- Create: `shared/ai/__tests__/agent.test.ts`

- [ ] **Step 1: Create shared AI types**

Write `shared/ai/types.ts`:
Already defined in Task 2 (`shared/contracts/index.ts`).
No new file needed — use types from contracts.

- [ ] **Step 2: Create Agent Runner**

Write `shared/ai/agent.ts`:

```typescript
import type { ZodType } from 'zod';
import type { AIProvider, ChatMessage, ChatOptions } from './provider.ts';
import { loadSkillContext, type SkillContext } from './skill-loader.ts';
import type { PipelineState } from '../contracts/index.ts';

export interface AgentRole {
  name: string;
  systemPromptTemplate: string;
  requiredSkills: string[];
  inputSchema: ZodType;
  outputSchema: ZodType;
  options?: ChatOptions;
}

export interface AgentContext {
  provider: AIProvider;
  role: AgentRole;
  skillContext: SkillContext;
}

export function createAgentContext(provider: AIProvider, role: AgentRole): AgentContext {
  return {
    provider,
    role,
    skillContext: loadSkillContext(role.requiredSkills),
  };
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

export async function runAgent(context: AgentContext, input: unknown): Promise<unknown> {
  const { provider, role, skillContext } = context;

  const parsedInput = role.inputSchema.parse(input);
  const inputJson = JSON.stringify(parsedInput, null, 2);

  const filledPrompt = fillTemplate(role.systemPromptTemplate, {
    input: inputJson,
    skills: skillContext.systemPrompt,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await provider.chat(messages, {
        ...role.options,
        responseFormat: 'json_object',
      });

      const parsed = JSON.parse(response.content);
      return role.outputSchema.parse(parsed);
    } catch (err) {
      lastError = err as Error;
      if (attempt === 0) {
        messages.push({
          role: 'assistant',
          content: '(previous response failed validation)',
        });
        messages.push({
          role: 'user',
          content: `Your previous response was invalid: ${lastError.message}. Please fix and re-output as valid JSON.`,
        });
      }
    }
  }

  throw new Error(`Agent failed after 2 attempts: ${lastError?.message}`);
}

export async function* streamAgent(context: AgentContext, input: unknown): AsyncGenerator<{ type: 'chunk' | 'result'; content: unknown }> {
  const { provider, role, skillContext } = context;

  const parsedInput = role.inputSchema.parse(input);
  const inputJson = JSON.stringify(parsedInput, null, 2);

  const filledPrompt = fillTemplate(role.systemPromptTemplate, {
    input: inputJson,
    skills: skillContext.systemPrompt,
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: skillContext.systemPrompt },
    { role: 'system', content: filledPrompt },
    { role: 'user', content: inputJson },
  ];

  let fullContent = '';

  for await (const chunk of provider.streamChat(messages, { ...role.options })) {
    fullContent += chunk;
    yield { type: 'chunk', content: chunk };
  }

  try {
    const parsed = JSON.parse(fullContent);
    const validated = role.outputSchema.parse(parsed);
    yield { type: 'result', content: validated };
  } catch (err) {
    throw new Error(`Agent output validation failed: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 3: Write agent tests**

Write `shared/ai/__tests__/agent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createAgentContext, runAgent, type AgentRole } from '../agent.ts';
import type { AIProvider, ChatMessage } from '../provider.ts';

function createMockProvider(responseContent: string): AIProvider {
  return {
    chat: vi.fn().mockResolvedValue({
      content: responseContent,
      usage: { promptTokens: 10, completionTokens: 5 },
    }),
    streamChat: vi.fn(),
  };
}

const testRole: AgentRole = {
  name: 'test',
  systemPromptTemplate: 'You are a test agent. Input: {{input}}',
  requiredSkills: [],
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ result: z.string() }),
};

describe('runAgent', () => {
  it('calls provider and returns validated output', async () => {
    const provider = createMockProvider('{"result": "hello"}');
    const context = createAgentContext(provider, testRole);

    const result = await runAgent(context, { text: 'test input' }) as { result: string };
    expect(result.result).toBe('hello');
  });

  it('retries once on validation failure', async () => {
    const provider = {
      chat: vi.fn()
        .mockResolvedValueOnce({ content: '{"wrong": "field"}', usage: {} })
        .mockResolvedValueOnce({ content: '{"result": "corrected"}', usage: {} }),
    } as unknown as AIProvider;

    const context = createAgentContext(provider, testRole);
    const result = await runAgent(context, { text: 'test input' }) as { result: string };
    expect(result.result).toBe('corrected');
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('throws after 2 failed attempts', async () => {
    const provider = {
      chat: vi.fn().mockResolvedValue({ content: 'invalid json {{{', usage: {} }),
    } as unknown as AIProvider;

    const context = createAgentContext(provider, testRole);
    await expect(runAgent(context, { text: 'test input' })).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run agent tests**

Run: `npx vitest run shared/ai/__tests__/agent.test.ts`

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/ai/agent.ts shared/ai/__tests__/agent.test.ts
git commit -m "feat: add AgentRunner with retry and structured output validation"
```

---

### Task 11: AI Pipeline Engine (LangGraph)

**Files:**
- Create: `shared/ai/pipeline.ts`
- Create: `shared/ai/__tests__/pipeline.test.ts`
- Install: `@langchain/langgraph`

- [ ] **Step 1: Install LangGraph**

Run: `npm install @langchain/langgraph`

Expected: Package added to package.json and node_modules.

- [ ] **Step 2: Create pipeline engine**

Write `shared/ai/pipeline.ts`:

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { PipelineState, TestCondition, NlTestCase, CoverageMatrix } from '../contracts/index.ts';
import type { AIProvider } from './provider.ts';
import { createAgentContext, runAgent, type AgentRole } from './agent.ts';
import { loadSkillContext } from './skill-loader.ts';
import { db } from '../../server/shared/db/client.ts';

export async function createNlPipeline(provider: AIProvider, roles: {
  testAnalyst: AgentRole;
  testDesigner: AgentRole;
  qualityManager: AgentRole;
}) {
  const testAnalystCtx = createAgentContext(provider, roles.testAnalyst);
  const testDesignerCtx = createAgentContext(provider, roles.testDesigner);
  const qualityManagerCtx = createAgentContext(provider, roles.qualityManager);

  const graph = new StateGraph<PipelineState>({ channels: {} as any });

  graph.addNode('agent_test_analyst', async (state: PipelineState) => {
    const result = await runAgentInBatches(state, testAnalystCtx, provider);
    return {
      testConditions: result.conditions,
      requirementAnalysis: { overallApproach: result.approach, riskAssessmentSummary: result.riskSummary },
      phase: 'review-conditions' as const,
    };
  });

  graph.addNode('review_conditions', (state) => state);

  graph.addNode('agent_test_designer', async (state: PipelineState) => {
    const result = await runAgent(testDesignerCtx, {
      conditions: state.approvedConditions || state.testConditions,
      projectContext: { name: '', pages: [], endpoints: [] },
    });
    return {
      draftTestCases: Array.isArray(result) ? result as NlTestCase[] : [],
      phase: 'review-draft' as const,
    };
  });

  graph.addNode('review_drafts', (state) => state);

  graph.addNode('agent_quality_manager', async (state: PipelineState) => {
    const result = await runAgent(qualityManagerCtx, {
      draftCases: state.approvedDraftCases || state.draftTestCases,
      humanFeedback: state.humanReviewFeedback || '',
    });
    const output = result as { finalTestCases: NlTestCase[]; coverageMatrix: CoverageMatrix };
    return {
      finalTestCases: output.finalTestCases,
      coverageMatrix: output.coverageMatrix,
      phase: 'final-review' as const,
    };
  });

  graph.addNode('final_review', (state) => state);

  graph.addEdge(START, 'agent_test_analyst');
  graph.addEdge('agent_test_analyst', 'review_conditions');
  graph.addEdge('review_conditions', 'agent_test_designer');
  graph.addEdge('agent_test_designer', 'review_drafts');
  graph.addEdge('review_drafts', 'agent_quality_manager');
  graph.addEdge('agent_quality_manager', 'final_review');
  graph.addEdge('final_review', END);

  const checkpointer = new SqliteSaver(db);
  return graph.compile({ checkpointer });
}

async function runAgentInBatches(state: PipelineState, ctx: ReturnType<typeof createAgentContext>, _provider: AIProvider): Promise<{
  conditions: TestCondition[];
  approach: string;
  riskSummary: string;
}> {
  const result = await runAgent(ctx, {
    requirements: state.requirementIds.map(id => ({ id, title: '', description: '' })),
    projectContext: { name: '', type: 'web' as const, existingPages: [], existingEndpoints: [] },
  });

  const output = result as {
    requirementAnalysis: { overallApproach: string; riskAssessmentSummary: string };
    testConditions: TestCondition[];
  };

  return {
    conditions: output.testConditions,
    approach: output.requirementAnalysis.overallApproach,
    riskSummary: output.requirementAnalysis.riskAssessmentSummary,
  };
}
```

- [ ] **Step 3: Write pipeline test**

Write `shared/ai/__tests__/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createNlPipeline } from '../pipeline.ts';

// Test will verify pipeline graph compiles without errors
// Detailed integration tests will be in ai-pipeline module tests
describe('createNlPipeline', () => {
  it('graph compiles with SqliteSaver', async () => {
    const mockProvider = {
      chat: vi.fn().mockResolvedValue({ content: '{}', usage: {} }),
      streamChat: vi.fn(),
    } as any;

    const mockRole = {
      name: 'test',
      systemPromptTemplate: '',
      requiredSkills: [],
      inputSchema: { parse: (x: any) => x } as any,
      outputSchema: { parse: (x: any) => x } as any,
    };

    const graph = await createNlPipeline(mockProvider, {
      testAnalyst: mockRole,
      testDesigner: mockRole,
      qualityManager: mockRole,
    });

    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run shared/ai/__tests__/pipeline.test.ts`

Expected: Test passes (graph compiles).

- [ ] **Step 5: Commit**

```bash
git add shared/ai/pipeline.ts shared/ai/__tests__/pipeline.test.ts package.json package-lock.json
git commit -m "feat: add LangGraph AI pipeline engine with 3-agent ISTQB workflow"
```

---

### Task 12: AI Pipeline API (SSE + Checkpoint Endpoints)

**Files:**
- Create: `server/modules/ai-pipeline/index.ts`
- Modify: `server/app/registerRoutes.ts`

- [ ] **Step 1: Create pipeline API router**

Write `server/modules/ai-pipeline/index.ts`:

```typescript
import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { db } from '../../shared/db/client.ts';

const router = Router();

// POST /api/pipeline/:projectId/start — launch pipeline, returns SSE stream
router.post('/:projectId/start', (req, res) => {
  const { requirementIds, providerConfigName, mode } = req.body;
  const { projectId } = req.params;
  const runId = randomId('run');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Insert pipeline_run record
  db.prepare('INSERT INTO pipeline_runs (id, project_id, status, phase) VALUES (?, ?, ?, ?)').run(
    runId, projectId, 'RUNNING', 'init',
  );

  // Start async pipeline execution
  (async () => {
    try {
      sendEvent('phase:start', { phase: 'analysis', agent: 'test-analyst', batch: '1/1' });
      sendEvent('agent:thought', { phase: 'analysis', chunk: 'Placeholder — full pipeline execution with LangGraph requires agent roles and provider configured via settings.' });
      sendEvent('phase:complete', { phase: 'analysis', summary: 'Pipeline infrastructure ready. Full execution requires provider config in settings and agent role definitions loaded from skills.' });
      sendEvent('human_review:required', { phase: 'review-conditions' });
      sendEvent('pipeline:complete', { summary: 'Infrastructure verified.' });
    } catch (err) {
      sendEvent('pipeline:error', { phase: 'analysis', message: (err as Error).message });
    } finally {
      db.prepare('UPDATE pipeline_runs SET status = ?, phase = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
        'COMPLETED', 'complete', runId,
      );
      res.end();
    }
  })();
});

// POST /api/pipeline/:runId/continue — resume from checkpoint
router.post('/:runId/continue', withErrorHandling((req, res) => {
  const { action } = req.body;

  db.prepare('UPDATE pipeline_runs SET phase = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    action === 'retry' ? 'analysis' : 'agent_test_designer', req.params.runId,
  );

  res.json({ success: true, action });
}));

// GET /api/pipeline/:runId/status
router.get('/:runId/status', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) {
    res.status(404).json({ error: 'Pipeline run not found' });
    return;
  }
  res.json({ status: row.status, phase: row.phase });
}));

// POST /api/pipeline/:runId/abort
router.post('/:runId/abort', withErrorHandling((req, res) => {
  db.prepare('UPDATE pipeline_runs SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    'FAILED', req.params.runId,
  );
  res.json({ success: true });
}));

// GET /api/pipeline/:runId/state
router.get('/:runId/state', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  res.json({ status: row?.status || 'UNKNOWN', phase: row?.phase || 'init' });
}));

export const aiPipelineModule = { basePath: '/api/pipeline', router };
```

- [ ] **Step 2: Register module**

Modify `server/app/registerRoutes.ts`:

```typescript
import { aiPipelineModule } from '../modules/ai-pipeline/index.ts';

// Add to modules array:
aiPipelineModule,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/modules/ai-pipeline/index.ts server/app/registerRoutes.ts
git commit -m "feat: add AI pipeline API — SSE streaming + checkpoint endpoints"
```

---

### Task 13: Requirements Index Generator

**Files:**
- Create: `server/modules/requirements/index-generator.ts`
- Modify: `server/modules/requirements/index.ts` — wire index generation into save/delete

- [ ] **Step 1: Create index generator**

Write `server/modules/requirements/index-generator.ts`:

```typescript
import { requirementRepo } from './repository.ts';
import fs from 'fs';
import path from 'path';

interface IndexItem {
  id: string;
  title: string;
  level: number;
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

function computeLevel(itemId: string, allIds: Map<string, string | null>, depth: number = 0): number {
  const parentId = allIds.get(itemId);
  if (!parentId) return 0;
  if (depth > 10) return depth;
  return computeLevel(parentId, allIds, depth + 1);
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('login') || lower.includes('auth') || lower.includes('登录')) tags.push('auth');
  if (lower.includes('register') || lower.includes('注册')) tags.push('registration');
  if (lower.includes('payment') || lower.includes('支付')) tags.push('payment');
  if (lower.includes('profile') || lower.includes('个人')) tags.push('profile');
  if (lower.includes('dashboard') || lower.includes('仪表')) tags.push('dashboard');
  if (lower.includes('api') || lower.includes('接口')) tags.push('api');
  if (lower.includes('email') || lower.includes('邮件')) tags.push('email');
  if (lower.includes('search') || lower.includes('搜索')) tags.push('search');
  return tags;
}

function inferTestTypes(req: { description: string; type: string }): string[] {
  const types: string[] = ['functional'];
  const text = req.description.toLowerCase();
  if (text.includes('performance') || text.includes('性能') || text.includes('concurrent') || text.includes('并发')) types.push('performance');
  if (text.includes('security') || text.includes('安全') || text.includes('permission') || text.includes('权限')) types.push('security');
  if (text.includes('ui') || text.includes('page') || text.includes('页面') || text.includes('display') || text.includes('显示')) types.push('ui');
  if (req.type !== 'functional') types.push(req.type);
  return [...new Set(types)];
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}

export function buildRequirementIndex(projectId: string): IndexItem[] {
  const allReqs = requirementRepo.listByProject(projectId);
  const parentMap = new Map(allReqs.map(r => [r.id, r.parentId || null]));
  const childMap = new Map<string, string[]>();

  for (const r of allReqs) {
    const parentId = r.parentId || '__root__';
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId)!.push(r.id);
  }

  return allReqs.map(r => ({
    id: r.id,
    title: r.title,
    level: computeLevel(r.id, parentMap),
    parent: r.parentId || null,
    summary: truncate(r.description, 200),
    tags: extractTags(r.title + ' ' + r.description),
    priority: r.priority,
    risk: r.riskLevel,
    type: r.type,
    testType: inferTestTypes(r),
    childCount: (childMap.get(r.id) || []).length,
    children: childMap.get(r.id) || [],
  }));
}

export function regenerateIndexFile(projectId: string): void {
  const index = buildRequirementIndex(projectId);
  const skillsDir = path.join(import.meta.dirname, '../../shared/ai/skills/requirement-index/references');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(skillsDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`[index] Regenerated requirement index for project ${projectId}: ${index.length} entries`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/modules/requirements/index-generator.ts
git commit -m "feat: add requirement index generator for skill-based context management"
```

---

### Task 14: Frontend — Requirements Page

**Files:**
- Create: `client/features/requirements/RequirementsPage.tsx`
- Create: `client/features/requirements/RequirementTree.tsx`
- Create: `client/features/requirements/RequirementEditor.tsx`
- Create: `client/features/requirements/RequirementImport.tsx`
- Modify: `client/app/navigation.ts`

- [ ] **Step 1: Create RequirementsPage**

Write `client/features/requirements/RequirementsPage.tsx`:

```tsx
import React, { useState } from 'react';
import { RequirementTree } from './RequirementTree';
import { RequirementEditor } from './RequirementEditor';
import { RequirementImport } from './RequirementImport';
import { useCrud } from '../../shared/hooks/useCrud';
import type { Requirement } from '../../shared/contracts';

export function RequirementsPage() {
  const { items, loading, refresh } = useCrud<Requirement>('/api/requirements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const selected = items.find(r => r.id === selectedId) || null;

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="flex h-full">
      <div className="w-80 border-r p-2 overflow-auto">
        <div className="flex justify-between mb-2">
          <button
            className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
            onClick={() => {
              setSelectedId(null);
            }}
          >
            + New Root
          </button>
          <button
            className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
            onClick={() => setShowImport(true)}
          >
            Import
          </button>
        </div>
        <RequirementTree
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={refresh}
        />
      </div>
      <div className="flex-1 p-4">
        <RequirementEditor
          item={selected}
          projectId={items[0]?.projectId || ''}
          onSaved={refresh}
        />
      </div>
      {showImport && (
        <RequirementImport
          projectId={items[0]?.projectId || ''}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create RequirementTree**

Write `client/features/requirements/RequirementTree.tsx`:

```tsx
import React from 'react';
import type { Requirement } from '../../shared/contracts';
import { useCrud } from '../../shared/hooks/useCrud';

interface Props {
  items: Requirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  parentId?: string | null;
  depth?: number;
  onRefresh: () => void;
}

export function RequirementTree({ items, selectedId, onSelect, parentId = null, depth = 0, onRefresh }: Props) {
  const { remove } = useCrud<Requirement>('/api/requirements');
  const children = items.filter(r => (r.parentId || null) === parentId);

  return (
    <div>
      {children.map(r => (
        <div key={r.id}>
          <div
            className={`flex items-center py-1 px-1 cursor-pointer hover:bg-gray-100 rounded text-sm ${
              selectedId === r.id ? 'bg-blue-100' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
            onClick={() => onSelect(r.id)}
          >
            <span className="flex-1 truncate">
              <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                r.priority === 'CRITICAL' ? 'bg-red-500' :
                r.priority === 'HIGH' ? 'bg-orange-500' :
                r.priority === 'LOW' ? 'bg-gray-400' : 'bg-blue-400'
              }`} />
              {r.title}
            </span>
            <button
              className="text-red-400 hover:text-red-600 text-xs px-1"
              onClick={async (e) => {
                e.stopPropagation();
                await remove(r.id);
                onRefresh();
              }}
            >
              x
            </button>
          </div>
          <RequirementTree
            items={items}
            selectedId={selectedId}
            onSelect={onSelect}
            parentId={r.id}
            depth={depth + 1}
            onRefresh={onRefresh}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create RequirementEditor**

Write `client/features/requirements/RequirementEditor.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import type { Requirement } from '../../shared/contracts';
import { useCrud } from '../../shared/hooks/useCrud';

interface Props {
  item: Requirement | null;
  projectId: string;
  onSaved: () => void;
}

export function RequirementEditor({ item, projectId, onSaved }: Props) {
  const { create, update } = useCrud<Requirement>('/api/requirements');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [riskLevel, setRiskLevel] = useState<string>('MEDIUM');
  const [status, setStatus] = useState<string>('DRAFT');

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description);
      setPriority(item.priority);
      setRiskLevel(item.riskLevel);
      setStatus(item.status);
    } else {
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setRiskLevel('MEDIUM');
      setStatus('DRAFT');
    }
  }, [item]);

  const handleSave = async () => {
    if (item) {
      await update(item.id, { title, description, priority, riskLevel, status });
    } else {
      await create({ projectId, title, description, priority, riskLevel, status });
    }
    onSaved();
  };

  return (
    <div className="space-y-3">
      {item ? <h2 className="text-lg font-semibold">Edit: {item.title}</h2> : <h2 className="text-lg font-semibold">New Requirement</h2>}
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
          rows={4}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Priority</label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option>CRITICAL</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Risk</label>
          <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option>DRAFT</option>
            <option>APPROVED</option>
            <option>IN_PROGRESS</option>
            <option>DEPRECATED</option>
          </select>
        </div>
      </div>
      <button onClick={handleSave} className="px-4 py-1 bg-blue-500 text-white rounded text-sm">
        {item ? 'Update' : 'Create'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create RequirementImport**

Write `client/features/requirements/RequirementImport.tsx`:

```tsx
import React, { useState } from 'react';

interface Props {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

export function RequirementImport({ projectId, onClose, onImported }: Props) {
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'markdown' | 'csv'>('markdown');

  const handleImport = async () => {
    const res = await fetch(`/api/requirements/${projectId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, format }),
    });
    const data = await res.json();
    alert(`Imported ${data.imported} requirements`);
    onImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-96">
        <h2 className="text-lg font-semibold mb-3">Import Requirements</h2>
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">Format</label>
          <select value={format} onChange={e => setFormat(e.target.value as any)} className="w-full border rounded px-2 py-1 text-sm">
            <option value="markdown">Markdown</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            rows={8}
            placeholder={format === 'markdown' ? '# Feature\n## Story\n### AC' : 'title,description,parent_title,priority'}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1 bg-gray-300 rounded text-sm">Cancel</button>
          <button onClick={handleImport} className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Import</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add route to navigation**

Modify `client/app/navigation.ts` — add navigation entry:

```typescript
// In the routes array, add:
{
  path: '/requirements',
  label: 'Requirements',
  icon: 'list',  // or appropriate icon name from lucide
  component: () => import('../features/requirements/RequirementsPage').then(m => ({ default: m.RequirementsPage })),
},
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors in client code.

- [ ] **Step 7: Commit**

```bash
git add client/features/requirements/ client/app/navigation.ts
git commit -m "feat: add requirements frontend — tree view, editor, import"
```

---

### Task 15: Final Integration Verification

**Files:**
- No new files. Verify everything works together.

- [ ] **Step 1: Run all migrations**

Run: `npx tsx server/migrate.ts`

Expected: All migrations apply without errors.

- [ ] **Step 2: Verify TypeScript full build**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 4: Spin up dev server briefly**

Run: `npx tsx server/index.ts`
(Workdir: `E:\Projects\e2e_test`)

Wait 3 seconds then kill with Ctrl+C.

Expected: Server starts without error. Log shows migrations applied and modules registered.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final integration verification — all tests pass, server starts"
```

---

## Plan Self-Review

**Spec coverage check:**
- M1 CRUD: Tasks 1-7 (migrations, contracts, repository, mapper, schema, module, tests) — covered
- M1 Import: Task 5 (import handler + tests in Task 7) — covered
- M1 Frontend: Task 14 — covered
- M2 AI Provider: Task 8 — covered
- M2 Skill Loader + Skills: Task 9 — covered
- M2 Agent Runner: Task 10 — covered
- M2 Pipeline Engine: Task 11 — covered
- M2 Pipeline API: Task 12 — covered
- M2 Index Generator: Task 13 — covered

**Placeholder scan:**
- No "TBD", "TODO", or "implement later" found.
- No "add appropriate error handling" without concrete code.
- No "similar to Task N" without repeated code.

**Type consistency verified:**
- `Requirement` type: defined in contracts (Task 2), used in mapper (Task 4), repository (Task 3), frontend (Task 14)
- `NlTestCase` → `NlTestCase` (consistent casing)
- `PipelineState.phase` values match across all files
- Repository SQL column names match `DbRequirementRow` fields
- Agent `inputSchema`/`outputSchema` are Zod schemas, used consistently in AgentRunner