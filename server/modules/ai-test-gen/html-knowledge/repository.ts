import type Database from 'better-sqlite3';

import { db } from '../../../shared/db/client.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/http/errors.ts';
import { Log } from '../../../shared/services/logger.ts';
import { randomId } from '../../../shared/utils/index.ts';
import {
  HtmlKnowledgeValidationError,
  normalizeHtmlFileName,
  normalizeStaticText,
} from './normalization.ts';
import {
  hashHtmlRequirementSnapshot,
  serializeHtmlRequirementSnapshot,
} from './requirement-snapshot.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  HTML_KNOWLEDGE_UNBOUND_TTL_MS,
  MAX_HTML_BOUND_BYTES_PER_PROJECT,
  MAX_HTML_CHUNKS,
  MAX_HTML_ELEMENTS,
  MAX_HTML_ERROR_CHARS,
  MAX_HTML_INDEX_BYTES,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_PAGE_RELATIONS,
  MAX_HTML_PAGES,
  MAX_HTML_SET_BYTES,
  MAX_HTML_SET_INDEX_BYTES,
  MAX_HTML_SELECT_OPTIONS,
  MAX_HTML_TITLE_CHARS,
  MAX_HTML_UNBOUND_BYTES_PER_PROJECT,
  MAX_HTML_UNBOUND_SETS_PER_PROJECT,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  MIN_HTML_PAGES,
  type HtmlInformationLevel,
  type HtmlKnowledgeElement,
  type HtmlKnowledgeManifestPage,
  type HtmlKnowledgePageDto,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgePageRow,
  type HtmlKnowledgePageStatus,
  type HtmlKnowledgeRunBindingResult,
  type HtmlKnowledgeReference,
  type HtmlKnowledgeSetDto,
  type HtmlKnowledgeSetRow,
  type HtmlPageRelation,
  type HtmlPageRelationBuildResult,
  type HtmlRequirementSnapshot,
} from './types.ts';

export interface StoreHtmlKnowledgePageInput {
  readonly sha256: string;
  readonly byteSize: number;
  readonly normalizedHtml: string;
  readonly pageTitle: string;
  readonly knowledgeIndex: string;
  readonly informationLevel: HtmlInformationLevel;
  readonly warnings: readonly string[];
}

export interface HtmlKnowledgeQuotaUsage {
  readonly unboundSetCount: number;
  readonly unboundBytes: number;
  readonly boundBytes: number;
}

export interface HtmlKnowledgeOperationalLogger {
  info(message: string): void;
}

export interface HtmlKnowledgePageUploadPreflight {
  readonly setStatus: HtmlKnowledgeSetRow['status'];
}

export interface BoundHtmlKnowledgeData {
  readonly set: HtmlKnowledgeSetRow;
  readonly pages: readonly HtmlKnowledgePageIndex[];
  readonly relations: readonly HtmlPageRelation[];
  readonly requirementSnapshot: HtmlRequirementSnapshot;
}

export type HtmlPageGraphBuilder = (
  pages: readonly HtmlKnowledgePageIndex[],
) => HtmlPageRelationBuildResult;

export class HtmlKnowledgeQuotaError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'HtmlKnowledgeQuotaError';
  }
}

export class HtmlKnowledgeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HtmlKnowledgeDataError';
  }
}

export class HtmlKnowledgeDuplicateContentError extends ConflictError {
  constructor() {
    super('Duplicate HTML content within knowledge set');
    this.name = 'HtmlKnowledgeDuplicateContentError';
  }
}

export class HtmlKnowledgeConcurrentStartError extends ConflictError {
  constructor() {
    super('HTML knowledge set changed during start');
    this.name = 'HtmlKnowledgeConcurrentStartError';
  }
}

interface CreateOrReuseHtmlKnowledgeRunInput {
  readonly projectId: string;
  readonly setId: string;
  readonly candidateRunId: string;
  readonly buildRequirementSnapshot: () => HtmlRequirementSnapshot;
  readonly createRun: (runId: string) => void;
}

interface SafeSetRow {
  id: string;
  status: HtmlKnowledgeSetRow['status'];
  page_count: number;
  total_bytes: number;
  index_version: number;
  created_at: string;
  updated_at: string;
}

interface SafePageRow {
  id: string;
  file_name: string;
  expected_byte_size: number;
  status: HtmlKnowledgePageRow['status'];
  error_message: string | null;
  page_title: string | null;
  byte_size: number | null;
  information_level: HtmlInformationLevel | null;
  warnings: string;
  created_at: string;
  updated_at: string;
}

const SAFE_SET_COLUMNS = `
  id, status, page_count, total_bytes, index_version, created_at, updated_at
`;

const SAFE_PAGE_COLUMNS = `
  p.id, p.file_name, p.expected_byte_size, p.status, p.error_message,
  p.page_title, p.byte_size, p.information_level, p.warnings,
  p.created_at, p.updated_at
`;

export class HtmlKnowledgeRepository {
  constructor(
    private readonly database: Database.Database = db,
    private readonly logger: HtmlKnowledgeOperationalLogger = Log.for('html-knowledge'),
  ) {}

  createSet(
    projectId: string,
    manifestPages: readonly HtmlKnowledgeManifestPage[],
  ): HtmlKnowledgeSetDto {
    const pages = validateManifest(manifestPages);
    const setId = randomId('hks');
    const pageRows = pages.map((page) => ({ ...page, id: randomId('hkp') }));
    const totalBytes = pages.reduce((total, page) => total + page.byteSize, 0);

    const create = this.database.transaction(() => {
      const project = this.database.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) throw new NotFoundError('Project not found');

      const usage = this.getProjectQuotaUsage(projectId);
      if (usage.unboundSetCount >= MAX_HTML_UNBOUND_SETS_PER_PROJECT) {
        throw new HtmlKnowledgeQuotaError(
          `HTML knowledge unbound set quota of ${MAX_HTML_UNBOUND_SETS_PER_PROJECT} reached`,
        );
      }
      if (usage.unboundBytes + totalBytes > MAX_HTML_UNBOUND_BYTES_PER_PROJECT) {
        throw new HtmlKnowledgeQuotaError('HTML knowledge unbound byte quota of 25 MiB exceeded');
      }

      this.database.prepare(`
        INSERT INTO test_gen_html_knowledge_sets
          (id, project_id, status, page_count, total_bytes, page_graph, index_version)
        VALUES (?, ?, 'UPLOADING', ?, ?, '[]', ?)
      `).run(
        setId,
        projectId,
        pageRows.length,
        totalBytes,
        HTML_KNOWLEDGE_INDEX_VERSION,
      );

      const insertPage = this.database.prepare(`
        INSERT INTO test_gen_html_knowledge_pages
          (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
           status, warnings)
        VALUES (?, ?, ?, ?, ?, 'PENDING', '[]')
      `);
      for (const page of pageRows) {
        insertPage.run(page.id, setId, page.fileName, page.fileNameKey, page.byteSize);
      }
    });
    create.immediate();

    return this.requireSafeSet(projectId, setId);
  }

  getSafeSet(projectId: string, setId: string): HtmlKnowledgeSetDto | undefined {
    const set = this.database.prepare(`
      SELECT ${SAFE_SET_COLUMNS}
      FROM test_gen_html_knowledge_sets
      WHERE id = ? AND project_id = ?
    `).get(setId, projectId) as SafeSetRow | undefined;
    if (!set) return undefined;

    const pages = this.database.prepare(`
      SELECT ${SAFE_PAGE_COLUMNS}
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE s.id = ? AND s.project_id = ?
      ORDER BY p.rowid
    `).all(setId, projectId) as SafePageRow[];
    return mapSafeSet(set, pages);
  }

  getSafePage(
    projectId: string,
    setId: string,
    pageId: string,
  ): HtmlKnowledgePageDto | undefined {
    const row = this.database.prepare(`
      SELECT ${SAFE_PAGE_COLUMNS}
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE p.id = ? AND s.id = ? AND s.project_id = ?
    `).get(pageId, setId, projectId) as SafePageRow | undefined;
    return row ? mapSafePage(row) : undefined;
  }

  getSetRow(projectId: string, setId: string): HtmlKnowledgeSetRow | undefined {
    return this.database.prepare(`
      SELECT id, project_id, run_id, status, page_count, total_bytes, page_graph,
             index_version, requirement_snapshot, requirement_snapshot_hash,
             created_at, updated_at
      FROM test_gen_html_knowledge_sets
      WHERE id = ? AND project_id = ?
    `).get(setId, projectId) as HtmlKnowledgeSetRow | undefined;
  }

  getPageRow(
    projectId: string,
    setId: string,
    pageId: string,
  ): HtmlKnowledgePageRow | undefined {
    return this.database.prepare(`
      SELECT p.id, p.knowledge_set_id, p.file_name, p.file_name_key,
             p.expected_byte_size, p.status, p.error_message, p.page_title,
             p.sha256, p.byte_size, p.normalized_html, p.knowledge_index,
             p.information_level, p.warnings, p.created_at, p.updated_at
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE p.id = ? AND s.id = ? AND s.project_id = ?
    `).get(pageId, setId, projectId) as HtmlKnowledgePageRow | undefined;
  }

  getPageUploadPreflight(
    projectId: string,
    setId: string,
    pageId: string,
  ): HtmlKnowledgePageUploadPreflight | undefined {
    const row = this.database.prepare(`
      SELECT s.status AS set_status
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE p.id = ? AND s.id = ? AND s.project_id = ?
    `).get(pageId, setId, projectId) as { set_status: HtmlKnowledgeSetRow['status'] } | undefined;
    return row ? { setStatus: row.set_status } : undefined;
  }

  loadPageSource(
    projectId: string,
    setId: string,
    pageId: string,
  ): string | undefined {
    const set = this.getSetRow(projectId, setId);
    if (!set) return undefined;
    assertInternalSetIntegrity(set, projectId);
    const row = this.database.prepare(`
      SELECT p.normalized_html
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE p.id = ? AND s.id = ? AND s.project_id = ?
    `).get(pageId, setId, projectId) as { normalized_html: string | null } | undefined;
    return row?.normalized_html ?? undefined;
  }

  loadPageIndexes(projectId: string, setId: string): readonly HtmlKnowledgePageIndex[] {
    const set = this.getSetRow(projectId, setId);
    if (!set) throw setNotFound();
    assertInternalSetIntegrity(set, projectId);

    const rows = this.listInternalPages(projectId, setId);
    if (rows.some((page) => page.status !== 'READY' || !page.knowledge_index)) {
      throw new ConflictError('All HTML knowledge pages must be READY');
    }
    return rows.map((page) => parseStoredPageIndex(page));
  }

  loadPageGraph(projectId: string, setId: string): readonly HtmlPageRelation[] {
    const set = this.getSetRow(projectId, setId);
    if (!set) throw setNotFound();
    assertInternalSetIntegrity(set, projectId);
    return parseStoredPageGraph(set.page_graph);
  }

  loadRequirementSnapshot(
    projectId: string,
    setId: string,
  ): HtmlRequirementSnapshot | undefined {
    const set = this.getSetRow(projectId, setId);
    if (!set) throw setNotFound();
    if (set.status !== 'BOUND') return undefined;
    return parseBoundRequirementSnapshot(set, projectId);
  }

  getProjectQuotaUsage(projectId: string): HtmlKnowledgeQuotaUsage {
    const row = this.database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('UPLOADING', 'READY') THEN 1 ELSE 0 END), 0)
          AS unbound_set_count,
        COALESCE(SUM(CASE WHEN status IN ('UPLOADING', 'READY') THEN total_bytes ELSE 0 END), 0)
          AS unbound_bytes,
        COALESCE(SUM(CASE WHEN status = 'BOUND' THEN total_bytes ELSE 0 END), 0)
          AS bound_bytes
      FROM test_gen_html_knowledge_sets
      WHERE project_id = ?
    `).get(projectId) as {
      unbound_set_count: number;
      unbound_bytes: number;
      bound_bytes: number;
    };
    return {
      unboundSetCount: row.unbound_set_count,
      unboundBytes: row.unbound_bytes,
      boundBytes: row.bound_bytes,
    };
  }

  touchUploadActivity(projectId: string, setId: string): void {
    const touch = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      if (set.status !== 'UPLOADING') throw setNotUploading();
      this.updateSetActivity(projectId, setId);
    });
    touch.immediate();
  }

  storePageReady(
    projectId: string,
    setId: string,
    pageId: string,
    input: StoreHtmlKnowledgePageInput,
  ): HtmlKnowledgePageDto {
    validateReadyIdentity(input);

    const store = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      if (set.status !== 'UPLOADING') throw setNotUploading();
      const page = this.requirePageRow(projectId, setId, pageId);

      if (page.status === 'READY') {
        if (page.sha256 === input.sha256) {
          this.updateSetActivity(projectId, setId);
          return this.requireSafePage(projectId, setId, pageId);
        }
        throw new ConflictError('READY HTML knowledge page contains different content');
      }
      validateReadyPayload(input);
      if (page.expected_byte_size !== input.byteSize) {
        throw new ValidationError('HTML page does not match its manifest byte size');
      }

      const parsedIndex = parsePageIndex(input.knowledgeIndex);
      assertIndexMatchesPage(parsedIndex, page, input);
      const duplicate = this.database.prepare(`
        SELECT p.id
        FROM test_gen_html_knowledge_pages p
        INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
        WHERE s.id = ? AND s.project_id = ? AND p.sha256 = ? AND p.id <> ?
        LIMIT 1
      `).get(setId, projectId, input.sha256, pageId);
      if (duplicate) throw new HtmlKnowledgeDuplicateContentError();

      const result = this.database.prepare(`
        UPDATE test_gen_html_knowledge_pages
        SET status = 'READY', error_message = NULL, page_title = ?, sha256 = ?,
            byte_size = ?, normalized_html = ?, knowledge_index = ?,
            information_level = ?, warnings = ?, updated_at = datetime('now')
        WHERE id = ? AND knowledge_set_id = ? AND status IN ('PENDING', 'FAILED')
      `).run(
        normalizeStaticText(input.pageTitle, MAX_HTML_TITLE_CHARS),
        input.sha256,
        input.byteSize,
        input.normalizedHtml,
        input.knowledgeIndex,
        input.informationLevel,
        JSON.stringify(boundWarnings(input.warnings)),
        pageId,
        setId,
      );
      if (result.changes !== 1) {
        throw new ConflictError('HTML knowledge page state changed during upload');
      }
      this.updateSetActivity(projectId, setId);
      return this.requireSafePage(projectId, setId, pageId);
    });
    return store.immediate();
  }

  markPageFailed(
    projectId: string,
    setId: string,
    pageId: string,
    errorMessage: string,
  ): HtmlKnowledgePageDto {
    const boundedError = normalizeStaticText(errorMessage, MAX_HTML_ERROR_CHARS)
      || 'HTML page could not be indexed';
    const mark = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      if (set.status !== 'UPLOADING') throw setNotUploading();
      const page = this.requirePageRow(projectId, setId, pageId);
      if (page.status === 'READY') {
        throw new ConflictError('READY HTML knowledge page cannot be marked FAILED');
      }

      const result = this.database.prepare(`
        UPDATE test_gen_html_knowledge_pages
        SET status = 'FAILED', error_message = ?, page_title = NULL, sha256 = NULL,
            byte_size = NULL, normalized_html = NULL, knowledge_index = NULL,
            information_level = NULL, warnings = '[]', updated_at = datetime('now')
        WHERE id = ? AND knowledge_set_id = ? AND status IN ('PENDING', 'FAILED')
      `).run(boundedError, pageId, setId);
      if (result.changes !== 1) {
        throw new ConflictError('HTML knowledge page state changed during failure update');
      }
      this.updateSetActivity(projectId, setId);
      return this.requireSafePage(projectId, setId, pageId);
    });
    return mark.immediate();
  }

  removePage(projectId: string, setId: string, pageId: string): HtmlKnowledgeSetDto {
    const remove = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      if (set.status !== 'UPLOADING') throw setNotUploading();
      this.requirePageRow(projectId, setId, pageId);

      this.database.prepare(`
        DELETE FROM test_gen_html_knowledge_pages
        WHERE id = ? AND knowledge_set_id = ?
      `).run(pageId, setId);
      const totals = this.database.prepare(`
        SELECT COUNT(*) AS page_count,
               COALESCE(SUM(expected_byte_size), 0) AS total_bytes
        FROM test_gen_html_knowledge_pages
        WHERE knowledge_set_id = ?
      `).get(setId) as { page_count: number; total_bytes: number };
      this.database.prepare(`
        UPDATE test_gen_html_knowledge_sets
        SET page_count = ?, total_bytes = ?, updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND status = 'UPLOADING'
      `).run(totals.page_count, totals.total_bytes, setId, projectId);
      return this.requireSafeSet(projectId, setId);
    });
    return remove.immediate();
  }

  finalizeSet(
    projectId: string,
    setId: string,
    buildPageGraph: HtmlPageGraphBuilder,
  ): HtmlKnowledgeSetDto {
    const finalize = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      assertSetIndexVersion(set);
      if (set.status === 'READY') return this.requireSafeSet(projectId, setId);
      if (set.status !== 'UPLOADING') {
        throw new ConflictError('HTML knowledge set cannot be finalized from its current state');
      }

      const pages = this.listInternalPages(projectId, setId);
      if (pages.length < MIN_HTML_PAGES || pages.length > MAX_HTML_PAGES) {
        throw new ConflictError('HTML knowledge set must contain between 1 and 20 pages');
      }
      if (pages.length !== set.page_count) {
        throw new ConflictError('HTML knowledge manifest page count does not match stored pages');
      }
      if (pages.some((page) => page.status !== 'READY')) {
        throw new ConflictError('All HTML knowledge pages must be READY');
      }

      let totalBytes = 0;
      let totalIndexBytes = 0;
      const pageIds = new Set<string>();
      const pageFileKeys = new Map<string, string>();
      const pageIndexes: HtmlKnowledgePageIndex[] = [];
      for (const page of pages) {
        if (
          page.byte_size === null
          || page.byte_size !== page.expected_byte_size
          || page.sha256 === null
          || page.normalized_html === null
          || page.knowledge_index === null
          || page.page_title === null
          || page.information_level === null
        ) {
          throw new ConflictError('HTML page actual data does not match its manifest byte size');
        }
        totalBytes += page.byte_size;
        const indexBytes = Buffer.byteLength(page.knowledge_index, 'utf8');
        if (indexBytes > MAX_HTML_INDEX_BYTES) {
          throw new ConflictError('HTML serialized knowledge index exceeds 1 MiB');
        }
        totalIndexBytes += indexBytes;
        pageIndexes.push(parseStoredPageIndex(page));
        pageIds.add(page.id);
        pageFileKeys.set(page.id, page.file_name_key);
      }
      if (totalBytes !== set.total_bytes) {
        throw new ConflictError('HTML knowledge actual bytes do not match the manifest byte total');
      }
      if (totalBytes > MAX_HTML_SET_BYTES) {
        throw new ConflictError('HTML knowledge source exceeds 5 MiB');
      }
      if (totalIndexBytes > MAX_HTML_SET_INDEX_BYTES) {
        throw new ConflictError('HTML knowledge serialized indexes exceed 10 MiB');
      }

      const graphResult = buildPageGraph(pageIndexes);
      if (!graphResult
        || !Array.isArray(graphResult.relations)
        || !isRecord(graphResult.warningsByPageId)) {
        throw new ValidationError('HTML page graph builder returned an invalid result');
      }
      const validatedRelations = graphResult.relations.map(validatePageRelation);
      if (validatedRelations.length > MAX_HTML_PAGE_RELATIONS) {
        throw new ValidationError('HTML page graph exceeds 2,000 relations');
      }
      const warningsByPageId = graphResult.warningsByPageId;
      for (const pageId of Object.keys(warningsByPageId)) {
        if (!pageIds.has(pageId)) {
          throw new ValidationError('HTML page warning references an unknown page');
        }
      }
      const graph = canonicalRelations(validatedRelations, pageIds, pageFileKeys);
      const updateWarnings = this.database.prepare(`
        UPDATE test_gen_html_knowledge_pages
        SET warnings = ?, updated_at = datetime('now')
        WHERE id = ? AND knowledge_set_id = ?
      `);
      for (const page of pages) {
        const merged = boundWarnings([
          ...parseStoredWarnings(page.warnings),
          ...(warningsByPageId[page.id] ?? []),
        ]);
        updateWarnings.run(JSON.stringify(merged), page.id, setId);
      }

      const result = this.database.prepare(`
        UPDATE test_gen_html_knowledge_sets
        SET status = 'READY', page_graph = ?, updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND status = 'UPLOADING' AND run_id IS NULL
      `).run(JSON.stringify(graph), setId, projectId);
      if (result.changes !== 1) {
        const current = this.getSetRow(projectId, setId);
        if (current?.status === 'READY') return this.requireSafeSet(projectId, setId);
        throw new ConflictError('HTML knowledge set changed during finalization');
      }
      return this.requireSafeSet(projectId, setId);
    });
    return finalize.immediate();
  }

  deleteUnboundSet(projectId: string, setId: string): void {
    const remove = this.database.transaction(() => {
      const set = this.requireSetRow(projectId, setId);
      if (set.status === 'BOUND') throw new ConflictError('Bound HTML knowledge set cannot be deleted directly');
      const result = this.database.prepare(`
        DELETE FROM test_gen_html_knowledge_sets
        WHERE id = ? AND project_id = ? AND status IN ('UPLOADING', 'READY') AND run_id IS NULL
      `).run(setId, projectId);
      if (result.changes !== 1) {
        throw new ConflictError('HTML knowledge set changed during deletion');
      }
    });
    remove.immediate();
  }

  deleteUnboundSetsByProject(projectId: string): number {
    const result = this.database.prepare(`
      DELETE FROM test_gen_html_knowledge_sets
      WHERE project_id = ?
        AND status IN ('UPLOADING', 'READY')
        AND run_id IS NULL
    `).run(projectId);
    return result.changes;
  }

  cleanupAbandonedSets(now = new Date()): number {
    const cutoff = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS).toISOString();
    const result = this.database.prepare(`
      DELETE FROM test_gen_html_knowledge_sets
      WHERE status IN ('UPLOADING', 'READY')
        AND run_id IS NULL
        AND julianday(updated_at) < julianday(?)
    `).run(cutoff);
    return result.changes;
  }

  createOrReuseRun(
    input: CreateOrReuseHtmlKnowledgeRunInput,
  ): HtmlKnowledgeRunBindingResult {
    let pageCount = 0;
    const createAndBind = this.database.transaction((): HtmlKnowledgeRunBindingResult => {
      const set = this.getSetRow(input.projectId, input.setId);
      if (!set) throw setNotFound();
      if (set.status === 'BOUND') {
        if (!set.run_id) throw new HtmlKnowledgeDataError('Bound HTML knowledge set has no run');
        return { runId: set.run_id, created: false };
      }
      if (set.status !== 'READY') {
        throw new ConflictError('HTML knowledge set is not ready');
      }
      pageCount = set.page_count;
      assertSetIndexVersion(set);
      this.assertReadySetCanBind(input.projectId, set);

      const usage = this.getProjectQuotaUsage(input.projectId);
      if (usage.boundBytes + set.total_bytes > MAX_HTML_BOUND_BYTES_PER_PROJECT) {
        throw new HtmlKnowledgeQuotaError('HTML knowledge bound byte quota of 250 MiB exceeded');
      }

      const snapshot = input.buildRequirementSnapshot();
      const snapshotJson = serializeHtmlRequirementSnapshot(snapshot);
      const snapshotHash = hashHtmlRequirementSnapshot(snapshot);
      input.createRun(input.candidateRunId);
      const result = this.database.prepare(`
        UPDATE test_gen_html_knowledge_sets
        SET status = 'BOUND', run_id = ?, requirement_snapshot = ?,
            requirement_snapshot_hash = ?, updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND status = 'READY' AND run_id IS NULL
          AND EXISTS (
            SELECT 1 FROM test_gen_runs WHERE id = ? AND project_id = ?
          )
      `).run(
        input.candidateRunId,
        snapshotJson,
        snapshotHash,
        input.setId,
        input.projectId,
        input.candidateRunId,
        input.projectId,
      );
      if (result.changes !== 1) throw new HtmlKnowledgeConcurrentStartError();
      return { runId: input.candidateRunId, created: true };
    });

    try {
      const result = createAndBind.immediate();
      if (result.created) {
        this.logger.info(
          `set-bound setId=${input.setId} runId=${result.runId} projectId=${input.projectId} pageCount=${pageCount}`,
        );
      }
      return result;
    } catch (error) {
      if (!(error instanceof HtmlKnowledgeConcurrentStartError)) throw error;
      const winner = this.getSetRow(input.projectId, input.setId);
      if (winner?.status === 'BOUND' && winner.run_id) {
        return { runId: winner.run_id, created: false };
      }
      throw error;
    }
  }

  bindReadySetToRun(
    projectId: string,
    setId: string,
    runId: string,
    requirementSnapshotJson: string,
    requirementSnapshotHash: string,
  ): boolean {
    const requirementSnapshot = parseSnapshot(requirementSnapshotJson);
    if (requirementSnapshot.projectId !== projectId) {
      throw new ValidationError('HTML requirement snapshot belongs to another project');
    }
    const canonicalSnapshot = serializeHtmlRequirementSnapshot(requirementSnapshot);
    const canonicalHash = hashHtmlRequirementSnapshot(requirementSnapshot);
    if (canonicalSnapshot !== requirementSnapshotJson || canonicalHash !== requirementSnapshotHash) {
      throw new ValidationError('HTML requirement snapshot is not canonical or its hash is invalid');
    }

    let pageCount = 0;
    const bind = this.database.transaction(() => {
      const set = this.getSetRow(projectId, setId);
      if (!set || set.status !== 'READY' || set.run_id !== null) return false;
      pageCount = set.page_count;
      assertSetIndexVersion(set);
      const run = this.database.prepare(`
        SELECT 1
        FROM test_gen_runs
        WHERE id = ? AND project_id = ?
      `).get(runId, projectId);
      if (!run) return false;
      const usage = this.getProjectQuotaUsage(projectId);
      if (usage.boundBytes + set.total_bytes > MAX_HTML_BOUND_BYTES_PER_PROJECT) {
        throw new HtmlKnowledgeQuotaError('HTML knowledge bound byte quota of 250 MiB exceeded');
      }

      const result = this.database.prepare(`
        UPDATE test_gen_html_knowledge_sets
        SET status = 'BOUND', run_id = ?, requirement_snapshot = ?,
            requirement_snapshot_hash = ?, updated_at = datetime('now')
        WHERE id = ? AND project_id = ? AND status = 'READY' AND run_id IS NULL
          AND EXISTS (
            SELECT 1 FROM test_gen_runs WHERE id = ? AND project_id = ?
          )
      `).run(
        runId,
        canonicalSnapshot,
        canonicalHash,
        setId,
        projectId,
        runId,
        projectId,
      );
      return result.changes === 1;
    });
    const bound = bind.immediate();
    if (bound) {
      this.logger.info(
        `set-bound setId=${setId} runId=${runId} projectId=${projectId} pageCount=${pageCount}`,
      );
    }
    return bound;
  }

  loadBoundSetByRun(
    projectId: string,
    runId: string,
    expectedSetId?: string,
  ): BoundHtmlKnowledgeData | undefined {
    const set = this.database.prepare(`
      SELECT s.id, s.project_id, s.run_id, s.status, s.page_count, s.total_bytes,
             s.page_graph, s.index_version, s.requirement_snapshot,
             s.requirement_snapshot_hash, s.created_at, s.updated_at
      FROM test_gen_html_knowledge_sets s
      INNER JOIN test_gen_runs r
        ON r.id = s.run_id AND r.project_id = s.project_id
      WHERE s.project_id = ? AND r.project_id = ? AND r.id = ? AND s.status = 'BOUND'
        AND (? IS NULL OR s.id = ?)
    `).get(
      projectId,
      projectId,
      runId,
      expectedSetId ?? null,
      expectedSetId ?? null,
    ) as
      | HtmlKnowledgeSetRow
      | undefined;
    if (!set) return undefined;
    const requirementSnapshot = parseBoundRequirementSnapshot(set, projectId);
    const pageRows = this.listInternalPages(projectId, set.id);
    if (pageRows.length !== set.page_count) {
      throw new HtmlKnowledgeDataError('Stored bound HTML knowledge page count is inconsistent');
    }
    let totalBytes = 0;
    for (const page of pageRows) {
      if (page.status !== 'READY'
        || page.byte_size === null
        || page.byte_size !== page.expected_byte_size
        || page.normalized_html === null
        || page.knowledge_index === null
        || page.page_title === null
        || page.sha256 === null
        || page.information_level === null) {
        throw new HtmlKnowledgeDataError('Stored bound HTML knowledge page data is incomplete');
      }
      totalBytes += page.byte_size;
    }
    if (!Number.isSafeInteger(totalBytes) || totalBytes !== set.total_bytes) {
      throw new HtmlKnowledgeDataError('Stored bound HTML knowledge byte total is inconsistent');
    }

    return {
      set,
      pages: pageRows.map((page) => parseStoredPageIndex(page)),
      relations: parseStoredPageGraph(set.page_graph),
      requirementSnapshot,
    };
  }

  verifyBoundReference(
    runId: string,
    projectId: string,
    reference: HtmlKnowledgeReference,
  ): void {
    const set = this.database.prepare(`
      SELECT s.id, s.project_id, s.run_id, s.status, s.page_count, s.total_bytes,
             s.index_version, s.requirement_snapshot_hash
      FROM test_gen_html_knowledge_sets s
      INNER JOIN test_gen_runs r
        ON r.id = s.run_id AND r.project_id = s.project_id
      WHERE r.id = ? AND r.project_id = ? AND s.id = ? AND s.status = 'BOUND'
    `).get(runId, projectId, reference.knowledgeSetId) as Pick<
      HtmlKnowledgeSetRow,
      | 'id'
      | 'project_id'
      | 'run_id'
      | 'status'
      | 'page_count'
      | 'total_bytes'
      | 'index_version'
      | 'requirement_snapshot_hash'
    > | undefined;
    if (!set) throw new HtmlKnowledgeDataError('Bound HTML knowledge set is unavailable');

    const pages = this.database.prepare(`
      SELECT status, page_title, information_level
      FROM test_gen_html_knowledge_pages
      WHERE knowledge_set_id = ?
      ORDER BY file_name_key, id
    `).all(reference.knowledgeSetId) as Array<{
      status: HtmlKnowledgePageStatus;
      page_title: string | null;
      information_level: HtmlInformationLevel | null;
    }>;
    const pageTitles = pages.map((page) => page.page_title);
    const mismatch = set.id !== reference.knowledgeSetId
      || set.project_id !== projectId
      || set.run_id !== runId
      || set.status !== 'BOUND'
      || set.index_version !== HTML_KNOWLEDGE_INDEX_VERSION
      || set.requirement_snapshot_hash !== reference.requirementSnapshotHash
      || set.page_count !== reference.pageCount
      || pages.length !== reference.pageCount
      || set.total_bytes !== reference.totalBytes
      || pages.some((page) => page.status !== 'READY' || page.page_title === null || page.information_level === null)
      || pages.some((page) => page.information_level === 'LOW_INFORMATION') !== reference.hasLowInformationPages
      || pageTitles.some((title, index) => title !== reference.pageTitles[index])
      || pageTitles.length !== reference.pageTitles.length;
    if (mismatch) {
      throw new HtmlKnowledgeDataError('Bound HTML knowledge set does not match its reference');
    }
  }

  private listInternalPages(projectId: string, setId: string): HtmlKnowledgePageRow[] {
    return this.database.prepare(`
      SELECT p.id, p.knowledge_set_id, p.file_name, p.file_name_key,
             p.expected_byte_size, p.status, p.error_message, p.page_title,
             p.sha256, p.byte_size, p.normalized_html, p.knowledge_index,
             p.information_level, p.warnings, p.created_at, p.updated_at
      FROM test_gen_html_knowledge_pages p
      INNER JOIN test_gen_html_knowledge_sets s ON s.id = p.knowledge_set_id
      WHERE s.id = ? AND s.project_id = ?
      ORDER BY p.file_name_key, p.id
    `).all(setId, projectId) as HtmlKnowledgePageRow[];
  }

  private assertReadySetCanBind(projectId: string, set: HtmlKnowledgeSetRow): void {
    const totals = this.database.prepare(`
      SELECT
        COUNT(*) AS page_count,
        COALESCE(SUM(byte_size), 0) AS total_bytes,
        COALESCE(SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END), 0) AS ready_count,
        COALESCE(SUM(
          CASE WHEN byte_size IS NULL OR byte_size <> expected_byte_size THEN 1 ELSE 0 END
        ), 0) AS invalid_byte_count,
        COALESCE(SUM(
          CASE WHEN normalized_html IS NULL OR knowledge_index IS NULL
                 OR page_title IS NULL OR sha256 IS NULL OR information_level IS NULL
            THEN 1 ELSE 0 END
        ), 0) AS invalid_page_count
      FROM test_gen_html_knowledge_pages
      WHERE knowledge_set_id = ?
        AND EXISTS (
          SELECT 1 FROM test_gen_html_knowledge_sets
          WHERE id = ? AND project_id = ?
        )
    `).get(set.id, set.id, projectId) as {
      page_count: number;
      total_bytes: number;
      ready_count: number;
      invalid_byte_count: number;
      invalid_page_count: number;
    };
    if (
      set.page_count < MIN_HTML_PAGES
      || set.page_count > MAX_HTML_PAGES
      || set.total_bytes > MAX_HTML_SET_BYTES
      || totals.page_count !== set.page_count
      || totals.ready_count !== totals.page_count
      || totals.invalid_byte_count !== 0
      || totals.invalid_page_count !== 0
      || totals.total_bytes !== set.total_bytes
    ) {
      throw new ConflictError('HTML knowledge set pages are not ready for binding');
    }
  }

  private requireSetRow(projectId: string, setId: string): HtmlKnowledgeSetRow {
    const set = this.getSetRow(projectId, setId);
    if (!set) throw setNotFound();
    return set;
  }

  private requirePageRow(projectId: string, setId: string, pageId: string): HtmlKnowledgePageRow {
    const page = this.getPageRow(projectId, setId, pageId);
    if (!page) throw pageNotFound();
    return page;
  }

  private requireSafeSet(projectId: string, setId: string): HtmlKnowledgeSetDto {
    const set = this.getSafeSet(projectId, setId);
    if (!set) throw setNotFound();
    return set;
  }

  private requireSafePage(projectId: string, setId: string, pageId: string): HtmlKnowledgePageDto {
    const page = this.getSafePage(projectId, setId, pageId);
    if (!page) throw pageNotFound();
    return page;
  }

  private updateSetActivity(projectId: string, setId: string): void {
    const result = this.database.prepare(`
      UPDATE test_gen_html_knowledge_sets
      SET updated_at = datetime('now')
      WHERE id = ? AND project_id = ? AND status = 'UPLOADING'
    `).run(setId, projectId);
    if (result.changes !== 1) {
      throw new ConflictError('HTML knowledge set changed during upload');
    }
  }
}

function validateManifest(manifestPages: readonly HtmlKnowledgeManifestPage[]): Array<{
  fileName: string;
  fileNameKey: string;
  byteSize: number;
}> {
  if (!Array.isArray(manifestPages)
    || manifestPages.length < MIN_HTML_PAGES
    || manifestPages.length > MAX_HTML_PAGES) {
    throw new ValidationError('HTML knowledge manifest must contain between 1 and 20 pages');
  }

  const seenNames = new Set<string>();
  let totalBytes = 0;
  const pages = manifestPages.map((page) => {
    if (!page || typeof page !== 'object') {
      throw new ValidationError('Each HTML knowledge manifest page must be an object');
    }
    let normalizedName: ReturnType<typeof normalizeHtmlFileName>;
    try {
      normalizedName = normalizeHtmlFileName(page.fileName);
    } catch (error) {
      throw asValidationError(error);
    }
    if (seenNames.has(normalizedName.key)) {
      throw new ConflictError('Duplicate HTML file name in knowledge manifest');
    }
    seenNames.add(normalizedName.key);
    if (!Number.isSafeInteger(page.byteSize) || page.byteSize < 0) {
      throw new ValidationError('HTML manifest byte size must be a non-negative integer');
    }
    if (page.byteSize > MAX_HTML_PAGE_BYTES) {
      throw new ValidationError('HTML manifest page exceeds 512 KiB');
    }
    totalBytes += page.byteSize;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_HTML_SET_BYTES) {
      throw new ValidationError('HTML knowledge manifest exceeds 5 MiB');
    }
    return {
      fileName: normalizedName.displayName,
      fileNameKey: normalizedName.key,
      byteSize: page.byteSize,
    };
  });
  return pages;
}

function validateReadyIdentity(input: StoreHtmlKnowledgePageInput): void {
  if (!/^[a-f\d]{64}$/u.test(input.sha256)) {
    throw new ValidationError('HTML page content hash is invalid');
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0 || input.byteSize > MAX_HTML_PAGE_BYTES) {
    throw new ValidationError('HTML page byte size is invalid');
  }
}

function validateReadyPayload(input: StoreHtmlKnowledgePageInput): void {
  if (typeof input.normalizedHtml !== 'string') {
    throw new ValidationError('Normalized HTML source must be text');
  }
  if (typeof input.pageTitle !== 'string' || !input.pageTitle) {
    throw new ValidationError('HTML page title is required');
  }
  if (input.informationLevel !== 'NORMAL' && input.informationLevel !== 'LOW_INFORMATION') {
    throw new ValidationError('HTML page information level is invalid');
  }
  if (Buffer.byteLength(input.knowledgeIndex, 'utf8') > MAX_HTML_INDEX_BYTES) {
    throw new ValidationError('HTML serialized knowledge index exceeds 1 MiB');
  }
  parsePageIndex(input.knowledgeIndex);
  boundWarnings(input.warnings);
}

function mapSafeSet(set: SafeSetRow, pages: readonly SafePageRow[]): HtmlKnowledgeSetDto {
  return {
    knowledgeSetId: set.id,
    status: set.status,
    pageCount: set.page_count,
    totalBytes: set.total_bytes,
    indexVersion: set.index_version,
    pages: pages.map(mapSafePage),
    createdAt: toIsoUtc(set.created_at),
    updatedAt: toIsoUtc(set.updated_at),
  };
}

function mapSafePage(page: SafePageRow): HtmlKnowledgePageDto {
  return {
    pageId: page.id,
    fileName: page.file_name,
    expectedByteSize: page.expected_byte_size,
    status: page.status,
    errorMessage: page.error_message,
    pageTitle: page.page_title,
    byteSize: page.byte_size,
    informationLevel: page.information_level,
    warnings: parseStoredWarnings(page.warnings),
    createdAt: toIsoUtc(page.created_at),
    updatedAt: toIsoUtc(page.updated_at),
  };
}

function toIsoUtc(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge timestamp is invalid');
  }
  return parsed.toISOString();
}

function boundWarnings(warnings: readonly string[]): string[] {
  if (!Array.isArray(warnings)) throw new ValidationError('HTML page warnings must be an array');
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of warnings) {
    if (typeof value !== 'string') throw new ValidationError('HTML page warning must be text');
    const warning = normalizeStaticText(value, MAX_HTML_WARNING_CHARS);
    if (!warning || seen.has(warning)) continue;
    seen.add(warning);
    result.push(warning);
    if (result.length === MAX_HTML_WARNINGS) break;
  }
  return result;
}

function parseStoredWarnings(serialized: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge warnings are invalid JSON');
  }
  if (!Array.isArray(value) || value.some((warning) => typeof warning !== 'string')) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge warnings are invalid');
  }
  try {
    return boundWarnings(value);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge warnings are invalid');
  }
}

function parsePageIndex(serialized: string): HtmlKnowledgePageIndex {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index is invalid JSON');
  }
  if (!isRecord(value)) throw new HtmlKnowledgeDataError('Stored HTML knowledge index is invalid');
  if (value.version !== HTML_KNOWLEDGE_INDEX_VERSION) {
    throw new HtmlKnowledgeDataError('Unsupported HTML knowledge index version');
  }
  if (
    !isString(value.pageId)
    || !isString(value.fileName)
    || !isString(value.fileNameKey)
    || !isString(value.pageTitle)
    || !isString(value.contentSha256)
    || (value.informationLevel !== 'NORMAL' && value.informationLevel !== 'LOW_INFORMATION')
    || !Array.isArray(value.routeAliases)
    || !Array.isArray(value.chunks)
    || !Array.isArray(value.relationCandidates)
    || !Array.isArray(value.warnings)
    || value.warnings.some((warning) => typeof warning !== 'string')
    || value.warnings.length > MAX_HTML_WARNINGS
    || value.warnings.some((warning) => Array.from(warning as string).length > MAX_HTML_WARNING_CHARS)
    || value.chunks.length > MAX_HTML_CHUNKS
    || (value.stats !== undefined && !isValidIndexStats(value.stats))
  ) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index is invalid');
  }
  if (value.chunks.some((chunk) => !isValidChunk(chunk))) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index contains an invalid chunk');
  }
  const elementCount = value.chunks.reduce(
    (total, chunk) => total + ((chunk as Record<string, unknown>).elements as unknown[]).length,
    0,
  );
  if (elementCount > MAX_HTML_ELEMENTS) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index exceeds the element limit');
  }
  if (value.relationCandidates.some((candidate) => !isValidRelationCandidate(candidate))) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index contains an invalid relation candidate');
  }
  if (value.routeAliases.some((route) => !isValidRoute(route))) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index contains an invalid route');
  }
  if (value.canonicalRoute !== undefined && !isValidRoute(value.canonicalRoute)) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index contains an invalid canonical route');
  }
  if (value.baseRoute !== undefined && !isValidRoute(value.baseRoute)) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index contains an invalid base route');
  }
  return value as unknown as HtmlKnowledgePageIndex;
}

function parseStoredPageIndex(page: HtmlKnowledgePageRow): HtmlKnowledgePageIndex {
  if (!page.knowledge_index) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge page has no index');
  }
  const index = parsePageIndex(page.knowledge_index);
  if (
    index.pageId !== page.id
    || index.fileName !== page.file_name
    || index.fileNameKey !== page.file_name_key
    || index.contentSha256 !== page.sha256
    || index.pageTitle !== page.page_title
    || index.informationLevel !== page.information_level
  ) {
    throw new HtmlKnowledgeDataError('Stored HTML knowledge index does not match its page');
  }
  return {
    ...index,
    warnings: parseStoredWarnings(page.warnings),
  };
}

function assertIndexMatchesPage(
  index: HtmlKnowledgePageIndex,
  page: HtmlKnowledgePageRow,
  input: StoreHtmlKnowledgePageInput,
): void {
  if (
    index.pageId !== page.id
    || index.fileName !== page.file_name
    || index.fileNameKey !== page.file_name_key
    || index.contentSha256 !== input.sha256
    || index.pageTitle !== input.pageTitle
    || index.informationLevel !== input.informationLevel
  ) {
    throw new ValidationError('HTML knowledge index does not match its manifest page');
  }
}

function parseStoredPageGraph(serialized: string): HtmlPageRelation[] {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML page graph is invalid JSON');
  }
  if (!Array.isArray(value) || value.length > MAX_HTML_PAGE_RELATIONS) {
    throw new HtmlKnowledgeDataError('Stored HTML page graph is invalid');
  }
  try {
    return value.map(validatePageRelation);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML page graph contains an invalid relation');
  }
}

function validatePageRelation(value: unknown): HtmlPageRelation {
  if (!isRecord(value)
    || !isString(value.fromPageId)
    || !isString(value.toPageId)
    || (value.type !== 'link' && value.type !== 'form-action')
    || !isString(value.sourceDomPath)
    || !isString(value.sourceTarget)
    || !['canonical-path', 'file-path', 'unique-path-suffix'].includes(String(value.matchRule))
    || !['high', 'medium'].includes(String(value.confidence))
    || (value.label !== undefined && !isString(value.label))) {
    throw new ValidationError('HTML page relation is invalid');
  }
  return {
    fromPageId: value.fromPageId as string,
    toPageId: value.toPageId as string,
    type: value.type as HtmlPageRelation['type'],
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
    sourceDomPath: value.sourceDomPath as string,
    sourceTarget: value.sourceTarget as string,
    matchRule: value.matchRule as HtmlPageRelation['matchRule'],
    confidence: value.confidence as HtmlPageRelation['confidence'],
  };
}

function canonicalRelations(
  relations: readonly HtmlPageRelation[],
  pageIds: ReadonlySet<string>,
  pageFileKeys: ReadonlyMap<string, string>,
): HtmlPageRelation[] {
  const unique = new Map<string, HtmlPageRelation>();
  for (const relation of relations) {
    if (!pageIds.has(relation.fromPageId) || !pageIds.has(relation.toPageId)) {
      throw new ValidationError('HTML page relation references an unknown page');
    }
    const key = JSON.stringify([
      relation.fromPageId,
      relation.toPageId,
      relation.type,
      relation.sourceDomPath,
      relation.sourceTarget,
    ]);
    const existing = unique.get(key);
    if (!existing || compareOptionalText(relation.label, existing.label) < 0) {
      unique.set(key, relation);
    }
  }
  return [...unique.values()].sort((left, right) =>
    compareText(pageFileKeys.get(left.fromPageId) ?? '', pageFileKeys.get(right.fromPageId) ?? '')
    || compareText(left.sourceDomPath, right.sourceDomPath)
    || compareText(left.type, right.type)
    || compareText(left.sourceTarget, right.sourceTarget)
    || compareText(left.toPageId, right.toPageId)
    || compareText(left.fromPageId, right.fromPageId)
    || compareText(left.label ?? '', right.label ?? '')
  );
}

function parseSnapshot(serialized: string): HtmlRequirementSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ValidationError('HTML requirement snapshot is invalid JSON');
  }
  if (!isRecord(value)) throw new ValidationError('HTML requirement snapshot is invalid');
  if (value.version !== 1) {
    throw new ValidationError('Unsupported HTML requirement snapshot version');
  }
  if (
    !isString(value.projectId)
    || !isStringArray(value.selectedRequirementIds)
    || !isStringArray(value.selectedFlowIds)
    || !Array.isArray(value.records)
    || value.records.some((record) => !isValidSnapshotRecord(record))
  ) {
    throw new ValidationError('HTML requirement snapshot is invalid');
  }
  if (value.records.some((record) =>
    (record as Record<string, unknown>).projectId !== value.projectId
  )) {
    throw new ValidationError('HTML requirement snapshot record belongs to another project');
  }
  return value as unknown as HtmlRequirementSnapshot;
}

function parseStoredSnapshot(
  serialized: string,
  projectId: string,
  expectedHash: string,
): HtmlRequirementSnapshot {
  let snapshot: HtmlRequirementSnapshot;
  try {
    snapshot = parseSnapshot(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stored HTML requirement snapshot is invalid';
    throw new HtmlKnowledgeDataError(message.replace(/^HTML/u, 'Stored HTML'));
  }
  if (snapshot.projectId !== projectId) {
    throw new HtmlKnowledgeDataError('Stored HTML requirement snapshot belongs to another project');
  }
  let canonical: string;
  let hash: string;
  try {
    canonical = serializeHtmlRequirementSnapshot(snapshot);
    hash = hashHtmlRequirementSnapshot(snapshot);
  } catch {
    throw new HtmlKnowledgeDataError('Stored HTML requirement snapshot is invalid');
  }
  if (canonical !== serialized || hash !== expectedHash) {
    throw new HtmlKnowledgeDataError('Stored HTML requirement snapshot is not canonical or its hash is invalid');
  }
  return snapshot;
}

function parseBoundRequirementSnapshot(
  set: HtmlKnowledgeSetRow,
  projectId: string,
): HtmlRequirementSnapshot {
  assertSetIndexVersion(set);
  if (!set.requirement_snapshot || !set.requirement_snapshot_hash) {
    throw new HtmlKnowledgeDataError('Stored bound HTML knowledge snapshot is incomplete');
  }
  return parseStoredSnapshot(
    set.requirement_snapshot,
    projectId,
    set.requirement_snapshot_hash,
  );
}

function assertInternalSetIntegrity(set: HtmlKnowledgeSetRow, projectId: string): void {
  assertSetIndexVersion(set);
  if (set.status === 'BOUND') parseBoundRequirementSnapshot(set, projectId);
}

function isValidSnapshotRecord(value: unknown): boolean {
  return isRecord(value)
    && isString(value.id)
    && isString(value.projectId)
    && ['epic', 'story', 'ac'].includes(String(value.level))
    && (value.parentId === undefined || isString(value.parentId))
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && Number.isSafeInteger(value.position)
    && ['DRAFT', 'APPROVED', 'DEPRECATED'].includes(String(value.status))
    && (value.flowType === null || value.flowType === 'atomic' || value.flowType === 'flow')
    && typeof value.isFlow === 'boolean'
    && isStringArray(value.relatedRequirementIds);
}

function isValidChunk(value: unknown): boolean {
  return isRecord(value)
    && isString(value.id)
    && isString(value.pageId)
    && ['navigation', 'form', 'content', 'dialog', 'table', 'validation', 'interactive']
      .includes(String(value.sectionType))
    && (value.heading === undefined || typeof value.heading === 'string')
    && isString(value.domPath)
    && typeof value.staticText === 'string'
    && Array.isArray(value.elements)
    && value.elements.every(isValidElement)
    && isStringArray(value.searchTerms)
    && (value.sourceLocation === undefined || isValidSourceLocation(value.sourceLocation));
}

function isValidElement(value: unknown): value is HtmlKnowledgeElement {
  if (!isRecord(value)
    || !isString(value.tagName)
    || !isString(value.domPath)
    || !hasOptionalStrings(value, [
      'inputType',
      'label',
      'accessibleNameCandidate',
      'id',
      'name',
      'role',
      'dataTestId',
      'href',
      'action',
      'method',
      'min',
      'max',
      'step',
      'pattern',
      'validationText',
    ])
    || !hasOptionalBooleans(value, ['required', 'disabled', 'readOnly', 'multiple'])
    || !hasOptionalNonNegativeIntegers(value, ['minLength', 'maxLength'])
    || (value.ariaAttributes !== undefined && !isValidStringMap(value.ariaAttributes))
    || (value.options !== undefined && (
      !Array.isArray(value.options)
      || value.options.length > MAX_HTML_SELECT_OPTIONS
      || !value.options.every(isValidSelectOption)
    ))
    || (value.sourceLocation !== undefined && !isValidSourceLocation(value.sourceLocation))) {
    return false;
  }
  return true;
}

function isValidSelectOption(value: unknown): boolean {
  return isRecord(value)
    && typeof value.label === 'string'
    && (value.value === undefined || typeof value.value === 'string');
}

function isValidSourceLocation(value: unknown): boolean {
  return isRecord(value)
    && Number.isSafeInteger(value.startLine)
    && Number(value.startLine) > 0
    && Number.isSafeInteger(value.endLine)
    && Number(value.endLine) >= Number(value.startLine);
}

function isValidRelationCandidate(value: unknown): boolean {
  return isRecord(value)
    && (value.type === 'link' || value.type === 'form-action')
    && (value.label === undefined || typeof value.label === 'string')
    && isString(value.sourceDomPath)
    && isString(value.sourceTarget)
    && isValidRoute(value.target);
}

function isValidRoute(value: unknown): boolean {
  return isRecord(value)
    && isString(value.normalizedTarget)
    && (value.origin === null || isString(value.origin))
    && isString(value.path)
    && isStringArray(value.queryParameterNames)
    && isString(value.fullPathSha256)
    && (value.pathTruncated === undefined || value.pathTruncated === true);
}

function isValidIndexStats(value: unknown): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, item]) =>
      key.length > 0 && Number.isSafeInteger(item) && Number(item) >= 0
    );
}

function isValidStringMap(value: unknown): boolean {
  return isRecord(value)
    && Object.entries(value).every(([key, item]) =>
      key.startsWith('aria-') && typeof item === 'string'
    );
}

function hasOptionalStrings(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => value[field] === undefined || typeof value[field] === 'string');
}

function hasOptionalBooleans(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => value[field] === undefined || typeof value[field] === 'boolean');
}

function hasOptionalNonNegativeIntegers(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) =>
    value[field] === undefined
    || (Number.isSafeInteger(value[field]) && Number(value[field]) >= 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOptionalText(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareText(left, right);
}

function assertSetIndexVersion(set: HtmlKnowledgeSetRow): void {
  if (set.index_version !== HTML_KNOWLEDGE_INDEX_VERSION) {
    throw new HtmlKnowledgeDataError('Unsupported HTML knowledge set index version');
  }
}

function asValidationError(error: unknown): ValidationError {
  if (error instanceof HtmlKnowledgeValidationError) return new ValidationError(error.message);
  if (error instanceof Error) return new ValidationError(error.message);
  return new ValidationError('HTML knowledge input is invalid');
}

function setNotFound(): NotFoundError {
  return new NotFoundError('HTML knowledge set not found');
}

function pageNotFound(): NotFoundError {
  return new NotFoundError('HTML knowledge page not found');
}

function setNotUploading(): ConflictError {
  return new ConflictError('HTML knowledge set is not uploading');
}
