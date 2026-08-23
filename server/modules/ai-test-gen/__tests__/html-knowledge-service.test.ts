// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';
import {
  ConflictError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError as ApiValidationError,
} from '../../../shared/http/errors.ts';
import {
  HtmlKnowledgeLimitError,
  HtmlKnowledgeValidationError,
} from '../html-knowledge/normalization.ts';
import {
  HtmlKnowledgeDataError,
  HtmlKnowledgeRepository,
} from '../html-knowledge/repository.ts';
import { HtmlKnowledgeService } from '../html-knowledge/service.ts';
import { TestGenRepository } from '../repository.ts';
import {
  HTML_KNOWLEDGE_UNBOUND_TTL_MS,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_PAGES,
  MAX_HTML_ERROR_CHARS,
  MAX_HTML_SET_BYTES,
} from '../html-knowledge/types.ts';

const encoder = new TextEncoder();

function makeDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE test_gen_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      phase TEXT NOT NULL DEFAULT 'analysis',
      current_batch INTEGER NOT NULL DEFAULT 0,
      total_batches INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'auto',
      created_by TEXT,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
  applyHtmlKnowledgeSchema(database);
  return database;
}

describe('HtmlKnowledgeService', () => {
  let database: Database.Database;
  let repository: HtmlKnowledgeRepository;
  let requirements: Requirement[];
  let service: HtmlKnowledgeService;
  let serviceLogInfo: ReturnType<typeof vi.fn>;
  let repositoryLogInfo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    database = makeDatabase();
    repositoryLogInfo = vi.fn();
    repository = new HtmlKnowledgeRepository(database, { info: repositoryLogInfo });
    serviceLogInfo = vi.fn();
    requirements = [
      {
        id: 'epic-auth',
        projectId: 'project-1',
        title: 'Authentication',
        description: 'Account access',
        level: 'epic',
        status: 'APPROVED',
        position: 0,
        isFlow: false,
        relatedRequirementIds: [],
      },
      {
        id: 'story-login',
        projectId: 'project-1',
        parentId: 'epic-auth',
        title: 'Log in',
        description: 'Sign in with valid credentials',
        level: 'story',
        status: 'APPROVED',
        position: 1,
        isFlow: false,
        relatedRequirementIds: [],
      },
      {
        id: 'ac-login-valid',
        projectId: 'project-1',
        parentId: 'story-login',
        title: 'Valid credentials',
        description: 'The dashboard opens',
        level: 'ac',
        status: 'APPROVED',
        position: 2,
        isFlow: false,
        relatedRequirementIds: [],
      },
    ];
    service = new HtmlKnowledgeService(
      repository,
      undefined,
      new TestGenRepository(database),
      {
        listByProject: (projectId: string) => requirements
          .filter((requirement) => requirement.projectId === projectId),
      },
      { info: serviceLogInfo },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
  });

  it('validates the complete manifest before inserting any rows', () => {
    const invalidManifests = [
      { pages: [] },
      {
        pages: Array.from({ length: MAX_HTML_PAGES + 1 }, (_, index) => ({
          fileName: `page-${index}.html`,
          byteSize: 0,
        })),
      },
      { pages: [{ fileName: 'not-html.txt', byteSize: 1 }] },
      { pages: [{ fileName: 'too-large.html', byteSize: MAX_HTML_PAGE_BYTES + 1 }] },
      { pages: [{ fileName: 'fractional.html', byteSize: 1.5 }] },
      { pages: [{ fileName: 'negative.html', byteSize: -1 }] },
      {
        pages: [
          { fileName: 'large-a.html', byteSize: MAX_HTML_PAGE_BYTES },
          { fileName: 'large-b.html', byteSize: MAX_HTML_SET_BYTES },
        ],
      },
    ];

    for (const manifest of invalidManifests) {
      expect(() => service.createSet('project-1', manifest)).toThrow();
    }
    expect(() => service.createSet('project-1', {
      pages: [
        { fileName: 'Café.html', byteSize: 10 },
        { fileName: 'CAFE\u0301.HTML', byteSize: 10 },
      ],
    })).toThrow(/duplicate/i);
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get())
      .toEqual({ count: 0 });
  });

  it('normalizes manifest names without mutating caller-owned input', () => {
    const manifest = {
      pages: [{ fileName: 'Cafe\u0301.HTML', byteSize: 0 }],
    } as const;
    const before = structuredClone(manifest);

    const created = service.createSet('project-1', manifest);

    expect(manifest).toEqual(before);
    expect(created.pages[0].fileName).toBe('Café.HTML');
    expect(service.getSet('project-1', created.knowledgeSetId)).toEqual(created);
  });

  it('logs one metadata-only event for create, index, and finalization', () => {
    const html = `
      <h1>Observed page</h1>
      <a href="/RELATION_TARGET_MARKER">RELATION_LABEL_MARKER</a>
      <!-- UNIQUE_SOURCE_MARKER -->
    `;
    const bytes = encoder.encode(html);
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'observability.html', byteSize: bytes.byteLength }],
    });

    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);
    service.finalizeSet('project-1', set.knowledgeSetId);
    service.finalizeSet('project-1', set.knowledgeSetId);

    const messages = serviceLogInfo.mock.calls.map(([message]) => String(message));
    expect(messages).toHaveLength(3);
    expect(messages[0]).toBe(
      `set-created setId=${set.knowledgeSetId} projectId=project-1 pageCount=1 totalBytes=${bytes.byteLength}`,
    );
    expect(messages[1]).toMatch(new RegExp(
      `^page-indexed setId=${set.knowledgeSetId} projectId=project-1 pageId=${set.pages[0].pageId} `
      + `fileName="observability\\.html" byteSize=${bytes.byteLength} parseIndexDurationMs=\\d+ `
      + 'chunkCount=\\d+ informationLevel=NORMAL warningCount=0$',
      'u',
    ));
    expect(messages[2]).toMatch(new RegExp(
      `^set-finalized setId=${set.knowledgeSetId} projectId=project-1 pageCount=1 `
      + 'relationCount=0 warningCount=0 durationMs=\\d+$',
      'u',
    ));
    const captured = JSON.stringify(serviceLogInfo.mock.calls);
    expect(captured).not.toContain('UNIQUE_SOURCE_MARKER');
    expect(captured).not.toContain('RELATION_LABEL_MARKER');
    expect(captured).not.toContain('RELATION_TARGET_MARKER');
    expect(captured).not.toMatch(
      /normalized_html|normalizedHtml|staticText|element values|requirement descriptions|snapshot JSON|api[_ -]?key/iu,
    );
  });

  it('preflights page upload ownership and mutable set state', () => {
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'preflight.html', byteSize: 0 }],
    });
    const pageId = set.pages[0].pageId;

    expect(() => service.assertPageUploadAllowed(
      'project-1',
      set.knowledgeSetId,
      pageId,
    )).not.toThrow();
    expect(() => service.assertPageUploadAllowed(
      'project-2',
      set.knowledgeSetId,
      pageId,
    )).toThrow(NotFoundError);
    expect(() => service.assertPageUploadAllowed(
      'project-1',
      set.knowledgeSetId,
      'other-page',
    )).toThrow(NotFoundError);

    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET status = 'READY' WHERE id = ?
    `).run(set.knowledgeSetId);
    expect(() => service.assertPageUploadAllowed(
      'project-1',
      set.knowledgeSetId,
      pageId,
    )).toThrow(ConflictError);
  });

  it('persists bounded preflight upload failures, touches activity, and allows retry', () => {
    const html = '<h1>Retry after media rejection</h1>';
    const bytes = encoder.encode(html);
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'preflight-retry.html', byteSize: bytes.byteLength }],
    });
    const pageId = set.pages[0].pageId;
    const oldTimestamp = '2020-01-01T00:00:00.000Z';
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET updated_at = ? WHERE id = ?
    `).run(oldTimestamp, set.knowledgeSetId);
    const error = new UnsupportedMediaTypeError(
      `HTML upload media type is unsupported ${'x'.repeat(MAX_HTML_ERROR_CHARS + 50)}`,
    );

    expect(() => service.failPreflightedPageUpload(
      'project-1',
      set.knowledgeSetId,
      pageId,
      error,
    )).toThrow(error);

    const failed = service.getSet('project-1', set.knowledgeSetId).pages[0];
    expect(failed.status).toBe('FAILED');
    expect(failed.errorMessage).toMatch(/^HTML upload media type is unsupported/u);
    expect((failed.errorMessage ?? '').length).toBeLessThanOrEqual(MAX_HTML_ERROR_CHARS);
    expect(database.prepare(`
      SELECT updated_at FROM test_gen_html_knowledge_sets WHERE id = ?
    `).get(set.knowledgeSetId)).not.toEqual({ updated_at: oldTimestamp });

    const ready = service.uploadPage('project-1', set.knowledgeSetId, pageId, bytes);
    expect(ready).toMatchObject({ pageId, status: 'READY' });
  });

  it('does not mutate upload state for a wrong project or missing page', () => {
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'ownership.html', byteSize: 0 }],
    });
    const pageId = set.pages[0].pageId;
    const error = new UnsupportedMediaTypeError('Unsupported HTML upload media type');

    expect(() => service.failPreflightedPageUpload(
      'project-2',
      set.knowledgeSetId,
      pageId,
      error,
    )).toThrow(NotFoundError);
    expect(() => service.failPreflightedPageUpload(
      'project-1',
      set.knowledgeSetId,
      'missing-page',
      error,
    )).toThrow(NotFoundError);
    expect(service.getSet('project-1', set.knowledgeSetId).pages[0]).toMatchObject({
      pageId,
      status: 'PENDING',
      errorMessage: null,
    });
  });

  it('marks raw-size and decode failures with bounded source-free errors, then retries', () => {
    const html = '<h1>Recovered</h1>';
    const bytes = encoder.encode(html);
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'retry.html', byteSize: bytes.byteLength }],
    });
    const pageId = set.pages[0].pageId;
    const secretWrongBody = encoder.encode('TOP_SECRET_WRONG_BODY');

    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      pageId,
      secretWrongBody,
    )).toThrow(/manifest byte size/i);
    let failed = service.getSet('project-1', set.knowledgeSetId).pages[0];
    expect(failed.status).toBe('FAILED');
    expect(failed.errorMessage).not.toContain('TOP_SECRET_WRONG_BODY');
    expect((failed.errorMessage ?? '').length).toBeLessThanOrEqual(500);

    const invalidUtf8 = Uint8Array.from({ length: bytes.byteLength }, (_, index) =>
      index === 0 ? 0xff : 0x61
    );
    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      pageId,
      invalidUtf8,
    )).toThrow(/UTF-8/i);
    failed = service.getSet('project-1', set.knowledgeSetId).pages[0];
    expect(failed.status).toBe('FAILED');

    const ready = service.uploadPage('project-1', set.knowledgeSetId, pageId, bytes);
    expect(ready).toMatchObject({
      pageId,
      status: 'READY',
      pageTitle: 'Recovered',
      byteSize: bytes.byteLength,
      errorMessage: null,
    });
  });

  it('compares READY uploads by raw hash before UTF-8 and NUL validation', () => {
    const firstBytes = encoder.encode('<h1>Page A</h1>');
    const differentBytes = encoder.encode('<h1>Page B</h1>');
    const invalidUtf8 = new Uint8Array(firstBytes.byteLength).fill(0x61);
    invalidUtf8[0] = 0xff;
    const nulBytes = new Uint8Array(firstBytes.byteLength).fill(0x61);
    nulBytes[0] = 0;
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'page.html', byteSize: firstBytes.byteLength }],
    });
    const pageId = set.pages[0].pageId;

    const first = service.uploadPage('project-1', set.knowledgeSetId, pageId, firstBytes);
    const oldTimestamp = new Date(
      Date.now() - HTML_KNOWLEDGE_UNBOUND_TTL_MS - 60_000,
    ).toISOString();
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET updated_at = ? WHERE id = ?
    `).run(oldTimestamp, set.knowledgeSetId);
    const repeated = service.uploadPage('project-1', set.knowledgeSetId, pageId, firstBytes);

    expect(repeated).toEqual(first);
    expect(database.prepare(`
      SELECT updated_at FROM test_gen_html_knowledge_sets WHERE id = ?
    `).get(set.knowledgeSetId)).not.toEqual({ updated_at: oldTimestamp });
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET updated_at = ? WHERE id = ?
    `).run(oldTimestamp, set.knowledgeSetId);
    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      pageId,
      differentBytes,
    )).toThrow(/different content/i);
    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      pageId,
      invalidUtf8,
    )).toThrow(/different content/i);
    expect(database.prepare(`
      SELECT updated_at FROM test_gen_html_knowledge_sets WHERE id = ?
    `).get(set.knowledgeSetId)).not.toEqual({ updated_at: oldTimestamp });
    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      pageId,
      nulBytes,
    )).toThrow(/different content/i);
    expect(service.getSet('project-1', set.knowledgeSetId).pages[0]).toEqual(first);
  });

  it('rejects duplicate content hashes clearly and leaves the duplicate page retryable', () => {
    const bytes = encoder.encode('<h1>Duplicate source</h1>');
    const set = service.createSet('project-1', {
      pages: [
        { fileName: 'first.html', byteSize: bytes.byteLength },
        { fileName: 'second.html', byteSize: bytes.byteLength },
      ],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);

    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      set.pages[1].pageId,
      bytes,
    )).toThrow(/duplicate HTML content/i);
    expect(service.getSet('project-1', set.knowledgeSetId).pages[1]).toMatchObject({
      status: 'FAILED',
      errorMessage: expect.stringMatching(/duplicate HTML content/i),
    });
  });

  it('propagates repository and infrastructure upload failures without marking the page FAILED', () => {
    const injectedErrors = [
      new NotFoundError('Page disappeared during upload'),
      new HtmlKnowledgeDataError('Stored index is corrupt'),
      Object.assign(new Error('database is busy'), { code: 'SQLITE_BUSY' }),
      new TypeError('Injected programming failure'),
    ];

    for (const [index, injectedError] of injectedErrors.entries()) {
      const bytes = encoder.encode('<h1>Infrastructure failure</h1>');
      const set = service.createSet('project-1', {
        pages: [{ fileName: `failure-${index}.html`, byteSize: bytes.byteLength }],
      });
      const storeSpy = vi.spyOn(repository, 'storePageReady').mockImplementation(() => {
        throw injectedError;
      });
      const failedSpy = vi.spyOn(repository, 'markPageFailed');

      let thrown: unknown;
      try {
        service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBe(injectedError);
      expect(failedSpy).not.toHaveBeenCalled();
      expect(repository.getSafePage(
        'project-1',
        set.knowledgeSetId,
        set.pages[0].pageId,
      )?.status).toBe('PENDING');
      storeSpy.mockRestore();
      failedSpy.mockRestore();
    }
  });

  it('propagates a repository race while persisting an expected parser failure', () => {
    const bytes = new Uint8Array(16).fill(0x61);
    bytes[0] = 0xff;
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'failure-race.html', byteSize: bytes.byteLength }],
    });
    const raceError = new NotFoundError('Page disappeared before failure persistence');
    vi.spyOn(repository, 'markPageFailed').mockImplementation(() => {
      throw raceError;
    });

    let thrown: unknown;
    try {
      service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(raceError);
    expect(repository.getSafePage(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
    )?.status).toBe('PENDING');
  });

  it('removes pages through the service and preserves exact manifest totals', () => {
    const firstBytes = encoder.encode('<h1>First</h1>');
    const secondBytes = encoder.encode('<h1>Second page</h1>');
    const set = service.createSet('project-1', {
      pages: [
        { fileName: 'first.html', byteSize: firstBytes.byteLength },
        { fileName: 'second.html', byteSize: secondBytes.byteLength },
      ],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, firstBytes);

    const updated = service.removePage('project-1', set.knowledgeSetId, set.pages[0].pageId);
    expect(updated).toMatchObject({ pageCount: 1, totalBytes: secondBytes.byteLength });
    expect(updated.pages.map((page) => page.fileName)).toEqual(['second.html']);
  });

  it('requires every page to be ready before finalization', () => {
    const firstBytes = encoder.encode('<h1>First</h1>');
    const secondBytes = encoder.encode('<h1>Second</h1>');
    const set = service.createSet('project-1', {
      pages: [
        { fileName: 'first.html', byteSize: firstBytes.byteLength },
        { fileName: 'second.html', byteSize: secondBytes.byteLength },
      ],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, firstBytes);

    expect(() => service.finalizeSet('project-1', set.knowledgeSetId)).toThrow(/all .*pages.*ready/i);
    expect(service.getSet('project-1', set.knowledgeSetId).status).toBe('UPLOADING');
  });

  it('classifies only known finalization domain errors as client-safe errors', () => {
    const bytes = encoder.encode('<h1>Finalize errors</h1>');
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'finalize-errors.html', byteSize: bytes.byteLength }],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);

    const cases: Array<{
      error: Error;
      expectedType: typeof ApiValidationError | typeof ConflictError | null;
    }> = [
      {
        error: new HtmlKnowledgeValidationError('Invalid page relation data'),
        expectedType: ApiValidationError,
      },
      {
        error: new HtmlKnowledgeLimitError('HTML page graph exceeds its relation limit'),
        expectedType: ConflictError,
      },
      {
        error: new HtmlKnowledgeDataError('Stored page index is corrupt'),
        expectedType: null,
      },
      {
        error: Object.assign(new Error('database is busy'), { code: 'SQLITE_BUSY' }),
        expectedType: null,
      },
      {
        error: new TypeError('Injected finalization programming failure'),
        expectedType: null,
      },
    ];

    for (const testCase of cases) {
      const injectedService = new HtmlKnowledgeService(repository, () => {
        throw testCase.error;
      });
      let thrown: unknown;
      try {
        injectedService.finalizeSet('project-1', set.knowledgeSetId);
      } catch (error) {
        thrown = error;
      }

      if (testCase.expectedType) {
        expect(thrown).toBeInstanceOf(testCase.expectedType);
        expect((thrown as Error).message).toBe(testCase.error.message);
      } else {
        expect(thrown).toBe(testCase.error);
      }
      expect(service.getSet('project-1', set.knowledgeSetId).status).toBe('UPLOADING');
    }
  });

  it('builds and stores deterministic page relations with sanitized merged warnings', () => {
    const sources = [
      {
        fileName: 'source.html',
        html: '<a href="/shared?token=secret">Shared</a>',
      },
      {
        fileName: 'target-a.html',
        html: '<link rel="canonical" href="/shared"><h1>Target A</h1>',
      },
      {
        fileName: 'target-b.html',
        html: '<link rel="canonical" href="/shared"><h1>Target B</h1>',
      },
      {
        fileName: 'dashboard.html',
        html: '<link rel="canonical" href="/dashboard"><h1>Dashboard</h1>',
      },
      {
        fileName: 'login.html',
        html: '<form action="/dashboard"><button>Sign in</button></form>',
      },
    ];
    const set = service.createSet('project-1', {
      pages: sources.map((page) => ({
        fileName: page.fileName,
        byteSize: encoder.encode(page.html).byteLength,
      })),
    });
    sources.forEach((page, index) => {
      service.uploadPage(
        'project-1',
        set.knowledgeSetId,
        set.pages[index].pageId,
        encoder.encode(page.html),
      );
    });

    const finalized = service.finalizeSet('project-1', set.knowledgeSetId);
    const repeated = service.finalizeSet('project-1', set.knowledgeSetId);
    const graph = repository.loadPageGraph('project-1', set.knowledgeSetId);
    const sourcePage = finalized.pages.find((page) => page.fileName === 'source.html')!;
    const loadedSourceIndex = repository.loadPageIndexes(
      'project-1',
      set.knowledgeSetId,
    ).find((page) => page.pageId === sourcePage.pageId)!;

    expect(finalized.status).toBe('READY');
    expect(repeated).toEqual(finalized);
    expect(graph).toEqual([expect.objectContaining({
      fromPageId: finalized.pages.find((page) => page.fileName === 'login.html')!.pageId,
      toPageId: finalized.pages.find((page) => page.fileName === 'dashboard.html')!.pageId,
      type: 'form-action',
      matchRule: 'canonical-path',
    })]);
    expect(sourcePage.warnings).toEqual([expect.stringMatching(/ambiguous/i)]);
    expect(loadedSourceIndex.warnings).toEqual(sourcePage.warnings);
    expect(new Set(loadedSourceIndex.warnings).size).toBe(loadedSourceIndex.warnings.length);
    expect(JSON.stringify({ graph, sourcePage })).not.toContain('secret');
  });

  it('makes finalized sets immutable and returns ownership-safe not-found errors', () => {
    const bytes = encoder.encode('<h1>Final</h1>');
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'final.html', byteSize: bytes.byteLength }],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, bytes);
    service.finalizeSet('project-1', set.knowledgeSetId);

    expect(() => service.uploadPage(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
      bytes,
    )).toThrow(/not uploading/i);
    expect(() => service.removePage(
      'project-1',
      set.knowledgeSetId,
      set.pages[0].pageId,
    )).toThrow(/not uploading/i);

    const missingError = (() => {
      try {
        service.getSet('project-1', 'missing');
      } catch (error) {
        return error;
      }
    })();
    const wrongProjectError = (() => {
      try {
        service.getSet('project-2', set.knowledgeSetId);
      } catch (error) {
        return error;
      }
    })();
    expect(wrongProjectError).toMatchObject({
      name: (missingError as Error).name,
      message: (missingError as Error).message,
    });
  });

  it('deletes only unbound sets and delegates deterministic abandoned-set cleanup', () => {
    const deletable = service.createSet('project-1', {
      pages: [{ fileName: 'delete.html', byteSize: 0 }],
    });
    service.deleteUnboundSet('project-1', deletable.knowledgeSetId);
    expect(() => service.getSet('project-1', deletable.knowledgeSetId)).toThrow(/not found/i);

    const old = service.createSet('project-1', {
      pages: [{ fileName: 'old.html', byteSize: 0 }],
    });
    const recent = service.createSet('project-1', {
      pages: [{ fileName: 'recent.html', byteSize: 0 }],
    });
    const now = new Date('2026-08-21T12:00:00.000Z');
    const oldTimestamp = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS - 1)
      .toISOString();
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET created_at = ?, updated_at = ? WHERE id = ?
    `).run(oldTimestamp, oldTimestamp, old.knowledgeSetId);
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET created_at = ?, updated_at = ? WHERE id = ?
    `).run(now.toISOString(), now.toISOString(), recent.knowledgeSetId);

    expect(service.cleanupAbandonedSets(now)).toBe(1);
    expect(() => service.getSet('project-1', old.knowledgeSetId)).toThrow(/not found/i);
    expect(service.getSet('project-1', recent.knowledgeSetId).status).toBe('UPLOADING');
  });

  it('keeps old sets active after successful and failed upload attempts', () => {
    const successBytes = encoder.encode('<h1>Success</h1>');
    const failedBytes = new Uint8Array(successBytes.byteLength).fill(0x61);
    failedBytes[0] = 0xff;
    const successful = service.createSet('project-1', {
      pages: [{ fileName: 'success.html', byteSize: successBytes.byteLength }],
    });
    const failed = service.createSet('project-1', {
      pages: [{ fileName: 'failed.html', byteSize: failedBytes.byteLength }],
    });
    const beforeUpload = new Date();
    const oldTimestamp = new Date(
      beforeUpload.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS - 60_000,
    ).toISOString();
    database.prepare(`
      UPDATE test_gen_html_knowledge_sets
      SET created_at = ?, updated_at = ?
      WHERE id IN (?, ?)
    `).run(
      oldTimestamp,
      oldTimestamp,
      successful.knowledgeSetId,
      failed.knowledgeSetId,
    );

    service.uploadPage(
      'project-1',
      successful.knowledgeSetId,
      successful.pages[0].pageId,
      successBytes,
    );
    expect(() => service.uploadPage(
      'project-1',
      failed.knowledgeSetId,
      failed.pages[0].pageId,
      failedBytes,
    )).toThrow(/UTF-8/i);

    const rows = database.prepare(`
      SELECT id, updated_at
      FROM test_gen_html_knowledge_sets
      WHERE id IN (?, ?)
      ORDER BY id
    `).all(successful.knowledgeSetId, failed.knowledgeSetId) as Array<{
      id: string;
      updated_at: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.updated_at !== oldTimestamp)).toBe(true);
    expect(service.cleanupAbandonedSets(new Date())).toBe(0);
    expect(service.getSet('project-1', successful.knowledgeSetId).pages[0].status).toBe('READY');
    expect(service.getSet('project-1', failed.knowledgeSetId).pages[0].status).toBe('FAILED');
  });

  it('creates one run and atomically binds a READY set with an immutable deterministic snapshot', () => {
    const html = encoder.encode('<h1>Login</h1><label for="email">Email</label><input id="email">');
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'login.html', byteSize: html.byteLength }],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, html);
    service.finalizeSet('project-1', set.knowledgeSetId);
    const params = {
      requirementIds: ['story-login'],
      providerConfigName: 'provider-1',
      mode: 'auto' as const,
      flowIds: [],
      useCache: false,
      htmlKnowledgeSetId: set.knowledgeSetId,
    };

    const first = service.createOrReuseRun(
      'project-1',
      set.knowledgeSetId,
      'run-first',
      params,
    );
    const storedBeforeEdit = database.prepare(`
      SELECT status, run_id, requirement_snapshot, requirement_snapshot_hash
      FROM test_gen_html_knowledge_sets
      WHERE id = ?
    `).get(set.knowledgeSetId) as Record<string, unknown>;
    const runConfig = JSON.parse((database.prepare(`
      SELECT config FROM test_gen_runs WHERE id = ?
    `).get('run-first') as { config: string }).config);

    expect(first).toEqual({ runId: 'run-first', created: true });
    expect(storedBeforeEdit).toMatchObject({
      status: 'BOUND',
      run_id: 'run-first',
      requirement_snapshot: expect.any(String),
      requirement_snapshot_hash: expect.stringMatching(/^[a-f\d]{64}$/u),
    });
    expect(runConfig).toEqual(params);
    expect(JSON.stringify(runConfig)).not.toMatch(
      /normalized_html|knowledge_index|requirement_snapshot|requirement_snapshot_hash/iu,
    );

    requirements = requirements.map((requirement) => requirement.id === 'story-login'
      ? { ...requirement, title: 'Edited after start', description: 'Changed later' }
      : requirement);
    const repeated = service.createOrReuseRun(
      'project-1',
      set.knowledgeSetId,
      'run-loser',
      params,
    );
    const storedAfterEdit = database.prepare(`
      SELECT requirement_snapshot, requirement_snapshot_hash
      FROM test_gen_html_knowledge_sets
      WHERE id = ?
    `).get(set.knowledgeSetId);

    expect(repeated).toEqual({ runId: 'run-first', created: false });
    expect(storedAfterEdit).toEqual({
      requirement_snapshot: storedBeforeEdit.requirement_snapshot,
      requirement_snapshot_hash: storedBeforeEdit.requirement_snapshot_hash,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_runs').get())
      .toEqual({ count: 1 });
    expect(repositoryLogInfo).toHaveBeenCalledTimes(1);
    expect(repositoryLogInfo).toHaveBeenCalledWith(
      `set-bound setId=${set.knowledgeSetId} runId=run-first projectId=project-1 pageCount=1`,
    );
  });

  it('returns one winner for competing starts of the same READY set', () => {
    const html = encoder.encode('<h1>Concurrent start</h1>');
    const set = service.createSet('project-1', {
      pages: [{ fileName: 'concurrent.html', byteSize: html.byteLength }],
    });
    service.uploadPage('project-1', set.knowledgeSetId, set.pages[0].pageId, html);
    service.finalizeSet('project-1', set.knowledgeSetId);
    const params = {
      requirementIds: ['story-login'],
      providerConfigName: 'provider-1',
      mode: 'auto' as const,
      htmlKnowledgeSetId: set.knowledgeSetId,
    };

    const outcomes = [
      service.createOrReuseRun('project-1', set.knowledgeSetId, 'run-a', params),
      service.createOrReuseRun('project-1', set.knowledgeSetId, 'run-b', params),
    ];

    expect(outcomes.filter((outcome) => outcome.created)).toHaveLength(1);
    expect(new Set(outcomes.map((outcome) => outcome.runId))).toHaveProperty('size', 1);
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_runs').get())
      .toEqual({ count: 1 });
  });

  it('rejects missing, cross-project, non-READY, and inconsistent sets without creating a run', () => {
    const uploading = service.createSet('project-1', {
      pages: [{ fileName: 'pending.html', byteSize: 0 }],
    });
    const params = {
      requirementIds: ['story-login'],
      providerConfigName: 'provider-1',
      mode: 'auto' as const,
      htmlKnowledgeSetId: uploading.knowledgeSetId,
    };

    expect(() => service.createOrReuseRun(
      'project-1',
      uploading.knowledgeSetId,
      'run-uploading',
      params,
    )).toThrow(ConflictError);
    expect(() => service.createOrReuseRun(
      'project-2',
      uploading.knowledgeSetId,
      'run-wrong-project',
      params,
    )).toThrow(NotFoundError);
    expect(() => service.createOrReuseRun(
      'project-1',
      'missing-set',
      'run-missing',
      { ...params, htmlKnowledgeSetId: 'missing-set' },
    )).toThrow(NotFoundError);

    database.prepare(`
      UPDATE test_gen_html_knowledge_sets SET status = 'READY' WHERE id = ?
    `).run(uploading.knowledgeSetId);
    database.prepare(`
      UPDATE test_gen_html_knowledge_pages
      SET status = 'READY', byte_size = expected_byte_size
      WHERE knowledge_set_id = ?
    `).run(uploading.knowledgeSetId);
    expect(() => service.createOrReuseRun(
      'project-1',
      uploading.knowledgeSetId,
      'run-inconsistent',
      params,
    )).toThrow(ConflictError);
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_runs').get())
      .toEqual({ count: 0 });
  });
});
