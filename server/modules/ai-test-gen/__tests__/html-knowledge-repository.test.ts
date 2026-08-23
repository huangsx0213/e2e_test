// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';
import { ConflictError } from '../../../shared/http/errors.ts';
import { normalizeHtmlFileName } from '../html-knowledge/normalization.ts';
import { buildHtmlPageRelations } from '../html-knowledge/page-relations.ts';
import { decodeAndNormalizeHtml, parseAndIndexHtml } from '../html-knowledge/parser.ts';
import {
  HtmlKnowledgeDataError,
  HtmlKnowledgeRepository,
  type StoreHtmlKnowledgePageInput,
} from '../html-knowledge/repository.ts';
import {
  hashHtmlRequirementSnapshot,
  serializeHtmlRequirementSnapshot,
} from '../html-knowledge/requirement-snapshot.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  HTML_KNOWLEDGE_UNBOUND_TTL_MS,
  MAX_HTML_BOUND_BYTES_PER_PROJECT,
  MAX_HTML_ERROR_CHARS,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_SET_INDEX_BYTES,
  MAX_HTML_UNBOUND_BYTES_PER_PROJECT,
  MAX_HTML_UNBOUND_SETS_PER_PROJECT,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgeReference,
  type HtmlKnowledgeSetDto,
  type HtmlPageRelation,
  type HtmlRequirementSnapshot,
} from '../html-knowledge/types.ts';

const encoder = new TextEncoder();
const buildEmptyPageGraph = () => ({ relations: [], warningsByPageId: {} });

interface ConcurrencyWorkerOutcome {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
  };
}

function runConcurrencyWorker(workerData: Record<string, unknown>): Promise<ConcurrencyWorkerOutcome> {
  const workerPath = fileURLToPath(new URL(
    './fixtures/html-knowledge-concurrency-worker.mjs',
    import.meta.url,
  ));
  const worker = new Worker(workerPath, {
    workerData,
  });
  return new Promise((resolve, reject) => {
    let outcome: ConcurrencyWorkerOutcome | undefined;
    worker.once('message', (message: ConcurrencyWorkerOutcome) => {
      outcome = message;
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Concurrency worker exited with code ${code}`));
      } else if (outcome) {
        resolve(outcome);
      } else {
        reject(new Error('Concurrency worker exited without a result'));
      }
    });
  });
}

function createFileDatabase(filePath: string): Database.Database {
  const fileDatabase = new Database(filePath, { timeout: 5_000 });
  fileDatabase.pragma('foreign_keys = ON');
  fileDatabase.pragma('journal_mode = WAL');
  fileDatabase.pragma('busy_timeout = 5000');
  fileDatabase.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE test_gen_runs (id TEXT PRIMARY KEY, project_id TEXT);
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
  applyHtmlKnowledgeSchema(fileDatabase);
  return fileDatabase;
}

function makeDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE test_gen_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
  applyHtmlKnowledgeSchema(database);
  return database;
}

function snapshot(projectId = 'project-1'): HtmlRequirementSnapshot {
  return {
    version: 1,
    projectId,
    selectedRequirementIds: ['story-login'],
    selectedFlowIds: [],
    records: [{
      id: 'story-login',
      projectId,
      level: 'story',
      title: 'Log in',
      description: 'The user signs in',
      position: 1,
      status: 'APPROVED',
      flowType: null,
      isFlow: false,
      relatedRequirementIds: [],
    }],
  };
}

function indexedInput(pageId: string, fileName: string, html: string): StoreHtmlKnowledgePageInput {
  const source = decodeAndNormalizeHtml(encoder.encode(html));
  const indexed = parseAndIndexHtml({ pageId, fileName, source });
  return {
    sha256: source.sha256,
    byteSize: source.byteSize,
    normalizedHtml: source.normalizedHtml,
    pageTitle: indexed.pageTitle,
    knowledgeIndex: indexed.serializedIndex,
    informationLevel: indexed.informationLevel,
    warnings: indexed.warnings,
  };
}

function minimalIndex(input: {
  pageId: string;
  fileName: string;
  hash: string;
  paddingChars?: number;
  version?: number | string;
}): string {
  const name = normalizeHtmlFileName(input.fileName);
  return JSON.stringify({
    version: input.version ?? HTML_KNOWLEDGE_INDEX_VERSION,
    pageId: input.pageId,
    fileName: name.displayName,
    fileNameKey: name.key,
    pageTitle: name.displayName,
    contentSha256: input.hash,
    informationLevel: 'NORMAL',
    routeAliases: [],
    chunks: [],
    relationCandidates: [],
    warnings: [],
    ...(input.paddingChars ? { padding: 'x'.repeat(input.paddingChars) } : {}),
  });
}

function createReadySet(
  repository: HtmlKnowledgeRepository,
  pages: ReadonlyArray<{ fileName: string; html: string }>,
): HtmlKnowledgeSetDto {
  const manifest = pages.map((page) => ({
    fileName: page.fileName,
    byteSize: encoder.encode(page.html).byteLength,
  }));
  const set = repository.createSet('project-1', manifest);
  pages.forEach((page, index) => {
    repository.storePageReady(
      'project-1',
      set.knowledgeSetId,
      set.pages[index].pageId,
      indexedInput(set.pages[index].pageId, page.fileName, page.html),
    );
  });
  return set;
}

describe('HtmlKnowledgeRepository', () => {
  let database: Database.Database;
  let repository: HtmlKnowledgeRepository;
  let repositoryLogInfo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    database = makeDatabase();
    repositoryLogInfo = vi.fn();
    repository = new HtmlKnowledgeRepository(database, { info: repositoryLogInfo });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
  });

  it('creates one exact manifest transaction with normalized names and stable page IDs', () => {
    const created = repository.createSet('project-1', [
      { fileName: 'Cafe\u0301.HTML', byteSize: 17 },
      { fileName: 'dashboard.htm', byteSize: 23 },
    ]);
    const loaded = repository.getSafeSet('project-1', created.knowledgeSetId);

    expect(created).toEqual(loaded);
    expect(created).toMatchObject({
      status: 'UPLOADING',
      pageCount: 2,
      totalBytes: 40,
    });
    expect(created.pages.map((page) => page.fileName)).toEqual(['Café.HTML', 'dashboard.htm']);
    expect(new Set(created.pages.map((page) => page.pageId))).toHaveProperty('size', 2);
    expect(database.prepare(`
      SELECT page_count, total_bytes FROM test_gen_html_knowledge_sets WHERE id = ?
    `).get(created.knowledgeSetId)).toEqual({ page_count: 2, total_bytes: 40 });
    expect(database.prepare(`
      SELECT file_name, file_name_key, expected_byte_size
      FROM test_gen_html_knowledge_pages
      WHERE knowledge_set_id = ?
      ORDER BY created_at, rowid
    `).all(created.knowledgeSetId)).toEqual([
      { file_name: 'Café.HTML', file_name_key: 'café.html', expected_byte_size: 17 },
      { file_name: 'dashboard.htm', file_name_key: 'dashboard.htm', expected_byte_size: 23 },
    ]);
  });

  it('returns safe DTO timestamps as explicit ISO UTC instants', () => {
    const created = repository.createSet('project-1', [
      { fileName: 'timestamps.html', byteSize: 0 },
    ]);
    const pageId = created.pages[0].pageId;
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets
      SET created_at = '2026-08-21 03:04:05',
          updated_at = '2026-08-21T04:05:06.789+02:30'
      WHERE id = ?
    `).run(created.knowledgeSetId);
    database.prepare(`
      UPDATE test_gen_html_knowledge_pages
      SET created_at = '2026-08-20 01:02:03',
          updated_at = '2026-08-20T07:08:09.123Z'
      WHERE id = ?
    `).run(pageId);

    const loaded = repository.getSafeSet('project-1', created.knowledgeSetId)!;
    expect(loaded.createdAt).toBe('2026-08-21T03:04:05.000Z');
    expect(loaded.updatedAt).toBe('2026-08-21T01:35:06.789Z');
    expect(loaded.pages[0].createdAt).toBe('2026-08-20T01:02:03.000Z');
    expect(loaded.pages[0].updatedAt).toBe('2026-08-20T07:08:09.123Z');
    expect([
      loaded.createdAt,
      loaded.updatedAt,
      loaded.pages[0].createdAt,
      loaded.pages[0].updatedAt,
    ].every((timestamp) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(timestamp)))
      .toBe(true);
    expect(Date.parse(loaded.createdAt)).toBe(Date.UTC(2026, 7, 21, 3, 4, 5));
  });

  it('rejects Unicode-equivalent manifest names without leaving partial rows', () => {
    expect(() => repository.createSet('project-1', [
      { fileName: 'Café.html', byteSize: 10 },
      { fileName: 'CAFE\u0301.HTML', byteSize: 20 },
    ])).toThrow(/duplicate/i);

    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get())
      .toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_pages').get())
      .toEqual({ count: 0 });
  });

  it('enforces exact unbound set-count and byte quotas atomically', () => {
    for (let index = 0; index < MAX_HTML_UNBOUND_SETS_PER_PROJECT; index += 1) {
      repository.createSet('project-1', [{ fileName: `page-${index}.html`, byteSize: 0 }]);
    }

    expect(repository.getProjectQuotaUsage('project-1')).toEqual({
      unboundSetCount: MAX_HTML_UNBOUND_SETS_PER_PROJECT,
      unboundBytes: 0,
      boundBytes: 0,
    });
    expect(() => repository.createSet('project-1', [
      { fileName: 'one-too-many.html', byteSize: 0 },
    ])).toThrow(/set quota/i);

    database.prepare(`DELETE FROM test_gen_html_knowledge_sets`).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, index_version)
      VALUES ('existing-large', 'project-1', 'READY', 1, ?, 1)
    `).run(MAX_HTML_UNBOUND_BYTES_PER_PROJECT - MAX_HTML_PAGE_BYTES + 1);

    expect(() => repository.createSet('project-1', [
      { fileName: 'over-byte-quota.html', byteSize: MAX_HTML_PAGE_BYTES },
    ])).toThrow(/byte quota/i);
    expect(database.prepare(`
      SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets WHERE project_id = 'project-1'
    `).get()).toEqual({ count: 1 });
  });

  it('keeps safe DTO queries source-free and scopes every set/page lookup by project', () => {
    const html = '<h1>Public title</h1><!-- PRIVATE SOURCE VALUE --><input name="secret-field">';
    const set = createReadySet(repository, [{ fileName: 'private.html', html }]);
    const pageId = set.pages[0].pageId;
    const safeSet = repository.getSafeSet('project-1', set.knowledgeSetId)!;
    const safePage = repository.getSafePage('project-1', set.knowledgeSetId, pageId)!;
    const serialized = JSON.stringify({ safeSet, safePage });

    expect(serialized).not.toContain('normalized_html');
    expect(serialized).not.toContain('normalizedHtml');
    expect(serialized).not.toContain('knowledge_index');
    expect(serialized).not.toContain('knowledgeIndex');
    expect(serialized).not.toContain('sha256');
    expect(serialized).not.toContain('requirement_snapshot');
    expect(serialized).not.toContain('PRIVATE SOURCE VALUE');
    expect(repository.getSafeSet('project-2', set.knowledgeSetId)).toBeUndefined();
    expect(repository.getSafePage('project-2', set.knowledgeSetId, pageId)).toBeUndefined();
    expect(repository.getSetRow('project-2', set.knowledgeSetId)).toBeUndefined();
    expect(repository.getPageRow('project-2', set.knowledgeSetId, pageId)).toBeUndefined();
    expect(repository.loadPageSource('project-2', set.knowledgeSetId, pageId)).toBeUndefined();
    expect(repository.loadPageSource('project-1', set.knowledgeSetId, pageId)).toBe(html);
  });

  it('returns only project-scoped metadata needed to preflight a page upload', () => {
    const set = repository.createSet('project-1', [{
      fileName: 'preflight.html',
      byteSize: 10,
    }]);
    const pageId = set.pages[0].pageId;

    expect(repository.getPageUploadPreflight('project-1', set.knowledgeSetId, pageId))
      .toEqual({ setStatus: 'UPLOADING' });
    expect(repository.getPageUploadPreflight('project-2', set.knowledgeSetId, pageId))
      .toBeUndefined();
    expect(repository.getPageUploadPreflight('project-1', set.knowledgeSetId, 'other-page'))
      .toBeUndefined();
  });

  it('atomically stores READY pages, treats the same hash idempotently, and rejects replacement', () => {
    const firstHtml = '<h1>Page A</h1>';
    const differentHtml = '<h1>Page B</h1>';
    const set = repository.createSet('project-1', [{
      fileName: 'page.html',
      byteSize: encoder.encode(firstHtml).byteLength,
    }]);
    const pageId = set.pages[0].pageId;
    const firstInput = indexedInput(pageId, 'page.html', firstHtml);

    const stored = repository.storePageReady('project-1', set.knowledgeSetId, pageId, firstInput);
    const repeated = repository.storePageReady('project-1', set.knowledgeSetId, pageId, {
      ...firstInput,
      normalizedHtml: 'This retry payload must not replace persisted source',
      knowledgeIndex: 'same-hash retries do not need to reparse an index',
    });

    expect(stored).toEqual(repeated);
    expect(stored.status).toBe('READY');
    expect(() => repository.storePageReady(
      'project-1',
      set.knowledgeSetId,
      pageId,
      indexedInput(pageId, 'page.html', differentHtml),
    )).toThrow(ConflictError);
    expect(repository.getPageRow('project-1', set.knowledgeSetId, pageId)?.sha256)
      .toBe(firstInput.sha256);
  });

  it('allows FAILED pages to retry and stores only a bounded failure message', () => {
    const html = '<h1>Retry</h1>';
    const set = repository.createSet('project-1', [{
      fileName: 'retry.html',
      byteSize: encoder.encode(html).byteLength,
    }]);
    const pageId = set.pages[0].pageId;

    const failed = repository.markPageFailed(
      'project-1',
      set.knowledgeSetId,
      pageId,
      `  ${'x'.repeat(MAX_HTML_ERROR_CHARS + 100)}  `,
    );
    expect(failed.status).toBe('FAILED');
    expect(Array.from(failed.errorMessage ?? '')).toHaveLength(MAX_HTML_ERROR_CHARS);

    const ready = repository.storePageReady(
      'project-1',
      set.knowledgeSetId,
      pageId,
      indexedInput(pageId, 'retry.html', html),
    );
    expect(ready).toMatchObject({ status: 'READY', errorMessage: null });
  });

  it('reports duplicate content hashes without overwriting either page', () => {
    const html = '<h1>Same source</h1>';
    const size = encoder.encode(html).byteLength;
    const set = repository.createSet('project-1', [
      { fileName: 'first.html', byteSize: size },
      { fileName: 'second.html', byteSize: size },
    ]);
    const first = indexedInput(set.pages[0].pageId, 'first.html', html);
    const second = indexedInput(set.pages[1].pageId, 'second.html', html);
    repository.storePageReady('project-1', set.knowledgeSetId, set.pages[0].pageId, first);

    expect(() => repository.storePageReady(
      'project-1',
      set.knowledgeSetId,
      set.pages[1].pageId,
      second,
    )).toThrow(/duplicate HTML content/i);
    expect(repository.getSafePage(
      'project-1',
      set.knowledgeSetId,
      set.pages[1].pageId,
    )?.status).toBe('PENDING');
  });

  it('removes pages only from UPLOADING sets and updates manifest totals transactionally', () => {
    const first = '<h1>First</h1>';
    const second = '<h1>Second</h1>';
    const set = createReadySet(repository, [
      { fileName: 'first.html', html: first },
      { fileName: 'second.html', html: second },
    ]);

    const updated = repository.removePage(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
    );
    expect(updated).toMatchObject({
      pageCount: 1,
      totalBytes: encoder.encode(second).byteLength,
    });
    expect(updated.pages.map((page) => page.pageId)).toEqual([set.pages[1].pageId]);

    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    expect(() => repository.removePage(
      'project-1',
      set.knowledgeSetId,
      set.pages[1].pageId,
    )).toThrow(/not uploading/i);
  });

  it('finalizes by CAS, persists a deterministic graph, and merges bounded warnings', () => {
    const set = createReadySet(repository, [
      { fileName: 'source.html', html: '<a href="target.html">Target</a>' },
      { fileName: 'target.html', html: '<h1>Target</h1>' },
    ]);
    const [sourcePage, targetPage] = set.pages;
    const relations: HtmlPageRelation[] = [{
      fromPageId: sourcePage.pageId,
      toPageId: targetPage.pageId,
      type: 'link',
      label: 'Z target',
      sourceDomPath: '/html/body/a:nth-of-type(2)',
      sourceTarget: '/target.html',
      matchRule: 'file-path',
      confidence: 'high',
    } as HtmlPageRelation, {
      fromPageId: sourcePage.pageId,
      toPageId: targetPage.pageId,
      type: 'link',
      sourceDomPath: '/html/body/a:nth-of-type(1)',
      sourceTarget: '/target.html',
      matchRule: 'file-path',
      confidence: 'high',
      leakedSource: 'DO NOT PERSIST RELATION SOURCE',
    } as HtmlPageRelation, {
      fromPageId: sourcePage.pageId,
      toPageId: targetPage.pageId,
      type: 'link',
      label: 'A target',
      sourceDomPath: '/html/body/a:nth-of-type(2)',
      sourceTarget: '/target.html',
      matchRule: 'file-path',
      confidence: 'high',
    }];
    const longWarning = `warning-${'w'.repeat(MAX_HTML_WARNING_CHARS + 10)}`;
    const relationWarnings = [
      'relation warning',
      'relation warning',
      longWarning,
      ...Array.from({ length: MAX_HTML_WARNINGS + 5 }, (_, index) => `extra warning ${index}`),
    ];

    const finalized = repository.finalizeSet(
      'project-1',
      set.knowledgeSetId,
      () => ({
        relations,
        warningsByPageId: { [sourcePage.pageId]: relationWarnings },
      }),
    );
    const repeated = repository.finalizeSet(
      'project-1',
      set.knowledgeSetId,
      () => ({
        relations: [...relations].reverse(),
        warningsByPageId: { [sourcePage.pageId]: ['should not mutate a finalized set'] },
      }),
    );
    const graph = repository.loadPageGraph('project-1', set.knowledgeSetId);
    const warnings = repository.getSafePage(
      'project-1',
      set.knowledgeSetId,
      sourcePage.pageId,
    )!.warnings;

    expect(finalized.status).toBe('READY');
    expect(repeated).toEqual(finalized);
    expect(graph.map((relation) => relation.sourceDomPath)).toEqual([
      '/html/body/a:nth-of-type(1)',
      '/html/body/a:nth-of-type(2)',
    ]);
    expect(graph[1].label).toBe('A target');
    expect(JSON.stringify(graph)).not.toContain('DO NOT PERSIST RELATION SOURCE');
    expect(warnings.filter((warning) => warning === 'relation warning')).toHaveLength(1);
    expect(warnings.length).toBeLessThanOrEqual(MAX_HTML_WARNINGS);
    expect(warnings.every((warning) => Array.from(warning).length <= MAX_HTML_WARNING_CHARS))
      .toBe(true);
  });

  it('builds final relations from the exact manifest inside the finalization transaction', () => {
    const set = createReadySet(repository, [
      { fileName: 'source.html', html: '<a href="/shared">Shared</a>' },
      {
        fileName: 'target-a.html',
        html: '<link rel="canonical" href="/shared"><h1>Target A</h1>',
      },
      {
        fileName: 'target-b.html',
        html: '<link rel="canonical" href="/shared"><h1>Target B</h1>',
      },
    ]);
    const [sourcePage, targetA, targetB] = set.pages;
    const staleGraph = buildHtmlPageRelations(
      repository.loadPageIndexes('project-1', set.knowledgeSetId),
    );
    expect(staleGraph.relations).toEqual([]);
    expect(staleGraph.warningsByPageId[sourcePage.pageId]).toEqual([
      expect.stringMatching(/ambiguous/i),
    ]);

    repository.removePage('project-1', set.knowledgeSetId, targetB.pageId);
    let builtInsideTransaction = false;
    const finalized = repository.finalizeSet(
      'project-1',
      set.knowledgeSetId,
      (pages) => {
        builtInsideTransaction = database.inTransaction;
        expect(pages.map((page) => page.pageId)).toEqual([
          sourcePage.pageId,
          targetA.pageId,
        ]);
        return buildHtmlPageRelations(pages);
      },
    );

    expect(builtInsideTransaction).toBe(true);
    expect(repository.loadPageGraph('project-1', set.knowledgeSetId)).toEqual([
      expect.objectContaining({
        fromPageId: sourcePage.pageId,
        toPageId: targetA.pageId,
        matchRule: 'canonical-path',
      }),
    ]);
    expect(finalized.pages.find((page) => page.pageId === sourcePage.pageId)?.warnings)
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/ambiguous/i)]));
  });

  it('rejects finalization when actual bytes do not match the manifest or no pages remain', () => {
    const html = '<h1>Mismatch</h1>';
    const mismatch = createReadySet(repository, [{ fileName: 'mismatch.html', html }]);
    database.prepare(`
      UPDATE test_gen_html_knowledge_pages SET byte_size = byte_size + 1 WHERE id = ?
    `).run(mismatch.pages[0].pageId);

    expect(() => repository.finalizeSet('project-1', mismatch.knowledgeSetId, buildEmptyPageGraph))
      .toThrow(/manifest byte size/i);

    const empty = repository.createSet('project-1', [{ fileName: 'remove.html', byteSize: 0 }]);
    repository.removePage('project-1', empty.knowledgeSetId, empty.pages[0].pageId);
    expect(() => repository.finalizeSet('project-1', empty.knowledgeSetId, buildEmptyPageGraph))
      .toThrow(/between 1 and 20/i);
  });

  it('defensively enforces the 5 MiB source and 10 MiB serialized-index finalization caps', () => {
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, index_version)
      VALUES ('source-over-limit', 'project-1', 'UPLOADING', 2, ?, 1)
    `).run(6 * 1024 * 1024);
    for (let index = 0; index < 2; index += 1) {
      const pageId = `source-page-${index}`;
      const fileName = `source-${index}.html`;
      const hash = `source-hash-${index}`;
      database.prepare(`
        INSERT INTO test_gen_html_knowledge_pages
          (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
           status, page_title, sha256, byte_size, normalized_html, knowledge_index,
           information_level, warnings)
        VALUES (?, 'source-over-limit', ?, ?, ?, 'READY', ?, ?, ?, '', ?, 'NORMAL', '[]')
      `).run(
        pageId,
        fileName,
        fileName,
        3 * 1024 * 1024,
        fileName,
        hash,
        3 * 1024 * 1024,
        minimalIndex({ pageId, fileName, hash }),
      );
    }
    expect(() => repository.finalizeSet('project-1', 'source-over-limit', buildEmptyPageGraph))
      .toThrow(/5 MiB/i);

    const pageCount = 11;
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, index_version)
      VALUES ('indexes-over-limit', 'project-1', 'UPLOADING', ?, 0, 1)
    `).run(pageCount);
    const paddingChars = Math.ceil(MAX_HTML_SET_INDEX_BYTES / pageCount);
    for (let index = 0; index < pageCount; index += 1) {
      const pageId = `index-page-${index}`;
      const fileName = `index-${index}.html`;
      const hash = `index-hash-${index}`;
      database.prepare(`
        INSERT INTO test_gen_html_knowledge_pages
          (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
           status, page_title, sha256, byte_size, normalized_html, knowledge_index,
           information_level, warnings)
        VALUES (?, 'indexes-over-limit', ?, ?, 0, 'READY', ?, ?, 0, '', ?, 'NORMAL', '[]')
      `).run(
        pageId,
        fileName,
        fileName,
        fileName,
        hash,
        minimalIndex({ pageId, fileName, hash, paddingChars }),
      );
    }
    expect(() => repository.finalizeSet('project-1', 'indexes-over-limit', buildEmptyPageGraph))
      .toThrow(/10 MiB/i);
  });

  it('makes finalized page state immutable while allowing deletion until binding', () => {
    const html = '<h1>Immutable</h1>';
    const set = createReadySet(repository, [{ fileName: 'immutable.html', html }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);

    expect(() => repository.markPageFailed(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
      'late failure',
    )).toThrow(/not uploading/i);
    expect(() => repository.storePageReady(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
      indexedInput(set.pages[0].pageId, 'immutable.html', html),
    )).toThrow(/not uploading/i);

    repository.deleteUnboundSet('project-1', set.knowledgeSetId);
    expect(repository.getSafeSet('project-1', set.knowledgeSetId)).toBeUndefined();
  });

  it('binds READY sets by CAS, enforces the bound quota, and loads run-scoped internal data', () => {
    const html = '<h1>Bound page</h1>';
    const set = createReadySet(repository, [{ fileName: 'bound.html', html }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-1', 'project-1')`).run();
    const requirementSnapshot = snapshot();
    const snapshotJson = serializeHtmlRequirementSnapshot(requirementSnapshot);
    const snapshotHash = hashHtmlRequirementSnapshot(requirementSnapshot);

    expect(repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-1',
      snapshotJson,
      snapshotHash,
    )).toBe(true);
    expect(repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-1',
      snapshotJson,
      snapshotHash,
    )).toBe(false);
    expect(repositoryLogInfo).toHaveBeenCalledTimes(1);
    expect(repositoryLogInfo).toHaveBeenCalledWith(
      `set-bound setId=${set.knowledgeSetId} runId=run-1 projectId=project-1 pageCount=1`,
    );
    expect(JSON.stringify(repositoryLogInfo.mock.calls)).not.toContain('The user signs in');

    const loaded = repository.loadBoundSetByRun('project-1', 'run-1', set.knowledgeSetId);
    expect(loaded).toMatchObject({
      set: { id: set.knowledgeSetId, status: 'BOUND', run_id: 'run-1' },
      requirementSnapshot: { version: 1, projectId: 'project-1' },
    });
    expect(loaded?.pages).toHaveLength(1);
    expect(repository.loadBoundSetByRun('project-2', 'run-1', set.knowledgeSetId)).toBeUndefined();
    expect(repository.loadBoundSetByRun('project-1', 'run-1', 'wrong-set')).toBeUndefined();
    expect(() => repository.deleteUnboundSet('project-1', set.knowledgeSetId))
      .toThrow(/bound/i);

    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-quota', 'project-1')`).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, index_version,
         requirement_snapshot, requirement_snapshot_hash)
      VALUES ('existing-bound', 'project-1', 'run-quota', 'BOUND', 1, ?, 1, '{}', 'hash')
    `).run(MAX_HTML_BOUND_BYTES_PER_PROJECT - MAX_HTML_PAGE_BYTES);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-over', 'project-1')`).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, index_version)
      VALUES ('ready-over-quota', 'project-1', 'READY', 1, ?, 1)
    `).run(MAX_HTML_PAGE_BYTES + 1);

    expect(() => repository.bindReadySetToRun(
      'project-1',
      'ready-over-quota',
      'run-over',
      snapshotJson,
      snapshotHash,
    )).toThrow(/bound byte quota/i);
  });

  it('rejects binding a snapshot containing records from another project', () => {
    const set = createReadySet(repository, [{
      fileName: 'cross-project.html',
      html: '<h1>Cross project</h1>',
    }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-cross', 'project-1')`).run();
    const invalidSnapshot: HtmlRequirementSnapshot = {
      ...snapshot(),
      records: [{
        ...snapshot().records[0],
        projectId: 'project-2',
      }],
    };

    expect(() => repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-cross',
      serializeHtmlRequirementSnapshot(invalidSnapshot),
      hashHtmlRequirementSnapshot(invalidSnapshot),
    )).toThrow(/snapshot record.*project/i);
    expect(repository.getSafeSet('project-1', set.knowledgeSetId)?.status).toBe('READY');
  });

  it('rejects bound runtime loads when persisted page totals are corrupt', () => {
    const html = '<h1>Runtime integrity</h1>';
    const set = createReadySet(repository, [{ fileName: 'runtime.html', html }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-runtime', 'project-1')`).run();
    const requirementSnapshot = snapshot();
    repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-runtime',
      serializeHtmlRequirementSnapshot(requirementSnapshot),
      hashHtmlRequirementSnapshot(requirementSnapshot),
    );
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets
      SET total_bytes = total_bytes + 1
      WHERE id = ?
    `).run(set.knowledgeSetId);

    expect(() => repository.loadBoundSetByRun(
      'project-1',
      'run-runtime',
      set.knowledgeSetId,
    )).toThrow(/byte total/i);
  });

  it('verifies bound reference metadata without reading or parsing the full page index', () => {
    const html = '<h1>Lightweight verification</h1>';
    const set = createReadySet(repository, [{ fileName: 'verify.html', html }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-verify', 'project-1')`).run();
    const requirementSnapshot = snapshot();
    const requirementSnapshotHash = hashHtmlRequirementSnapshot(requirementSnapshot);
    repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-verify',
      serializeHtmlRequirementSnapshot(requirementSnapshot),
      requirementSnapshotHash,
    );
    const stored = repository.getSafeSet('project-1', set.knowledgeSetId)!;
    const reference: HtmlKnowledgeReference = {
      knowledgeSetId: set.knowledgeSetId,
      pageCount: stored.pageCount,
      totalBytes: stored.totalBytes,
      pageTitles: stored.pages.map((page) => page.pageTitle!),
      hasLowInformationPages: stored.pages.some((page) => page.informationLevel === 'LOW_INFORMATION'),
      requirementSnapshotHash,
    };

    database.prepare(`
      UPDATE test_gen_html_knowledge_pages
      SET knowledge_index = 'corrupt-large-payload'
      WHERE knowledge_set_id = ?
    `).run(set.knowledgeSetId);

    expect(() => repository.verifyBoundReference('run-verify', 'project-1', reference))
      .not.toThrow();
    expect(() => repository.loadBoundSetByRun('project-1', 'run-verify', set.knowledgeSetId))
      .toThrow(/index.*JSON/i);
    expect(() => repository.verifyBoundReference('run-verify', 'project-2', reference))
      .toThrow(HtmlKnowledgeDataError);
    expect(() => repository.verifyBoundReference('run-verify', 'project-1', {
      ...reference,
      requirementSnapshotHash: '0'.repeat(64),
    })).toThrow(HtmlKnowledgeDataError);
  });

  it('rejects cross-project run binding and bound lookup', () => {
    const set = createReadySet(repository, [{
      fileName: 'run-owner.html',
      html: '<h1>Run owner</h1>',
    }]);
    repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id) VALUES ('run-project-2', 'project-2')
    `).run();
    const requirementSnapshot = snapshot('project-1');
    const snapshotJson = serializeHtmlRequirementSnapshot(requirementSnapshot);
    const snapshotHash = hashHtmlRequirementSnapshot(requirementSnapshot);

    expect(repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-project-2',
      snapshotJson,
      snapshotHash,
    )).toBe(false);
    expect(repository.getSetRow('project-1', set.knowledgeSetId)).toMatchObject({
      status: 'READY',
      run_id: null,
    });

    database.prepare(`
      UPDATE test_gen_html_knowledge_sets
      SET status = 'BOUND', run_id = ?, requirement_snapshot = ?, requirement_snapshot_hash = ?
      WHERE id = ?
    `).run('run-project-2', snapshotJson, snapshotHash, set.knowledgeSetId);
    expect(repository.loadBoundSetByRun(
      'project-1',
      'run-project-2',
      set.knowledgeSetId,
    )).toBeUndefined();
  });

  it('cleans only unbound UPLOADING/READY sets older than 24 hours', () => {
    const oldUploading = repository.createSet('project-1', [
      { fileName: 'old-uploading.html', byteSize: 0 },
    ]);
    const oldReady = createReadySet(repository, [
      { fileName: 'old-ready.html', html: '<h1>Old ready</h1>' },
    ]);
    repository.finalizeSet('project-1', oldReady.knowledgeSetId, buildEmptyPageGraph);
    const oldBound = createReadySet(repository, [
      { fileName: 'old-bound.html', html: '<h1>Old bound</h1>' },
    ]);
    repository.finalizeSet('project-1', oldBound.knowledgeSetId, buildEmptyPageGraph);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-bound', 'project-1')`).run();
    const requirementSnapshot = snapshot();
    repository.bindReadySetToRun(
      'project-1',
      oldBound.knowledgeSetId,
      'run-bound',
      serializeHtmlRequirementSnapshot(requirementSnapshot),
      hashHtmlRequirementSnapshot(requirementSnapshot),
    );
    const recent = repository.createSet('project-1', [
      { fileName: 'recent.html', byteSize: 0 },
    ]);
    const recentlyActive = repository.createSet('project-1', [
      { fileName: 'recently-active.html', byteSize: 0 },
    ]);
    const now = new Date('2026-08-21T12:00:00.000Z');
    const oldTimestamp = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS - 1_000)
      .toISOString();
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET created_at = ?, updated_at = ?
      WHERE id IN (?, ?, ?)
    `).run(
      oldTimestamp,
      oldTimestamp,
      oldUploading.knowledgeSetId,
      oldReady.knowledgeSetId,
      oldBound.knowledgeSetId,
    );
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET created_at = ?, updated_at = ? WHERE id = ?
    `).run(now.toISOString(), now.toISOString(), recent.knowledgeSetId);
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET created_at = ?, updated_at = ? WHERE id = ?
    `).run(oldTimestamp, now.toISOString(), recentlyActive.knowledgeSetId);

    expect(repository.cleanupAbandonedSets(now)).toBe(2);
    expect(repository.getSafeSet('project-1', oldUploading.knowledgeSetId)).toBeUndefined();
    expect(repository.getSafeSet('project-1', oldReady.knowledgeSetId)).toBeUndefined();
    expect(repository.getSafeSet('project-1', oldBound.knowledgeSetId)?.status).toBe('BOUND');
    expect(repository.getSafeSet('project-1', recent.knowledgeSetId)?.status).toBe('UPLOADING');
    expect(repository.getSafeSet('project-1', recentlyActive.knowledgeSetId)?.status)
      .toBe('UPLOADING');
  });

  it('rejects malformed or unsupported persisted JSON without echoing stored source', () => {
    const html = '<h1>DO NOT ECHO THIS SOURCE</h1>';
    const set = createReadySet(repository, [{ fileName: 'corrupt.html', html }]);
    const pageId = set.pages[0].pageId;
    database.prepare(`
      UPDATE test_gen_html_knowledge_pages
      SET knowledge_index = ?, normalized_html = ?
      WHERE id = ?
    `).run(
      minimalIndex({
        pageId,
        fileName: 'corrupt.html',
        hash: repository.getPageRow('project-1', set.knowledgeSetId, pageId)!.sha256!,
        version: 'DO NOT ECHO THIS SOURCE',
      }),
      'DO NOT ECHO THIS SOURCE',
      pageId,
    );

    let message = '';
    try {
      repository.loadPageIndexes('project-1', set.knowledgeSetId);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/unsupported.*index version/i);
    expect(message).not.toContain('DO NOT ECHO THIS SOURCE');

    let snapshotMessage = '';
    try {
      repository.bindReadySetToRun(
        'project-1',
        set.knowledgeSetId,
        'run-missing',
        JSON.stringify({ version: 'DO NOT ECHO SNAPSHOT SOURCE' }),
        'invalid-hash',
      );
    } catch (error) {
      snapshotMessage = error instanceof Error ? error.message : String(error);
    }
    expect(snapshotMessage).toMatch(/unsupported.*snapshot version/i);
    expect(snapshotMessage).not.toContain('DO NOT ECHO SNAPSHOT SOURCE');
  });

  it('throws source-safe data errors for every corrupt BOUND snapshot invariant', () => {
    const corruptions: Array<{
      name: string;
      mutate: (setId: string) => void;
    }> = [
      {
        name: 'missing snapshot',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET requirement_snapshot = NULL WHERE id = ?
        `).run(setId),
      },
      {
        name: 'missing hash',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET requirement_snapshot_hash = NULL WHERE id = ?
        `).run(setId),
      },
      {
        name: 'malformed JSON',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET requirement_snapshot = ? WHERE id = ?
        `).run('{"SECRET_CORRUPT_SNAPSHOT"', setId),
      },
      {
        name: 'noncanonical JSON',
        mutate: (setId) => {
          const canonical = serializeHtmlRequirementSnapshot(snapshot());
          database.prepare(`
            UPDATE test_gen_html_knowledge_sets SET requirement_snapshot = ? WHERE id = ?
          `).run(JSON.stringify(JSON.parse(canonical), null, 2), setId);
        },
      },
      {
        name: 'stale hash',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET requirement_snapshot_hash = ? WHERE id = ?
        `).run('SECRET_STALE_HASH', setId),
      },
      {
        name: 'wrong snapshot version',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET requirement_snapshot = ? WHERE id = ?
        `).run(JSON.stringify({ ...snapshot(), version: 2, secret: 'SECRET_VERSION' }), setId),
      },
      {
        name: 'wrong snapshot project',
        mutate: (setId) => {
          const wrongProject = snapshot('project-2');
          database.prepare(`
            UPDATE test_gen_html_knowledge_sets
            SET requirement_snapshot = ?, requirement_snapshot_hash = ?
            WHERE id = ?
          `).run(
            serializeHtmlRequirementSnapshot(wrongProject),
            hashHtmlRequirementSnapshot(wrongProject),
            setId,
          );
        },
      },
      {
        name: 'wrong set index version',
        mutate: (setId) => database.prepare(`
          UPDATE test_gen_html_knowledge_sets SET index_version = 2 WHERE id = ?
        `).run(setId),
      },
    ];

    database.pragma('ignore_check_constraints = ON');
    for (const [index, corruption] of corruptions.entries()) {
      const runId = `corrupt-bound-run-${index}`;
      const set = createReadySet(repository, [{
        fileName: `corrupt-bound-${index}.html`,
        html: `<h1>SECRET_BOUND_SOURCE_${index}</h1>`,
      }]);
      repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
      database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES (?, 'project-1')`)
        .run(runId);
      const validSnapshot = snapshot();
      repository.bindReadySetToRun(
        'project-1',
        set.knowledgeSetId,
        runId,
        serializeHtmlRequirementSnapshot(validSnapshot),
        hashHtmlRequirementSnapshot(validSnapshot),
      );
      corruption.mutate(set.knowledgeSetId);

      for (const load of [
        () => repository.loadBoundSetByRun('project-1', runId, set.knowledgeSetId),
        () => repository.loadRequirementSnapshot('project-1', set.knowledgeSetId),
        () => repository.loadPageIndexes('project-1', set.knowledgeSetId),
        () => repository.loadPageGraph('project-1', set.knowledgeSetId),
        () => repository.loadPageSource(
          'project-1',
          set.knowledgeSetId,
          set.pages[0].pageId,
        ),
      ]) {
        let caught: unknown;
        try {
          load();
        } catch (error) {
          caught = error;
        }
        expect(caught, corruption.name).toBeInstanceOf(HtmlKnowledgeDataError);
        expect((caught as Error).message, corruption.name).not.toContain('SECRET');
      }
    }
    database.pragma('ignore_check_constraints = OFF');
  });

  it('rejects recursively corrupt persisted index data before retrieval', () => {
    const html = `
      <form action="/submit">
        <label for="email">Email</label>
        <input id="email" aria-label="Email" minlength="2">
        <select><option value="one">One</option></select>
      </form>
    `;
    const set = createReadySet(repository, [{ fileName: 'nested.html', html }]);
    const pageId = set.pages[0].pageId;
    const original = repository.getPageRow(
      'project-1',
      set.knowledgeSetId,
      pageId,
    )!.knowledge_index!;

    const corruptions: Array<(index: any) => void> = [
      (index) => { index.chunks[0].elements = [null]; },
      (index) => { index.chunks[0].elements[0].options = [null]; },
      (index) => { index.chunks[0].elements[0].ariaAttributes = { 'aria-label': null }; },
      (index) => { index.chunks[0].sourceLocation = { startLine: 0, endLine: 1 }; },
      (index) => { index.chunks[0].heading = 42; },
      (index) => { index.routeAliases[0].queryParameterNames = [null]; },
      (index) => { index.relationCandidates[0].target.fullPathSha256 = null; },
      (index) => { index.stats = { nodeCount: 'many' }; },
    ];

    for (const corrupt of corruptions) {
      const index = JSON.parse(original);
      if (index.routeAliases.length === 0) {
        index.routeAliases.push({
          normalizedTarget: '/nested.html',
          origin: null,
          path: '/nested.html',
          queryParameterNames: [],
          fullPathSha256: 'a'.repeat(64),
        });
      }
      if (index.relationCandidates.length === 0) {
        index.relationCandidates.push({
          type: 'form-action',
          sourceDomPath: '/html/body/form',
          sourceTarget: '/submit',
          target: {
            normalizedTarget: '/submit',
            origin: null,
            path: '/submit',
            queryParameterNames: [],
            fullPathSha256: 'b'.repeat(64),
          },
        });
      }
      corrupt(index);
      database.prepare(`
        UPDATE test_gen_html_knowledge_pages SET knowledge_index = ? WHERE id = ?
      `).run(JSON.stringify(index), pageId);

      expect(() => repository.loadPageIndexes('project-1', set.knowledgeSetId))
        .toThrow(HtmlKnowledgeDataError);
    }
  });

  it('rejects an unsupported set index version before internal retrieval', () => {
    const set = createReadySet(repository, [{
      fileName: 'versioned.html',
      html: '<h1>Versioned</h1>',
    }]);
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET index_version = 2 WHERE id = ?
    `).run(set.knowledgeSetId);

    expect(() => repository.loadPageIndexes('project-1', set.knowledgeSetId))
      .toThrow(/unsupported.*set index version/i);
    expect(() => repository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph))
      .toThrow(/unsupported.*set index version/i);

    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET status = 'READY' WHERE id = ?
    `).run(set.knowledgeSetId);
    database.prepare(`INSERT INTO test_gen_runs (id, project_id) VALUES ('run-version', 'project-1')`).run();
    const requirementSnapshot = snapshot();
    expect(() => repository.bindReadySetToRun(
      'project-1',
      set.knowledgeSetId,
      'run-version',
      serializeHtmlRequirementSnapshot(requirementSnapshot),
      hashHtmlRequirementSnapshot(requirementSnapshot),
    )).toThrow(/unsupported.*set index version/i);
  });

  it('serializes concurrent manifest creation at the project set quota', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'html-knowledge-create-race-'));
    const filePath = join(tempDirectory, 'knowledge.sqlite');
    let seedDatabase: Database.Database | undefined;
    try {
      seedDatabase = createFileDatabase(filePath);
      const seedRepository = new HtmlKnowledgeRepository(seedDatabase, { info: () => undefined });
      for (let index = 0; index < MAX_HTML_UNBOUND_SETS_PER_PROJECT - 1; index += 1) {
        seedRepository.createSet('project-1', [{
          fileName: `seed-${index}.html`,
          byteSize: 0,
        }]);
      }
      seedDatabase.close();
      seedDatabase = undefined;

      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const outcomes = await Promise.all([
        runConcurrencyWorker({
          operation: 'create',
          filePath,
          fileName: 'candidate-a.html',
          gate,
        }),
        runConcurrencyWorker({
          operation: 'create',
          filePath,
          fileName: 'candidate-b.html',
          gate,
        }),
      ]);

      expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
      expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ name: 'HtmlKnowledgeQuotaError' }),
        }),
      ]);

      const verificationDatabase = new Database(filePath);
      expect(verificationDatabase.prepare(`
        SELECT COUNT(*) AS set_count, COALESCE(SUM(page_count), 0) AS page_count,
               COALESCE(SUM(total_bytes), 0) AS total_bytes
        FROM test_gen_html_knowledge_sets
        WHERE project_id = 'project-1'
      `).get()).toEqual({
        set_count: MAX_HTML_UNBOUND_SETS_PER_PROJECT,
        page_count: MAX_HTML_UNBOUND_SETS_PER_PROJECT,
        total_bytes: 0,
      });
      verificationDatabase.close();
    } finally {
      if (seedDatabase?.open) seedDatabase.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('allows one winner when independent connections bind the same READY set', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'html-knowledge-bind-race-'));
    const filePath = join(tempDirectory, 'knowledge.sqlite');
    let seedDatabase: Database.Database | undefined;
    try {
      seedDatabase = createFileDatabase(filePath);
      const seedRepository = new HtmlKnowledgeRepository(seedDatabase, { info: () => undefined });
      const set = createReadySet(seedRepository, [{
        fileName: 'bind-race.html',
        html: '<h1>Bind race</h1>',
      }]);
      seedRepository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
      seedDatabase.prepare(`
        INSERT INTO test_gen_runs (id, project_id)
        VALUES ('run-a', 'project-1'), ('run-b', 'project-1')
      `).run();
      const requirementSnapshot = snapshot();
      const snapshotJson = serializeHtmlRequirementSnapshot(requirementSnapshot);
      const snapshotHash = hashHtmlRequirementSnapshot(requirementSnapshot);
      seedDatabase.close();
      seedDatabase = undefined;

      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const outcomes = await Promise.all([
        runConcurrencyWorker({
          operation: 'bind',
          filePath,
          setId: set.knowledgeSetId,
          runId: 'run-a',
          snapshotJson,
          snapshotHash,
          gate,
        }),
        runConcurrencyWorker({
          operation: 'bind',
          filePath,
          setId: set.knowledgeSetId,
          runId: 'run-b',
          snapshotJson,
          snapshotHash,
          gate,
        }),
      ]);

      expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
      expect(outcomes.map((outcome) => outcome.value).sort()).toEqual([false, true]);
      const verificationDatabase = new Database(filePath);
      const bound = verificationDatabase.prepare(`
        SELECT status, run_id, page_count, total_bytes
        FROM test_gen_html_knowledge_sets
        WHERE id = ?
      `).get(set.knowledgeSetId) as {
        status: string;
        run_id: string;
        page_count: number;
        total_bytes: number;
      };
      expect(bound).toMatchObject({
        status: 'BOUND',
        page_count: 1,
        total_bytes: encoder.encode('<h1>Bind race</h1>').byteLength,
      });
      expect(['run-a', 'run-b']).toContain(bound.run_id);
      verificationDatabase.close();
    } finally {
      if (seedDatabase?.open) seedDatabase.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('returns one concurrent start winner and rolls back the losing candidate run', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'html-knowledge-start-race-'));
    const filePath = join(tempDirectory, 'knowledge.sqlite');
    let seedDatabase: Database.Database | undefined;
    try {
      seedDatabase = createFileDatabase(filePath);
      const seedRepository = new HtmlKnowledgeRepository(seedDatabase, { info: () => undefined });
      const set = createReadySet(seedRepository, [{
        fileName: 'start-race.html',
        html: '<h1>Start race</h1>',
      }]);
      seedRepository.finalizeSet('project-1', set.knowledgeSetId, buildEmptyPageGraph);
      const snapshotJson = serializeHtmlRequirementSnapshot(snapshot());
      seedDatabase.close();
      seedDatabase = undefined;

      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const outcomes = await Promise.all([
        runConcurrencyWorker({
          operation: 'start',
          filePath,
          setId: set.knowledgeSetId,
          runId: 'run-a',
          snapshotJson,
          gate,
        }),
        runConcurrencyWorker({
          operation: 'start',
          filePath,
          setId: set.knowledgeSetId,
          runId: 'run-b',
          snapshotJson,
          gate,
        }),
      ]);

      expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
      const results = outcomes.map((outcome) => outcome.value) as Array<{
        runId: string;
        created: boolean;
      }>;
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(new Set(results.map((result) => result.runId))).toHaveProperty('size', 1);

      const verificationDatabase = new Database(filePath);
      expect(verificationDatabase.prepare(`
        SELECT id FROM test_gen_runs ORDER BY id
      `).all()).toEqual([{ id: results[0].runId }]);
      expect(verificationDatabase.prepare(`
        SELECT status, run_id FROM test_gen_html_knowledge_sets WHERE id = ?
      `).get(set.knowledgeSetId)).toEqual({
        status: 'BOUND',
        run_id: results[0].runId,
      });
      verificationDatabase.close();
    } finally {
      if (seedDatabase?.open) seedDatabase.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
