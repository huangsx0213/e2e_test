import { createHash } from 'node:crypto';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/http/errors.ts';
import { Log } from '../../../shared/services/logger.ts';
import type { StartParams } from '../context.ts';
import { pipelineRepo } from '../repository.ts';
import { requirementRepo } from '../../requirements/repository.ts';
import {
  HtmlKnowledgeLimitError,
  HtmlKnowledgeValidationError,
  normalizeHtmlFileName,
} from './normalization.ts';
import { buildHtmlPageRelations } from './page-relations.ts';
import { decodeAndNormalizeHtml, parseAndIndexHtml } from './parser.ts';
import {
  HtmlKnowledgeDuplicateContentError,
  HtmlKnowledgeRepository,
  type HtmlKnowledgeOperationalLogger,
  type HtmlPageGraphBuilder,
} from './repository.ts';
import { buildHtmlRequirementSnapshot } from './requirement-snapshot.ts';
import {
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_PAGES,
  MAX_HTML_SET_BYTES,
  MIN_HTML_PAGES,
  type HtmlKnowledgeManifest,
  type HtmlKnowledgeManifestPage,
  type HtmlKnowledgePageDto,
  type HtmlKnowledgeRunBindingResult,
  type HtmlKnowledgeSetDto,
} from './types.ts';

interface HtmlKnowledgeRunRepository {
  createRun(runId: string, projectId: string, mode: string, config: unknown): void;
}

interface HtmlKnowledgeRequirementSource {
  listByProject(projectId: string): Requirement[];
}

type HtmlKnowledgeStartParams = StartParams & { name?: string };

export class HtmlKnowledgeService {
  constructor(
    private readonly repository = new HtmlKnowledgeRepository(),
    private readonly buildPageGraph: HtmlPageGraphBuilder = buildHtmlPageRelations,
    private readonly runRepository: HtmlKnowledgeRunRepository = pipelineRepo,
    private readonly requirementSource: HtmlKnowledgeRequirementSource = requirementRepo,
    private readonly logger: HtmlKnowledgeOperationalLogger = Log.for('html-knowledge'),
  ) {}

  createSet(projectId: string, manifest: HtmlKnowledgeManifest): HtmlKnowledgeSetDto {
    const pages = validateManifest(manifest);
    const created = this.repository.createSet(projectId, pages);
    this.logger.info(
      `set-created setId=${created.knowledgeSetId} projectId=${projectId} pageCount=${created.pageCount} totalBytes=${created.totalBytes}`,
    );
    return created;
  }

  getSet(projectId: string, setId: string): HtmlKnowledgeSetDto {
    const set = this.repository.getSafeSet(projectId, setId);
    if (!set) throw new NotFoundError('HTML knowledge set not found');
    return set;
  }

  assertPageUploadAllowed(projectId: string, setId: string, pageId: string): void {
    const preflight = this.repository.getPageUploadPreflight(projectId, setId, pageId);
    if (!preflight) throw new NotFoundError('HTML knowledge page not found');
    if (preflight.setStatus !== 'UPLOADING') {
      throw new ConflictError('HTML knowledge set is not uploading');
    }
  }

  failPreflightedPageUpload(
    projectId: string,
    setId: string,
    pageId: string,
    error: Error,
  ): never {
    return this.failUpload(projectId, setId, pageId, error);
  }

  uploadPage(
    projectId: string,
    setId: string,
    pageId: string,
    rawBytes: Uint8Array,
  ): HtmlKnowledgePageDto {
    const set = this.repository.getSetRow(projectId, setId);
    if (!set) throw new NotFoundError('HTML knowledge set not found');
    const page = this.repository.getPageRow(projectId, setId, pageId);
    if (!page) throw new NotFoundError('HTML knowledge page not found');
    if (set.status !== 'UPLOADING') {
      throw new ConflictError('HTML knowledge set is not uploading');
    }
    if (!(rawBytes instanceof Uint8Array)) {
      return this.failUpload(
        projectId,
        setId,
        pageId,
        new ValidationError('HTML page upload body must contain raw bytes'),
      );
    }
    if (rawBytes.byteLength !== page.expected_byte_size) {
      const error = page.status === 'READY'
        ? new ConflictError('READY HTML knowledge page contains different content')
        : new ValidationError('HTML page does not match its manifest byte size');
      if (page.status === 'READY') {
        this.repository.touchUploadActivity(projectId, setId);
        throw error;
      }
      return this.failUpload(projectId, setId, pageId, error);
    }

    if (page.status === 'READY') {
      const rawSha256 = createHash('sha256').update(rawBytes).digest('hex');
      this.repository.touchUploadActivity(projectId, setId);
      if (page.sha256 === rawSha256) {
        const safePage = this.repository.getSafePage(projectId, setId, pageId);
        if (!safePage) throw new NotFoundError('HTML knowledge page not found');
        return safePage;
      }
      throw new ConflictError('READY HTML knowledge page contains different content');
    }

    const parseIndexStartedAt = Date.now();
    let source: ReturnType<typeof decodeAndNormalizeHtml>;
    try {
      source = decodeAndNormalizeHtml(rawBytes);
    } catch (error) {
      const validationError = toUploadValidationError(error);
      if (!validationError) throw error;
      return this.failUpload(projectId, setId, pageId, validationError);
    }

    let indexed: ReturnType<typeof parseAndIndexHtml>;
    try {
      indexed = parseAndIndexHtml({
        pageId,
        fileName: page.file_name,
        source,
      });
    } catch (error) {
      const validationError = toUploadValidationError(error);
      if (!validationError) throw error;
      return this.failUpload(projectId, setId, pageId, validationError);
    }
    const parseIndexDurationMs = elapsedMs(parseIndexStartedAt);

    try {
      const stored = this.repository.storePageReady(projectId, setId, pageId, {
        sha256: source.sha256,
        byteSize: source.byteSize,
        normalizedHtml: source.normalizedHtml,
        pageTitle: indexed.pageTitle,
        knowledgeIndex: indexed.serializedIndex,
        informationLevel: indexed.informationLevel,
        warnings: indexed.warnings,
      });
      this.logger.info(
        `page-indexed setId=${setId} projectId=${projectId} pageId=${pageId} `
        + `fileName=${JSON.stringify(page.file_name)} byteSize=${source.byteSize} `
        + `parseIndexDurationMs=${parseIndexDurationMs} `
        + `chunkCount=${indexed.index.chunks.length} informationLevel=${indexed.informationLevel} `
        + `warningCount=${indexed.warnings.length}`,
      );
      return stored;
    } catch (error) {
      if (error instanceof HtmlKnowledgeDuplicateContentError) {
        return this.failUpload(projectId, setId, pageId, error);
      }
      throw error;
    }
  }

  removePage(projectId: string, setId: string, pageId: string): HtmlKnowledgeSetDto {
    return this.repository.removePage(projectId, setId, pageId);
  }

  finalizeSet(projectId: string, setId: string): HtmlKnowledgeSetDto {
    const set = this.getSet(projectId, setId);
    if (set.status === 'READY') return set;
    if (set.status !== 'UPLOADING') {
      throw new ConflictError('HTML knowledge set cannot be finalized from its current state');
    }

    const startedAt = Date.now();
    let relationCount: number | undefined;
    try {
      const finalized = this.repository.finalizeSet(
        projectId,
        setId,
        (pages) => {
          const graph = this.buildPageGraph(pages);
          relationCount = graph.relations.length;
          return graph;
        },
      );
      if (relationCount !== undefined) {
        const warningCount = finalized.pages.reduce(
          (total, page) => total + page.warnings.length,
          0,
        );
        this.logger.info(
          `set-finalized setId=${setId} projectId=${projectId} pageCount=${finalized.pageCount} `
          + `relationCount=${relationCount} warningCount=${warningCount} durationMs=${elapsedMs(startedAt)}`,
        );
      }
      return finalized;
    } catch (error) {
      if (error instanceof HtmlKnowledgeLimitError) {
        throw new ConflictError(error.message);
      }
      if (error instanceof HtmlKnowledgeValidationError) {
        throw new ValidationError(error.message);
      }
      throw error;
    }
  }

  deleteUnboundSet(projectId: string, setId: string): void {
    this.repository.deleteUnboundSet(projectId, setId);
  }

  deleteUnboundSetsByProject(projectId: string): number {
    return this.repository.deleteUnboundSetsByProject(projectId);
  }

  cleanupAbandonedSets(now = new Date()): number {
    return this.repository.cleanupAbandonedSets(now);
  }

  createOrReuseRun(
    projectId: string,
    setId: string,
    candidateRunId: string,
    params: HtmlKnowledgeStartParams,
  ): HtmlKnowledgeRunBindingResult {
    if (params.htmlKnowledgeSetId !== setId) {
      throw new ValidationError('HTML knowledge set ID does not match the start request');
    }
    const config = persistedStartConfig(params, setId);
    try {
      return this.repository.createOrReuseRun({
        projectId,
        setId,
        candidateRunId,
        buildRequirementSnapshot: () => buildHtmlRequirementSnapshot({
          projectId,
          selectedRequirementIds: params.requirementIds,
          selectedFlowIds: params.flowIds ?? [],
          requirements: this.requirementSource.listByProject(projectId),
        }),
        createRun: (runId) => {
          this.runRepository.createRun(runId, projectId, params.mode, config);
        },
      });
    } catch (error) {
      if (error instanceof HtmlKnowledgeValidationError) {
        throw new ValidationError(error.message);
      }
      throw error;
    }
  }

  private failUpload(
    projectId: string,
    setId: string,
    pageId: string,
    error: Error,
  ): never {
    this.repository.markPageFailed(projectId, setId, pageId, error.message);
    throw error;
  }
}

function persistedStartConfig(
  params: HtmlKnowledgeStartParams,
  htmlKnowledgeSetId: string,
): Record<string, unknown> {
  return {
    requirementIds: [...params.requirementIds],
    ...(params.providerConfigName !== undefined
      ? { providerConfigName: params.providerConfigName }
      : {}),
    ...(params.model !== undefined ? { model: params.model } : {}),
    mode: params.mode,
    ...(params.flowIds !== undefined ? { flowIds: [...params.flowIds] } : {}),
    ...(params.name !== undefined ? { name: params.name } : {}),
    ...(params.useCache !== undefined ? { useCache: params.useCache } : {}),
    ...(params.reasoningEffort !== undefined
      ? { reasoningEffort: params.reasoningEffort }
      : {}),
    ...(params.reasoningSummary !== undefined
      ? { reasoningSummary: params.reasoningSummary }
      : {}),
    ...(params.textVerbosity !== undefined
      ? { textVerbosity: params.textVerbosity }
      : {}),
    ...(params.referenceRunIds !== undefined
      ? { referenceRunIds: [...params.referenceRunIds] }
      : {}),
    htmlKnowledgeSetId,
  };
}

function validateManifest(manifest: HtmlKnowledgeManifest): HtmlKnowledgeManifestPage[] {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.pages)) {
    throw new ValidationError('HTML knowledge manifest pages are required');
  }
  if (manifest.pages.length < MIN_HTML_PAGES || manifest.pages.length > MAX_HTML_PAGES) {
    throw new ValidationError('HTML knowledge manifest must contain between 1 and 20 pages');
  }

  const pages: HtmlKnowledgeManifestPage[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const page of manifest.pages) {
    if (!page || typeof page !== 'object') {
      throw new ValidationError('Each HTML knowledge manifest page must be an object');
    }
    let fileName: ReturnType<typeof normalizeHtmlFileName>;
    try {
      fileName = normalizeHtmlFileName(page.fileName);
    } catch (error) {
      throw toValidationError(error);
    }
    if (names.has(fileName.key)) {
      throw new ConflictError('Duplicate HTML file name in knowledge manifest');
    }
    names.add(fileName.key);

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
    pages.push({ fileName: fileName.displayName, byteSize: page.byteSize });
  }
  return pages;
}

function toValidationError(error: unknown): ValidationError {
  if (error instanceof Error) return new ValidationError(error.message);
  return new ValidationError('HTML knowledge input is invalid');
}

function toUploadValidationError(error: unknown): ValidationError | undefined {
  return error instanceof HtmlKnowledgeValidationError
    ? new ValidationError(error.message)
    : undefined;
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
