# Multi-Page HTML Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one AI Test Gen run attach up to 20 HTML pages and let all three agents retrieve bounded, requirement-relevant page knowledge through `html_knowledge_query` without putting full HTML in prompts or graph state.

**Architecture:** A manifest-first upload API persists one immutable HTML knowledge set per run. The server decodes and indexes each page with `parse5`, finalizes a deterministic page graph, binds the set and an immutable requirement snapshot to the run, and exposes a run-scoped retrieval skill. LangGraph carries only safe reference metadata; full source and indexes remain in SQLite. The frontend owns transient upload/finalization state until run creation succeeds.

**Tech Stack:** TypeScript, Express 5, better-sqlite3, Zod, parse5 8, LangGraph, React 19, Vitest, Testing Library.

---

The approved design is `docs/superpowers/specs/2026-08-21-ai-test-gen-multi-page-html-knowledge-design.md`. Git commit steps are intentionally omitted because the user did not request commits.

## File Structure

### New server files

- `server/migrations/010_add_test_gen_html_knowledge.ts`: schema helper and migration registration object.
- `server/modules/ai-test-gen/html-knowledge/types.ts`: limits, database/domain DTOs, page index, snapshot, query, and safe-reference types.
- `server/modules/ai-test-gen/html-knowledge/normalization.ts`: file-name, text/token, and URL normalization shared by indexing and retrieval.
- `server/modules/ai-test-gen/html-knowledge/parser.ts`: strict byte decoding and inert semantic HTML indexing.
- `server/modules/ai-test-gen/html-knowledge/page-relations.ts`: deterministic page-link and form-action graph.
- `server/modules/ai-test-gen/html-knowledge/requirement-snapshot.ts`: immutable requirement snapshot construction, canonicalization, and hashing.
- `server/modules/ai-test-gen/html-knowledge/repository.ts`: all knowledge-set/page SQL and safe mapping.
- `server/modules/ai-test-gen/html-knowledge/retrieval.ts`: requirement scoring, fair budgeting, and compact valid output.
- `server/modules/ai-test-gen/html-knowledge/service.ts`: manifest, upload, finalization, quota, and run-binding operations.
- `server/modules/ai-test-gen/html-knowledge/router.ts`: project-scoped HTTP endpoints and raw-body controls.
- `server/modules/ai-test-gen/html-knowledge/cleanup.ts`: startup/hourly abandoned-set cleanup.
- `server/modules/ai-test-gen/graph/skills/html-knowledge.ts`: dynamic `html_knowledge_query` skill and safe state summary.
- `server/modules/ai-test-gen/runtime.ts`: shared Test Gen runtime and project-deletion lifecycle.

### New client files

- `client/features/ai-test-gen/useHtmlKnowledgeUpload.ts`: transient multi-file upload/finalize/recovery state machine.
- `client/features/ai-test-gen/HtmlKnowledgeSection.tsx`: focused file-picker and per-page status UI.

### New tests

- `server/modules/ai-test-gen/__tests__/fixtures/html-knowledge-fixtures.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-schema.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts`
- `server/modules/ai-test-gen/__tests__/html-page-relations.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-retrieval.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-repository.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-service.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-api.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-skill.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-recovery.test.ts`
- `server/modules/ai-test-gen/__tests__/html-knowledge-cleanup.test.ts`
- `client/features/ai-test-gen/__tests__/HtmlKnowledgeSection.test.tsx`
- `client/features/ai-test-gen/__tests__/useHtmlKnowledgeUpload.test.tsx`
- `client/shared/services/__tests__/api.test.ts`

## Task 1: Add Dependency, Core Types, And Database Schema

**Files:**
- Modify: `package.json:19-48`
- Modify: `package-lock.json`
- Create: `server/migrations/010_add_test_gen_html_knowledge.ts`
- Modify: `server/migrations/index.ts:3-27`
- Create: `server/modules/ai-test-gen/html-knowledge/types.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-schema.test.ts`
- Modify: `server/seed.ts:16-55`

- [ ] **Step 1: Write the failing schema test**

Create an in-memory `better-sqlite3` database, create minimal `projects` and `test_gen_runs` parent tables, invoke the exported schema helper, and verify state constraints, uniqueness, run cascade, and project restriction:

```ts
// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';

describe('HTML knowledge schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE test_gen_runs (id TEXT PRIMARY KEY);
    `);
    applyHtmlKnowledgeSchema(db);
    db.prepare('INSERT INTO projects (id) VALUES (?)').run('project-1');
  });

  afterEach(() => db.close());

  it('enforces set state and cascades pages from a run', () => {
    db.prepare(`INSERT INTO test_gen_runs (id) VALUES (?)`).run('run-1');
    db.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, page_graph,
         index_version, requirement_snapshot, requirement_snapshot_hash)
      VALUES (?, ?, ?, 'BOUND', 1, 10, '[]', 1, '{}', 'hash')
    `).run('set-1', 'project-1', 'run-1');
    db.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
         status, warnings)
      VALUES (?, ?, ?, ?, 10, 'PENDING', '[]')
    `).run('page-1', 'set-1', 'a.html', 'a.html');

    db.prepare('DELETE FROM test_gen_runs WHERE id = ?').run('run-1');
    expect(db.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_pages').get()).toEqual({ count: 0 });
  });

  it('rejects deleting a project with an unbound set', () => {
    db.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, page_graph, index_version)
      VALUES ('set-1', 'project-1', 'UPLOADING', 0, 0, '[]', 1)
    `).run();

    expect(() => db.prepare('DELETE FROM projects WHERE id = ?').run('project-1')).toThrow();
  });
});
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run:

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-schema.test.ts
```

Expected: FAIL because migration 010 and `applyHtmlKnowledgeSchema` do not exist.

- [ ] **Step 3: Install parse5 as a direct production dependency**

Run:

```powershell
npm install parse5@^8.0.1
```

Expected: `package.json` lists `parse5` under `dependencies`, and the lockfile no longer marks the only parse5 installation as dev-only.

- [ ] **Step 4: Add core types and fixed limits**

Define and export constants and contracts in `types.ts`:

```ts
export const HTML_KNOWLEDGE_INDEX_VERSION = 1;
export const MAX_HTML_PAGES = 20;
export const MAX_HTML_PAGE_BYTES = 512 * 1024;
export const MAX_HTML_SET_BYTES = 5 * 1024 * 1024;
export const MAX_HTML_INDEX_BYTES = 1024 * 1024;
export const MAX_HTML_SET_INDEX_BYTES = 10 * 1024 * 1024;
export const MAX_HTML_TOOL_CHARS = 6000;
export const MAX_HTML_QUERY_IDS = 20;
export const MAX_HTML_CACHE_ENTRIES = 100;

export type HtmlKnowledgeSetStatus = 'UPLOADING' | 'READY' | 'BOUND';
export type HtmlKnowledgePageStatus = 'PENDING' | 'READY' | 'FAILED';
export type HtmlInformationLevel = 'NORMAL' | 'LOW_INFORMATION';

export interface HtmlKnowledgeReference {
  knowledgeSetId: string;
  pageCount: number;
  totalBytes: number;
  pageTitles: string[];
  hasLowInformationPages: boolean;
  requirementSnapshotHash: string;
}

export interface HtmlRequirementSnapshotRecord {
  id: string;
  projectId: string;
  level: 'epic' | 'story' | 'ac';
  parentId?: string;
  title: string;
  description: string;
  position: number;
  isFlow: boolean;
  relatedRequirementIds: string[];
}

export interface HtmlRequirementSnapshot {
  version: 1;
  projectId: string;
  selectedRequirementIds: string[];
  selectedFlowIds: string[];
  records: HtmlRequirementSnapshotRecord[];
}
```

Add the remaining index, element, relation, safe DTO, manifest, and query-result interfaces exactly as defined in the approved design, using uppercase internal/API status values.

- [ ] **Step 5: Implement migration 010**

Export `applyHtmlKnowledgeSchema(database)` and call it from the migration's `up`. Include `file_name_key` so Unicode-normalized/case-folded names can be uniquely indexed independently of SQLite's ASCII-only `NOCASE`:

```ts
import type Database from 'better-sqlite3';
import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export function applyHtmlKnowledgeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS test_gen_html_knowledge_sets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      run_id TEXT UNIQUE REFERENCES test_gen_runs(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('UPLOADING', 'READY', 'BOUND')),
      page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
      total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
      page_graph TEXT NOT NULL DEFAULT '[]',
      index_version INTEGER NOT NULL,
      requirement_snapshot TEXT,
      requirement_snapshot_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (status = 'BOUND' AND run_id IS NOT NULL AND requirement_snapshot IS NOT NULL AND requirement_snapshot_hash IS NOT NULL)
        OR
        (status IN ('UPLOADING', 'READY') AND run_id IS NULL AND requirement_snapshot IS NULL AND requirement_snapshot_hash IS NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS test_gen_html_knowledge_pages (
      id TEXT PRIMARY KEY,
      knowledge_set_id TEXT NOT NULL REFERENCES test_gen_html_knowledge_sets(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_name_key TEXT NOT NULL,
      expected_byte_size INTEGER NOT NULL CHECK (expected_byte_size >= 0),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'READY', 'FAILED')),
      error_message TEXT,
      page_title TEXT,
      sha256 TEXT,
      byte_size INTEGER,
      normalized_html TEXT,
      knowledge_index TEXT,
      information_level TEXT CHECK (information_level IS NULL OR information_level IN ('NORMAL', 'LOW_INFORMATION')),
      warnings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_html_knowledge_sets_project ON test_gen_html_knowledge_sets(project_id);
    CREATE INDEX IF NOT EXISTS idx_html_knowledge_pages_set ON test_gen_html_knowledge_pages(knowledge_set_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_html_knowledge_pages_name
      ON test_gen_html_knowledge_pages(knowledge_set_id, file_name_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_html_knowledge_pages_hash
      ON test_gen_html_knowledge_pages(knowledge_set_id, sha256)
      WHERE sha256 IS NOT NULL;
  `);
}

export const migration010AddTestGenHtmlKnowledge: Migration = {
  id: '010_add_test_gen_html_knowledge',
  up: () => applyHtmlKnowledgeSchema(db),
};
```

- [ ] **Step 6: Register migration and make seed reset compatible**

Import migration 010 in `server/migrations/index.ts`, append it after migration 009, and insert this before `DELETE FROM test_gen_runs` in `clearAllData()`:

```sql
DELETE FROM test_gen_html_knowledge_sets WHERE run_id IS NULL;
```

Bound sets cascade when runs are deleted.

- [ ] **Step 7: Run schema test and typecheck**

Run:

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-schema.test.ts
npm run lint
```

Expected: schema test PASS. Typecheck has no errors introduced by Task 1.

## Task 2: Implement Inert HTML Parsing And Semantic Indexing

**Files:**
- Create: `server/modules/ai-test-gen/html-knowledge/normalization.ts`
- Create: `server/modules/ai-test-gen/html-knowledge/parser.ts`
- Create: `server/modules/ai-test-gen/__tests__/fixtures/html-knowledge-fixtures.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts`

- [ ] **Step 1: Add representative fixtures and failing parser tests**

Fixtures must include a login form, dashboard page, malformed HTML, SPA shell, script/style/comment/SVG content, prompt-injection text, deep markup, node-heavy markup, chunk-heavy forms, element-heavy controls, and 201 select options. Assert strict UTF-8, SHA-256, normalized line endings, labels, ARIA, validation attributes, source lines, deterministic chunk IDs, exclusions, low-information status, and every resource limit.

Use this API in tests:

```ts
const source = decodeAndNormalizeHtml(new TextEncoder().encode(LOGIN_HTML));
const indexed = parseAndIndexHtml({
  pageId: 'page-login',
  fileName: 'login.html',
  source,
});

expect(indexed.pageTitle).toBe('Sign in');
expect(indexed.informationLevel).toBe('NORMAL');
expect(indexed.serializedIndex).not.toContain('globalThis.__htmlKnowledgeExecuted');
expect(indexed.serializedIndex).not.toContain('secret-value');
expect(indexed.index.chunks.some((chunk) =>
  chunk.elements.some((element) => element.dataTestId === 'login-email')
)).toBe(true);
```

- [ ] **Step 2: Run parser tests and confirm failure**

Run:

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts
```

Expected: FAIL because normalization/parser exports do not exist.

- [ ] **Step 3: Implement shared normalization helpers**

Implement:

```ts
export function normalizeHtmlFileName(fileName: string): { displayName: string; key: string };
export function normalizeStaticText(value: string, maxChars = 2000): string;
export function tokenizeHtmlKnowledge(value: string): string[];
export function sanitizeHtmlRoute(raw: string, base?: string): SanitizedHtmlRoute | null;
```

`normalizeHtmlFileName` must enforce NFC, 255 Unicode code points, no control characters/slashes, and `.html`/`.htm`. The key is `displayName.normalize('NFC').toLocaleLowerCase('en-US')`. Tokenization uses NFKC lowercase Latin/number tokens plus CJK bigrams. URI sanitization rejects executable schemes, strips fragments/userinfo/all query values, and retains sorted query parameter names.

- [ ] **Step 4: Implement strict byte decoding**

```ts
export function decodeAndNormalizeHtml(rawBytes: Uint8Array): NormalizedHtmlSource {
  if (rawBytes.byteLength > MAX_HTML_PAGE_BYTES) throw new HtmlKnowledgeLimitError('HTML page exceeds 512 KiB');
  if (rawBytes.includes(0)) throw new HtmlKnowledgeValidationError('HTML page contains NUL bytes');

  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  const normalizedHtml = decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (normalizedHtml.includes('\0')) throw new HtmlKnowledgeValidationError('HTML page contains NUL characters');

  return {
    byteSize: rawBytes.byteLength,
    sha256: createHash('sha256').update(rawBytes).digest('hex'),
    normalizedHtml,
  };
}
```

- [ ] **Step 5: Implement iterative parse5 indexing**

Use named parse5 imports, `parse(source.normalizedHtml, { scriptingEnabled: false, sourceCodeLocationInfo: true })`, an explicit stack that includes `template.content`, deterministic lowercase `nth-of-type` paths, and two passes: inventory/labels, then chunks/elements. Retain only fields approved in the design. Do not evaluate scripts, patterns, resources, or event-handler values.

Create deterministic IDs with:

```ts
function chunkId(contentSha256: string, sectionType: string, domPath: string): string {
  return `hkc-${createHash('sha256')
    .update(`${contentSha256}\0${sectionType}\0${domPath}`)
    .digest('hex')
    .slice(0, 24)}`;
}
```

Enforce hard node/depth/chunk/element/index limits and soft option/text truncation warnings. Compute the index byte limit with `Buffer.byteLength(serializedIndex, 'utf8')`.

- [ ] **Step 6: Run parser tests**

Run:

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts
```

Expected: PASS with deterministic output across repeated indexing.

## Task 3: Build Cross-Page Relations

**Files:**
- Create: `server/modules/ai-test-gen/html-knowledge/page-relations.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-page-relations.test.ts`

- [ ] **Step 1: Write failing relation tests**

Test exact canonical path, exact file path, unique suffix, form action, ambiguity, external origin, fragment/JavaScript/data URLs, self-edge removal, query-value stripping, deterministic sort, and 2,000-edge limit.

```ts
const result = buildHtmlPageRelations([loginIndex, dashboardIndex]);
expect(result.relations).toContainEqual(expect.objectContaining({
  fromPageId: 'page-login',
  toPageId: 'page-dashboard',
  type: 'form-action',
  matchRule: 'canonical-path',
  confidence: 'high',
}));
expect(JSON.stringify(result)).not.toContain('secret');
```

- [ ] **Step 2: Run relation tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-page-relations.test.ts
```

Expected: FAIL because the relation builder does not exist.

- [ ] **Step 3: Implement deterministic relation matching**

Export:

```ts
export function buildHtmlPageRelations(
  pages: readonly HtmlKnowledgePageIndex[],
): HtmlPageRelationBuildResult;
```

Normalize candidates first, then match in strict order: canonical path, file path, unique path suffix. Emit no edge for zero/multiple candidates, add a bounded page warning for ambiguity, deduplicate by source/target/type/path/target, and sort by normalized source file, DOM path, type, and target.

- [ ] **Step 4: Run relation and parser tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-page-relations.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts
```

Expected: PASS.

## Task 4: Implement Requirement Snapshot And Retrieval

**Files:**
- Create: `server/modules/ai-test-gen/html-knowledge/requirement-snapshot.ts`
- Create: `server/modules/ai-test-gen/html-knowledge/retrieval.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-retrieval.test.ts`

- [ ] **Step 1: Write failing snapshot/retrieval tests**

Cover canonical snapshot ordering/hash, story and AC query, AC-to-story canonicalization, disallowed IDs, Latin/CJK tokens, focus terms, exact weights, one-time relation boost, deterministic ties, many-to-many shared chunks, fair round-robin budgeting, no-match outline, cache-independent determinism, and valid compact JSON at exactly/below 6,000 code units.

```ts
const serialized = queryHtmlKnowledge(context, {
  requirementIds: ['ac-login-password', 'story-dashboard'],
  focus: 'validation',
  maxResults: 5,
});
const result = JSON.parse(serialized);

expect(serialized.length).toBeLessThanOrEqual(6000);
expect(result.matches[0]).toMatchObject({
  requestedRequirementId: 'ac-login-password',
  canonicalRequirementId: 'story-login',
});
expect(result.chunks.some((chunk: any) => chunk.fileName === 'login.html')).toBe(true);
```

- [ ] **Step 2: Run retrieval tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-retrieval.test.ts
```

Expected: FAIL because snapshot and retrieval functions do not exist.

- [ ] **Step 3: Implement versioned immutable snapshots**

Export pure functions:

```ts
export function buildHtmlRequirementSnapshot(input: {
  projectId: string;
  selectedRequirementIds: string[];
  selectedFlowIds: string[];
  requirements: Requirement[];
}): HtmlRequirementSnapshot;

export function serializeHtmlRequirementSnapshot(snapshot: HtmlRequirementSnapshot): string;
export function hashHtmlRequirementSnapshot(snapshot: HtmlRequirementSnapshot): string;
```

Include selected stories, ACs, ancestors, selected flow stories/ACs, referenced component stories, and stable epic grouping. Sort ID arrays and records before compact serialization.

- [ ] **Step 4: Implement scoring and compact valid serialization**

For each unique query token, add only its highest category score per chunk: 12 identity/accessibility, 8 heading/form/page/route, 6 label/validation, 3 static text, then one relation boost of 2. Sort by score, normalized file name, DOM path, chunk ID. Allocate rank 1 across requirements before rank 2. Add evidence only when re-serializing remains `<= 6000`; never slice JSON.

Return a compact string with `source`, `matches`, unique `chunks`, `omittedRequirementIds`, `truncated`, and bounded warnings.

- [ ] **Step 5: Run retrieval tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-retrieval.test.ts
```

Expected: PASS.

## Task 5: Implement Repository And Upload/Finalize Service

**Files:**
- Create: `server/modules/ai-test-gen/html-knowledge/repository.ts`
- Create: `server/modules/ai-test-gen/html-knowledge/service.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-repository.test.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-service.test.ts`
- Modify: `server/modules/ai-test-gen/infra/semaphore.ts:1-38`
- Modify: `server/modules/ai-test-gen/__tests__/semaphore.test.ts`

- [ ] **Step 1: Write failing repository/service tests**

Use an injected in-memory database with migration 010. Test manifest validation, stable page IDs, Unicode duplicate keys, per-page idempotency, failed retry, duplicate hash, exact byte totals, index quotas, finalization CAS, immutable finalized sets, graph persistence, safe DTOs, bound/unbound quotas, cleanup, and start-binding CAS branches.

- [ ] **Step 2: Write failing nonblocking semaphore test**

```ts
it('fails immediately when no slot is available', () => {
  const semaphore = new Semaphore(1);
  expect(semaphore.tryAcquire()).toBe(true);
  expect(semaphore.tryAcquire()).toBe(false);
  semaphore.release();
  expect(semaphore.tryAcquire()).toBe(true);
});
```

- [ ] **Step 3: Run tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-repository.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-service.test.ts server/modules/ai-test-gen/__tests__/semaphore.test.ts
```

Expected: FAIL because repository/service and `tryAcquire` do not exist.

- [ ] **Step 4: Implement repository transactions and safe mappers**

Make `HtmlKnowledgeRepository` accept a `Database.Database` constructor argument defaulting to the shared DB. Implement set/page lookup with both project and object IDs, manifest insertion, page state transitions, quota sums, finalization CAS, bound lookup, cleanup, and safe response mapping that never selects/returns `normalized_html`, `knowledge_index`, or requirement snapshot except in dedicated internal methods.

- [ ] **Step 5: Implement upload service**

The service must:

```ts
createSet(projectId, manifest)
getSet(projectId, setId)
uploadPage(projectId, setId, pageId, rawBytes)
removePage(projectId, setId, pageId)
finalizeSet(projectId, setId)
deleteUnboundSet(projectId, setId)
```

Validate the full manifest before insert. `uploadPage` compares raw byte size with manifest, calls decode/index, and updates page atomically. If a READY page receives the same hash, return its safe DTO; a different hash conflicts. Finalization requires all pages READY, builds relations from persisted indexes, checks total index bytes, and CAS transitions UPLOADING to READY.

- [ ] **Step 6: Add nonblocking semaphore support**

Implement:

```ts
tryAcquire(): boolean {
  if (this.current >= this.max) return false;
  this.current += 1;
  return true;
}
```

Guard `release()` against underflow.

- [ ] **Step 7: Run repository/service tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-repository.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-service.test.ts server/modules/ai-test-gen/__tests__/semaphore.test.ts
```

Expected: PASS.

## Task 6: Add Project-Scoped HTTP API And Error Handling

**Files:**
- Create: `server/modules/ai-test-gen/html-knowledge/router.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-api.test.ts`
- Modify: `server/modules/ai-test-gen/index.ts:6-144`
- Modify: `server/shared/http/errors.ts:1-30`
- Modify: `server/shared/http/responses.ts:1-12`
- Modify: `server/app/createApp.ts:7-18`

- [ ] **Step 1: Write failing API tests on an isolated Express app**

Use an ephemeral HTTP listener with injected fake service. Verify all six routes, exact project scoping, safe GET response, original raw bytes, content type, non-identity encoding rejection, JSON 413, 415, and 429 envelopes, parse-slot release after errors, and per-IP 60/minute rate limiting.

- [ ] **Step 2: Run API tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-api.test.ts
```

Expected: FAIL because the router does not exist.

- [ ] **Step 3: Add typed HTTP errors and final Express error middleware**

Add `PayloadTooLargeError` (413), `UnsupportedMediaTypeError` (415), and `TooManyRequestsError` (429). Extend `handleApiError` to recognize body-parser `entity.too.large` and `encoding.unsupported` while preserving `{ error }`. Add a final four-argument middleware after `registerRoutes(app)`:

```ts
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  handleApiError(res, error);
});
```

- [ ] **Step 4: Implement router factory and middleware order**

Mount under `/:projectId/html-knowledge-sets`. For page PUT: ownership/state precheck, encoding/content-type/rate checks, nonblocking parse slot, `express.raw({ type: 'text/html', limit: 512 * 1024, inflate: false })`, service call, finally release. Use one in-memory fixed-window IP limiter and expose reset hooks only for tests.

- [ ] **Step 5: Mount router before generic run routes**

In `ai-test-gen/index.ts`, call:

```ts
router.use('/:projectId/html-knowledge-sets', createHtmlKnowledgeRouter(htmlKnowledgeService));
```

before generic `/:runId` handlers.

- [ ] **Step 6: Run API tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-api.test.ts
```

Expected: PASS.

## Task 7: Atomically Bind Knowledge To A Run And Add Lifecycle Cleanup

**Files:**
- Create: `server/modules/ai-test-gen/runtime.ts`
- Create: `server/modules/ai-test-gen/html-knowledge/cleanup.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-cleanup.test.ts`
- Modify: `server/modules/ai-test-gen/schema.ts:3-15`
- Modify: `server/modules/ai-test-gen/context.ts:28-39`
- Modify: `server/modules/ai-test-gen/controller.ts:59-69`
- Modify: `server/modules/ai-test-gen/repository.ts:44-219`
- Modify: `server/modules/ai-test-gen/index.ts:6-144`
- Modify: `server/modules/projects/index.ts:1-12`
- Modify: `server/app/startServer.ts:17-75`
- Modify: `server/seed.ts:16-55`
- Test: `server/modules/ai-test-gen/__tests__/service.test.ts`
- Create: `server/modules/projects/__tests__/test-gen-deletion-lifecycle.test.ts`

- [ ] **Step 1: Write failing atomic-start and cleanup tests**

Test READY creates/binds one run, repeated BOUND start returns existing run without invoking orchestrator, concurrent CAS returns the winner, invalid statuses create no run, config stores only set ID, cleanup deletes only unbound sets older than 24 hours, timer is unref'd/stoppable, run deletion evicts cache before cascade, and project deletion removes all runs and unbound sets before the project.

- [ ] **Step 2: Run lifecycle tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/service.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-cleanup.test.ts server/modules/projects/__tests__/test-gen-deletion-lifecycle.test.ts
```

Expected: FAIL because atomic binding/runtime cleanup do not exist.

- [ ] **Step 3: Extend start schema and params**

Add:

```ts
htmlKnowledgeSetId: z.string().min(1).optional(),
```

to `startPipelineSchema` and `StartParams`.

- [ ] **Step 4: Implement create-or-reuse transaction**

In the HTML service/repository transaction:

```ts
if (set.status === 'BOUND') return { runId: set.run_id!, created: false };
if (set.status !== 'READY') throw new ConflictError('HTML knowledge set is not ready');

const snapshot = buildHtmlRequirementSnapshot({
  projectId,
  selectedRequirementIds: params.requirementIds,
  selectedFlowIds: params.flowIds ?? [],
  requirements: requirementRepo.listByProject(projectId),
});
const snapshotJson = serializeHtmlRequirementSnapshot(snapshot);
const snapshotHash = hashHtmlRequirementSnapshot(snapshot);
pipelineRepo.createRun(runId, projectId, params.mode, params);
const changed = bindReadySet.run(runId, snapshotJson, snapshotHash, setId, projectId).changes;
if (changed !== 1) throw new HtmlKnowledgeConcurrentStartError();
return { runId, created: true };
```

Make `startPipeline` invoke `orchestrator.start` only for `created: true`, and return a response flag so the route can use 201 versus 200.

- [ ] **Step 5: Introduce shared runtime and project deletion lifecycle**

Move the singleton `TestGenController` out of `index.ts` into `runtime.ts`. Export `deleteProjectTestGenData(projectId)` that lists all run IDs without a 50-row limit, aborts/deletes each through the shared orchestrator, deletes unbound sets, then allows the project repository removal. Replace the generic projects repository only for `remove`; preserve all other CRUD behavior.

- [ ] **Step 6: Add abandoned-set cleanup**

Export `startHtmlKnowledgeCleanup()` that runs immediately, schedules hourly cleanup, calls `unref()`, and returns `stop()`. Start it from `startServer.ts` after migrations. Keep timers out of import side effects.

- [ ] **Step 7: Keep run list/detail responses source-safe**

Map only `htmlKnowledgeSetId` and safe reference metadata into run responses. Add tests proving `normalized_html`, `knowledge_index`, and `requirement_snapshot` never appear in list, active-run, or detail JSON.

- [ ] **Step 8: Run lifecycle tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/service.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-cleanup.test.ts server/modules/projects/__tests__/test-gen-deletion-lifecycle.test.ts
```

Expected: PASS.

## Task 8: Add Dynamic Skill With Safe Persistence And Prompt Policy

**Files:**
- Create: `server/modules/ai-test-gen/graph/skills/html-knowledge.ts`
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-skill.test.ts`
- Modify: `server/modules/ai-test-gen/graph/skills/skills.ts:197-238`
- Modify: `server/modules/ai-test-gen/graph/nodes/types.ts`
- Modify: `server/modules/ai-test-gen/graph/nodes/utils.ts:275-479`
- Modify: `server/modules/ai-test-gen/graph/nodes/analyst.ts:38-129`
- Modify: `server/modules/ai-test-gen/graph/nodes/designer.ts:34-140`
- Modify: `server/modules/ai-test-gen/graph/nodes/quality.ts:35-120`
- Modify: `server/modules/ai-test-gen/graph/prompts.ts:164-966`
- Modify: `server/modules/ai-test-gen/infra/prompt-version.ts`
- Test: `server/modules/ai-test-gen/__tests__/skills.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/prompts.test.ts`

- [ ] **Step 1: Write failing skill, persistence, and prompt tests**

Verify all three role builders include the skill only with valid runtime/reference, schema parsing/canonicalization, current-batch allowlist, compact result caching, critical retrieval failures, model conversation gets an evidence marker, persisted `toolCallRecords` never contain that marker, and all eight source-of-truth rules remain in default/custom prompts.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-skill.test.ts server/modules/ai-test-gen/__tests__/skills.test.ts server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts server/modules/ai-test-gen/__tests__/prompts.test.ts
```

Expected: FAIL because dynamic skill/policy/persistence projection do not exist.

- [ ] **Step 3: Add per-skill persistence projection**

Extend `SkillDefinition`:

```ts
summarizeForState?: (
  input: unknown,
  result: unknown,
  meta: { latencyMs: number; resultSize: number },
) => { input: unknown; output: unknown };
```

In `runAgentReActLoop`, send the full result to the ephemeral tool message but store the projection in `toolCallRecords`. Include real latency. Add `html_knowledge_query` to critical tools for repository/retrieval failures; malformed model arguments should return a bounded corrective tool result.

- [ ] **Step 4: Implement run-scoped FIFO cache and skill factory**

The factory validates its own Zod input, accepts at most 20 IDs, builds the exact batch allowlist from snapshot/currentBatch, re-verifies BOUND set identity, queries retrieval, and returns compact JSON string. Cache up to 100 entries and evict oldest insertion on overflow. Its state summary contains IDs, confidence, page/chunk IDs, size, truncation, and cache hit only.

- [ ] **Step 5: Append immutable HTML policy outside custom-prompt branches**

Add one helper that appends requirements/flow precedence, untrusted evidence, no scope expansion, conflict-as-risk, no-match warning, and role-specific query guidance whenever `state.htmlKnowledgeReference` exists. Call it after selecting custom/default base prompt for all three roles. Bump prompt version to `ai-test-gen-v2`.

- [ ] **Step 6: Run focused skill/prompt tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-skill.test.ts server/modules/ai-test-gen/__tests__/skills.test.ts server/modules/ai-test-gen/__tests__/structured-output-utils.test.ts server/modules/ai-test-gen/__tests__/prompts.test.ts
```

Expected: PASS, and evidence marker absent from persisted state.

## Task 9: Propagate Runtime Metadata Through LangGraph And Recovery

**Files:**
- Create: `server/modules/ai-test-gen/__tests__/html-knowledge-recovery.test.ts`
- Modify: `server/modules/ai-test-gen/context.ts:12-191`
- Modify: `server/modules/ai-test-gen/orchestrator.ts:154-1300`
- Modify: `server/modules/ai-test-gen/business-flow-blueprint.ts`
- Modify: `server/modules/ai-test-gen/session.ts:10-269`
- Modify: `server/modules/ai-test-gen/graph/state.ts:121-197`
- Modify: `server/modules/ai-test-gen/graph/graph.ts:13-76`
- Modify: `server/modules/ai-test-gen/graph/nodes/preparation.ts:15-170`
- Test: `server/modules/ai-test-gen/__tests__/graph-state.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/graph-compile.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/session.test.ts`
- Test: `server/modules/ai-test-gen/__tests__/service.test.ts`

- [ ] **Step 1: Write failing propagation/recovery tests**

Cover metadata-only state, runtime held in graph closure, explicit `startBatch` copy, snapshot-backed initial/remaining/fallback batches, checkpoint/reference mismatch before provider call, no-thread retry, start-only checkpoint restart, meaningful checkpoint resume, completed-agent-log fallback, requirement edits after start, and configured-missing knowledge failure before LLM.

- [ ] **Step 2: Run recovery slice and confirm failure**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-recovery.test.ts server/modules/ai-test-gen/__tests__/session.test.ts server/modules/ai-test-gen/__tests__/graph-state.test.ts server/modules/ai-test-gen/__tests__/graph-compile.test.ts server/modules/ai-test-gen/__tests__/service.test.ts
```

Expected: FAIL because metadata/runtime propagation is absent.

- [ ] **Step 3: Resolve runtime in ContextBuilder safely**

Add optional `htmlKnowledge` runtime to `RunContext`. After acquiring the semaphore, wrap all provider/runtime construction in one try/catch that releases on any build error. Resolve configured knowledge by run ID/project/set ID, verify BOUND status/hash/index version, create run-scoped cache, and dispose it on release/delete. Include the abort signal in `isAborted()`.

- [ ] **Step 4: Add state and explicit copies**

Add `htmlKnowledgeReference` to LangGraph annotation, `BatchInput`, `BatchLoopParams`, `buildBatchInputState`, and the literal object in `TestGenSession.startBatch`. Pass non-persisted runtime through `SessionOptions -> buildTestGenGraph -> agent node options`.

- [ ] **Step 5: Use one snapshot-backed requirement source helper**

Create a helper used by start, remaining batches, retry rebuild, flow blueprint creation, and preparation:

```ts
function loadRunRequirementSource(
  projectId: string,
  config: StartParams,
  htmlKnowledge?: ResolvedHtmlKnowledgeRuntime,
): Requirement[] {
  return htmlKnowledge
    ? requirementsFromHtmlSnapshot(htmlKnowledge.snapshot)
    : requirementRepo.listByProject(projectId);
}
```

No HTML-backed path may silently fall back to live repository rows.

- [ ] **Step 6: Classify checkpoints and add pre-thread retry**

Add `inspectCheckpoint(threadId)` returning `none`, `start-only`, or `meaningful`. No thread/missing/start-only rebuilds the persisted current batch from snapshot and calls `startBatch` with a fresh thread. Only typed checkpoint-unavailable/corrupt errors trigger fallback; a real second agent/tool failure propagates without another LLM attempt.

- [ ] **Step 7: Run recovery and AI Test Gen regression tests**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-recovery.test.ts server/modules/ai-test-gen/__tests__/session.test.ts server/modules/ai-test-gen/__tests__/graph-state.test.ts server/modules/ai-test-gen/__tests__/graph-compile.test.ts server/modules/ai-test-gen/__tests__/service.test.ts
```

Expected: PASS.

## Task 10: Add Typed Client API And Upload State Machine

**Files:**
- Modify: `client/shared/services/api.ts:18-175`
- Modify: `client/shared/test-gen-run/types.ts:69-81`
- Create: `client/features/ai-test-gen/useHtmlKnowledgeUpload.ts`
- Create: `client/features/ai-test-gen/__tests__/useHtmlKnowledgeUpload.test.tsx`
- Create: `client/shared/services/__tests__/api.test.ts`

- [ ] **Step 1: Write failing transport and hook tests**

Test exact routes/methods/content type/original File body, client validation (21 files, >512 KiB, >5 MiB, bad extension, NFC/case duplicate), two-worker upload, persisted status reconciliation after lost response, retry/remove, finalize, immutable-set rebuild after removal, project change cleanup using old project ID, reset cleanup, and ownership transfer after start.

- [ ] **Step 2: Run client API/hook tests and confirm failure**

```powershell
npx vitest run --config vitest.config.ts client/shared/services/__tests__/api.test.ts client/features/ai-test-gen/__tests__/useHtmlKnowledgeUpload.test.tsx
```

Expected: FAIL because client DTOs/API/hook do not exist.

- [ ] **Step 3: Add typed API contracts and methods**

Export uppercase set/page/information status types and safe DTOs. Add:

```ts
api.testGen.htmlKnowledge.createSet(projectId, { pages })
api.testGen.htmlKnowledge.getSet(projectId, setId)
api.testGen.htmlKnowledge.uploadPage(projectId, setId, pageId, file, signal)
api.testGen.htmlKnowledge.deletePage(projectId, setId, pageId)
api.testGen.htmlKnowledge.deleteSet(projectId, setId)
api.testGen.htmlKnowledge.finalizeSet(projectId, setId)
```

Upload the original `File` with `Content-Type: text/html; charset=utf-8`. Type `api.testGen.start` with shared `StartConfig`, and add `htmlKnowledgeSetId?: string` to it.

- [ ] **Step 4: Implement the hook state machine**

Expose:

```ts
interface HtmlKnowledgeUploadController {
  rows: readonly HtmlKnowledgeUploadRow[];
  totalBytes: number;
  phase: 'empty' | 'invalid' | 'preparing' | 'ready' | 'failed';
  readySetId?: string;
  isBlockingStart: boolean;
  selectFiles(files: File[]): Promise<void>;
  retryPage(pageId: string): Promise<void>;
  removePage(pageId: string): Promise<void>;
  reset(): Promise<void>;
  releaseAfterStart(): void;
}
```

Keep original Files in memory only. Create one manifest, upload with at most two workers, reconcile GET on upload/finalize failures, finalize only after all pages READY, and guard stale async responses with an operation generation. Cleanup unbound sets best-effort on reset/project change/unmount; never delete after `releaseAfterStart()`.

- [ ] **Step 5: Run transport/hook tests**

```powershell
npx vitest run --config vitest.config.ts client/shared/services/__tests__/api.test.ts client/features/ai-test-gen/__tests__/useHtmlKnowledgeUpload.test.tsx
```

Expected: PASS.

## Task 11: Add HTML Knowledge UI And Start Integration

**Files:**
- Create: `client/features/ai-test-gen/HtmlKnowledgeSection.tsx`
- Create: `client/features/ai-test-gen/__tests__/HtmlKnowledgeSection.test.tsx`
- Modify: `client/features/ai-test-gen/TestGenConfigPanel.tsx:9-30,268-423,659-891`
- Modify: `client/features/ai-test-gen/AiTestGenPage.tsx:27-72,304-313`
- Modify: `client/features/ai-test-gen/AgentPromptsPanel.tsx:18-22`
- Test: `client/features/ai-test-gen/__tests__/TestGenConfigPanel.test.tsx`
- Test: `client/features/ai-test-gen/__tests__/AiTestGenPage.test.tsx`

- [ ] **Step 1: Write failing component/integration tests**

Test multiple picker, count/size, page statuses, retry/remove labels, disclosures, low-information warning, no HTML start, blocked pending/failed start, ready set ID propagation, reset, start success ownership transfer, start failure retaining set, and project A cleanup using project A ID.

- [ ] **Step 2: Run UI tests and confirm failure**

```powershell
npx vitest run --config vitest.config.ts client/features/ai-test-gen/__tests__/HtmlKnowledgeSection.test.tsx client/features/ai-test-gen/__tests__/TestGenConfigPanel.test.tsx client/features/ai-test-gen/__tests__/AiTestGenPage.test.tsx
```

Expected: FAIL because UI integration does not exist.

- [ ] **Step 3: Implement focused HTML Knowledge section**

Use existing settings-column visual language. Render an optional multi-file picker, total count/size, capped file rows, blue uploading, emerald ready, amber LOW_INFORMATION, red failed, accessible Retry/Remove controls, and these always-visible notices:

```text
Relevant HTML excerpts may be sent to the configured AI provider.
Scripts are not executed and linked resources are not fetched.
```

Never render HTML or add drag/drop/source preview.

- [ ] **Step 4: Wire controller and start config**

Instantiate the hook in `AiTestGenPage`, pass it to the panel, and explicitly copy `htmlKnowledgeSetId`. On successful `pipeline.start`, call `releaseAfterStart()` before switching tabs. On failure, keep READY state. Add `htmlKnowledgeSetId?: string` to `TestGenStartConfig`; include `readySetId` in `handleStart`; make `canStart` honor `isBlockingStart`; call upload reset from panel reset.

Also add `html_knowledge_query` to the three role tool lists in `AgentPromptsPanel` so the UI matches actual dynamic capabilities.

- [ ] **Step 5: Run UI tests**

```powershell
npx vitest run --config vitest.config.ts client/features/ai-test-gen/__tests__/HtmlKnowledgeSection.test.tsx client/features/ai-test-gen/__tests__/useHtmlKnowledgeUpload.test.tsx client/features/ai-test-gen/__tests__/TestGenConfigPanel.test.tsx client/features/ai-test-gen/__tests__/AiTestGenPage.test.tsx client/shared/services/__tests__/api.test.ts
```

Expected: PASS.

## Task 12: Full Regression, Leak Checks, And Documentation Sync

**Files:**
- Modify: `server/modules/ai-test-gen/ARCHITECTURE.md`
- Modify: `docs/01-UserGuide.md`
- Verify: all files changed by Tasks 1-11

- [ ] **Step 1: Run focused backend suite**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__/html-knowledge-schema.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-parser.test.ts server/modules/ai-test-gen/__tests__/html-page-relations.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-retrieval.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-repository.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-service.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-api.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-skill.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-recovery.test.ts server/modules/ai-test-gen/__tests__/html-knowledge-cleanup.test.ts
```

Expected: all focused backend tests PASS.

- [ ] **Step 2: Run AI Test Gen regression suite**

```powershell
npx vitest run --config vitest.config.node.ts server/modules/ai-test-gen/__tests__
```

Expected: all AI Test Gen tests PASS.

- [ ] **Step 3: Run frontend feature suite**

```powershell
npx vitest run --config vitest.config.ts client/features/ai-test-gen/__tests__ client/shared/services/__tests__/api.test.ts
```

Expected: all targeted frontend tests PASS.

- [ ] **Step 4: Verify no raw source/index enters graph state or prompts**

Run:

```powershell
rg -n "normalized_html|normalizedHtml|knowledge_index|knowledgeIndex" server/modules/ai-test-gen/graph server/modules/ai-test-gen/context.ts server/modules/ai-test-gen/session.ts server/modules/ai-test-gen/orchestrator.ts server/modules/ai-test-gen/scope.ts
```

Expected: no raw/index fields in graph state, context metadata, session input, batch state, or scope logs. Repository/service imports are not part of this search.

- [ ] **Step 5: Verify every intended propagation point**

```powershell
rg -n "htmlKnowledgeSetId|html_knowledge_query|htmlKnowledgeReference" server/modules/ai-test-gen client/features/ai-test-gen client/shared/test-gen-run client/shared/services/api.ts
```

Expected: start schema/config, context, orchestrator, session explicit copy, graph state, all role skills/prompts, client types/API/panel/page are present.

- [ ] **Step 6: Run static, full, and production-build verification**

```powershell
npm run lint
npm test
npm run build
git diff --check
```

Expected: all commands exit 0. If unrelated pre-existing failures remain, record their exact command output and prove focused HTML tests still pass.

- [ ] **Step 7: Update user and architecture documentation**

Document the optional multi-page HTML selector, limits, LOW_INFORMATION warning, remote-provider disclosure, requirement-first semantics, and `html_knowledge_query` in `docs/01-UserGuide.md`. Add the new artifact/index/skill data flow and key files to `server/modules/ai-test-gen/ARCHITECTURE.md`. Keep documentation aligned with implemented behavior rather than the original proposal if a verified implementation constraint required a change.
