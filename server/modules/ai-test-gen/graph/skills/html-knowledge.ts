import { z } from 'zod';

import {
  HtmlKnowledgeDataError,
  type BoundHtmlKnowledgeData,
} from '../../html-knowledge/repository.ts';
import {
  HtmlKnowledgeValidationError,
  validateHtmlRequirementId,
} from '../../html-knowledge/normalization.ts';
import {
  hashHtmlRequirementSnapshot,
} from '../../html-knowledge/requirement-snapshot.ts';
import { queryHtmlKnowledge } from '../../html-knowledge/retrieval.ts';
import {
  DEFAULT_HTML_QUERY_RESULTS,
  HTML_KNOWLEDGE_INDEX_VERSION,
  MAX_HTML_CACHE_ENTRIES,
  MAX_HTML_QUERY_IDS,
  MAX_HTML_QUERY_RESULTS,
  MAX_HTML_REQUIREMENT_ID_CODE_POINTS,
  MAX_HTML_TOOL_CHARS,
  type HtmlKnowledgeQueryFocus,
  type HtmlKnowledgeQueryContext,
  type HtmlKnowledgeQueryResult,
  type HtmlKnowledgeReference,
  type HtmlRequirementSnapshot,
} from '../../html-knowledge/types.ts';
import type { BatchRequirement } from '../state.ts';
import type { SkillDefinition } from '../nodes/types.ts';

const HTML_QUERY_ERROR = JSON.stringify({
  error: 'INVALID_HTML_KNOWLEDGE_QUERY',
  message: 'Use 1-20 current-batch requirement IDs, focus all|interaction|validation|navigation|content, and maxResults 1-10.',
});

const requirementIdSchema = z.string()
  .trim()
  .min(1)
  .refine(
    (value) => Array.from(value).length <= MAX_HTML_REQUIREMENT_ID_CODE_POINTS,
    `Requirement IDs must contain at most ${MAX_HTML_REQUIREMENT_ID_CODE_POINTS} characters`,
  );

export const htmlKnowledgeQuerySchema = z.object({
  requirementIds: z.union([
    requirementIdSchema,
    z.array(requirementIdSchema).min(1).superRefine((ids, context) => {
      if (new Set(ids).size > MAX_HTML_QUERY_IDS) {
        context.addIssue({
          code: 'custom',
          message: `At most ${MAX_HTML_QUERY_IDS} unique requirement IDs are allowed`,
        });
      }
    }),
  ]),
  focus: z.enum(['all', 'interaction', 'validation', 'navigation', 'content']).optional(),
  maxResults: z.number().int().min(1).max(MAX_HTML_QUERY_RESULTS).optional(),
}).strict();

export interface HtmlKnowledgeBoundSetRepository {
  verifyBoundReference(
    runId: string,
    projectId: string,
    reference: HtmlKnowledgeReference,
  ): void;
  loadBoundSetByRun(
    projectId: string,
    runId: string,
    expectedSetId?: string,
  ): BoundHtmlKnowledgeData | undefined;
}

export interface HtmlKnowledgeQueryCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  getRetrievalContext(key: string): HtmlKnowledgeParsedRetrievalContext | undefined;
  setRetrievalContext(key: string, context: HtmlKnowledgeParsedRetrievalContext): void;
  clear(): void;
  dispose(): void;
}

export type HtmlKnowledgeRetrievalCache = HtmlKnowledgeQueryCache;

export type HtmlKnowledgeParsedRetrievalContext = Omit<
  HtmlKnowledgeQueryContext,
  'currentBatchRequirementIds'
>;

export class RunScopedHtmlKnowledgeQueryCache implements HtmlKnowledgeQueryCache {
  private readonly entries = new Map<string, string>();
  private retrievalContext: {
    readonly key: string;
    readonly value: HtmlKnowledgeParsedRetrievalContext;
  } | undefined;

  get size(): number {
    return this.entries.size;
  }

  get(key: string): string | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: string): void {
    if (!this.entries.has(key) && this.entries.size >= MAX_HTML_CACHE_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, value);
  }

  getRetrievalContext(key: string): HtmlKnowledgeParsedRetrievalContext | undefined {
    return this.retrievalContext?.key === key ? this.retrievalContext.value : undefined;
  }

  setRetrievalContext(key: string, context: HtmlKnowledgeParsedRetrievalContext): void {
    this.retrievalContext = { key, value: context };
  }

  clear(): void {
    this.entries.clear();
    this.retrievalContext = undefined;
  }

  dispose(): void {
    this.clear();
  }
}

export function createHtmlKnowledgeQueryCache(): RunScopedHtmlKnowledgeQueryCache {
  return new RunScopedHtmlKnowledgeQueryCache();
}

export interface ResolvedHtmlKnowledgeRuntime {
  readonly projectId: string;
  readonly reference: HtmlKnowledgeReference;
  readonly snapshot: HtmlRequirementSnapshot;
  readonly repository: HtmlKnowledgeBoundSetRepository;
  readonly cache: HtmlKnowledgeRetrievalCache;
  readonly dispose: () => void;
}

export interface MakeHtmlKnowledgeQueryOptions {
  readonly runId: string;
  readonly currentBatch: readonly BatchRequirement[];
  readonly runtime: ResolvedHtmlKnowledgeRuntime;
}

interface NormalizedHtmlKnowledgeInput {
  readonly requirementIds: readonly string[];
  readonly focus: HtmlKnowledgeQueryFocus;
  readonly maxResults: number;
}

interface LastCallMetadata {
  readonly inputKey: string;
  readonly cacheHit: boolean;
}

export class HtmlKnowledgeCriticalError extends Error {
  readonly code = 'HTML_KNOWLEDGE_CRITICAL_FAILURE';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HtmlKnowledgeCriticalError';
  }
}

export function requireMatchingHtmlKnowledgeRuntime(
  projectId: string,
  reference: HtmlKnowledgeReference | undefined,
  runtime: ResolvedHtmlKnowledgeRuntime | undefined,
): ResolvedHtmlKnowledgeRuntime | undefined {
  if (!reference && !runtime) return undefined;
  if (!reference
    || !runtime
    || runtime.projectId !== projectId
    || !sameReference(reference, runtime.reference)) {
    throw new HtmlKnowledgeCriticalError(
      'HTML knowledge runtime does not match the persisted graph reference',
    );
  }
  return runtime;
}

export function makeHtmlKnowledgeQuery(options: MakeHtmlKnowledgeQueryOptions): SkillDefinition {
  const { runId, runtime } = options;
  const reference = freezeReference(runtime.reference);
  const snapshot = freezeSnapshot(runtime.snapshot);
  const allowedRequirementIds = buildAllowedRequirementIds(snapshot, options.currentBatch);
  let lastCall: LastCallMetadata | undefined;

  return {
    name: 'html_knowledge_query',
    description: 'Retrieve bounded, run-scoped HTML implementation evidence for current-batch requirements. Batch related requirement IDs in one call.',
    schema: htmlKnowledgeQuerySchema,
    func: async (rawInput) => {
      const input = normalizeInput(rawInput);
      if (!input || input.requirementIds.some((id) => !allowedRequirementIds.has(id))) {
        lastCall = undefined;
        return HTML_QUERY_ERROR;
      }

      verifyBoundReference(runtime.repository, {
        runId,
        projectId: runtime.projectId,
        reference,
      });
      const contextKey = JSON.stringify({
        runId,
        projectId: runtime.projectId,
        knowledgeSetId: reference.knowledgeSetId,
        indexVersion: HTML_KNOWLEDGE_INDEX_VERSION,
        requirementSnapshotHash: reference.requirementSnapshotHash,
      });
      const cacheKey = JSON.stringify({
        knowledgeSetId: reference.knowledgeSetId,
        indexVersion: HTML_KNOWLEDGE_INDEX_VERSION,
        requirementSnapshotHash: reference.requirementSnapshotHash,
        requirementIds: input.requirementIds,
        focus: input.focus,
        maxResults: input.maxResults,
      });
      const cached = runtime.cache.get(cacheKey);
      if (cached !== undefined) {
        lastCall = { inputKey: normalizedInputKey(input), cacheHit: true };
        return cached;
      }

      let retrievalContext = runtime.cache.getRetrievalContext(contextKey);
      if (!retrievalContext) {
        const bound = loadAndVerifyBoundSet(runtime.repository, {
          runId,
          projectId: runtime.projectId,
          reference,
          snapshot,
        });
        retrievalContext = deepFreeze({
          projectId: runtime.projectId,
          knowledgeSetId: reference.knowledgeSetId,
          indexVersion: bound.set.index_version,
          requirementSnapshot: snapshot,
          pages: [...bound.pages],
          relations: [...bound.relations],
        });
        runtime.cache.setRetrievalContext(contextKey, retrievalContext);
      }

      let result: string;
      try {
        result = queryHtmlKnowledge({
          ...retrievalContext,
          currentBatchRequirementIds: [...allowedRequirementIds],
        }, input);
      } catch (error) {
        throw new HtmlKnowledgeCriticalError(
          'Bound HTML knowledge retrieval failed integrity validation',
          { cause: error },
        );
      }
      if (result.length > MAX_HTML_TOOL_CHARS) {
        throw new HtmlKnowledgeCriticalError('Bound HTML knowledge retrieval exceeded its result limit');
      }
      runtime.cache.set(cacheKey, result);
      lastCall = { inputKey: normalizedInputKey(input), cacheHit: false };
      return result;
    },
    summarizeForState: (rawInput, result, meta) => {
      const input = normalizeInput(rawInput) ?? {
        requirementIds: [],
        focus: 'all' as const,
        maxResults: DEFAULT_HTML_QUERY_RESULTS,
      };
      const parsedResult = parseQueryResult(result);
      const cacheHit = lastCall?.inputKey === normalizedInputKey(input)
        ? lastCall.cacheHit
        : false;
      return {
        input,
        output: {
          resultChars: meta.resultSize,
          confidence: parsedResult.matches.map((match) => ({
            requestedRequirementId: match.requestedRequirementId,
            canonicalRequirementId: match.canonicalRequirementId,
            confidence: match.confidence,
          })),
          pageIds: uniqueSorted(parsedResult.chunks.map((chunk) => chunk.pageId)),
          chunkIds: uniqueSorted(parsedResult.chunks.map((chunk) => chunk.chunkId)),
          omittedRequirementIds: uniqueSorted(parsedResult.omittedRequirementIds),
          truncated: parsedResult.truncated,
          cacheHit,
        },
      };
    },
  };
}

function verifyBoundReference(
  repository: HtmlKnowledgeBoundSetRepository,
  expected: {
    readonly runId: string;
    readonly projectId: string;
    readonly reference: HtmlKnowledgeReference;
  },
): void {
  try {
    repository.verifyBoundReference(expected.runId, expected.projectId, expected.reference);
  } catch (error) {
    throw new HtmlKnowledgeCriticalError('Bound HTML knowledge set is unavailable or mismatched', {
      cause: error,
    });
  }
}

function normalizeInput(rawInput: unknown): NormalizedHtmlKnowledgeInput | undefined {
  const parsed = htmlKnowledgeQuerySchema.safeParse(rawInput);
  if (!parsed.success) return undefined;
  const rawIds = typeof parsed.data.requirementIds === 'string'
    ? [parsed.data.requirementIds]
    : parsed.data.requirementIds;
  try {
    const requirementIds = uniqueSorted(rawIds.map((id) => validateHtmlRequirementId(id, 'Query requirement')));
    if (requirementIds.length === 0 || requirementIds.length > MAX_HTML_QUERY_IDS) return undefined;
    return {
      requirementIds,
      focus: parsed.data.focus ?? 'all',
      maxResults: parsed.data.maxResults ?? DEFAULT_HTML_QUERY_RESULTS,
    };
  } catch (error) {
    if (error instanceof HtmlKnowledgeValidationError) return undefined;
    throw error;
  }
}

function buildAllowedRequirementIds(
  snapshot: HtmlRequirementSnapshot,
  currentBatch: readonly BatchRequirement[],
): ReadonlySet<string> {
  const recordsById = new Map(snapshot.records.map((record) => [record.id, record]));
  const allowed = new Set<string>();
  const addRecord = (id: string): void => {
    const record = recordsById.get(id);
    if (!record || (record.level !== 'story' && record.level !== 'ac')) {
      throw new HtmlKnowledgeCriticalError('HTML knowledge batch does not match its immutable requirement snapshot');
    }
    allowed.add(record.id);
  };

  for (const requirement of currentBatch) {
    addRecord(requirement.id);
    for (const acceptanceCriterion of requirement.acceptanceCriteria ?? []) {
      const record = recordsById.get(acceptanceCriterion.id);
      if (record?.level !== 'ac' || record.parentId !== requirement.id) {
        throw new HtmlKnowledgeCriticalError('HTML knowledge batch does not match its immutable requirement snapshot');
      }
      allowed.add(record.id);
    }
  }
  return allowed;
}

function loadAndVerifyBoundSet(
  repository: HtmlKnowledgeBoundSetRepository,
  expected: {
    readonly runId: string;
    readonly projectId: string;
    readonly reference: HtmlKnowledgeReference;
    readonly snapshot: HtmlRequirementSnapshot;
  },
): BoundHtmlKnowledgeData {
  let bound: BoundHtmlKnowledgeData | undefined;
  try {
    bound = repository.loadBoundSetByRun(
      expected.projectId,
      expected.runId,
      expected.reference.knowledgeSetId,
    );
  } catch (error) {
    throw new HtmlKnowledgeCriticalError('Bound HTML knowledge set is corrupt or unreadable', {
      cause: error,
    });
  }
  if (!bound) {
    throw new HtmlKnowledgeCriticalError('Bound HTML knowledge set is unavailable');
  }

  try {
    const set = bound.set;
    const pageTitles = bound.pages.map((page) => page.pageTitle);
    const hasLowInformationPages = bound.pages.some(
      (page) => page.informationLevel === 'LOW_INFORMATION',
    );
    const runtimeSnapshotHash = hashHtmlRequirementSnapshot(expected.snapshot);
    const storedSnapshotHash = hashHtmlRequirementSnapshot(bound.requirementSnapshot);
    const mismatch = set.id !== expected.reference.knowledgeSetId
      || set.project_id !== expected.projectId
      || set.run_id !== expected.runId
      || set.status !== 'BOUND'
      || set.index_version !== HTML_KNOWLEDGE_INDEX_VERSION
      || set.requirement_snapshot_hash !== expected.reference.requirementSnapshotHash
      || runtimeSnapshotHash !== expected.reference.requirementSnapshotHash
      || storedSnapshotHash !== expected.reference.requirementSnapshotHash
      || set.page_count !== expected.reference.pageCount
      || bound.pages.length !== expected.reference.pageCount
      || set.total_bytes !== expected.reference.totalBytes
      || hasLowInformationPages !== expected.reference.hasLowInformationPages
      || !sameStrings(pageTitles, expected.reference.pageTitles)
      || bound.pages.some((page) => page.version !== set.index_version);
    if (mismatch) {
      throw new HtmlKnowledgeDataError('Bound set metadata does not match its reference');
    }
  } catch (error) {
    throw new HtmlKnowledgeCriticalError('Bound HTML knowledge set does not match its run reference', {
      cause: error,
    });
  }
  return bound;
}

function parseQueryResult(result: unknown): Pick<
  HtmlKnowledgeQueryResult,
  'matches' | 'chunks' | 'omittedRequirementIds' | 'truncated'
> {
  if (typeof result !== 'string') return emptyQueryResult();
  try {
    const parsed = JSON.parse(result) as Partial<HtmlKnowledgeQueryResult>;
    if (!Array.isArray(parsed.matches)
      || !Array.isArray(parsed.chunks)
      || !Array.isArray(parsed.omittedRequirementIds)
      || typeof parsed.truncated !== 'boolean') {
      return emptyQueryResult();
    }
    return {
      matches: parsed.matches,
      chunks: parsed.chunks,
      omittedRequirementIds: parsed.omittedRequirementIds,
      truncated: parsed.truncated,
    };
  } catch {
    return emptyQueryResult();
  }
}

function emptyQueryResult(): Pick<
  HtmlKnowledgeQueryResult,
  'matches' | 'chunks' | 'omittedRequirementIds' | 'truncated'
> {
  return { matches: [], chunks: [], omittedRequirementIds: [], truncated: false };
}

function freezeReference(reference: HtmlKnowledgeReference): HtmlKnowledgeReference {
  return Object.freeze({
    ...reference,
    pageTitles: Object.freeze([...reference.pageTitles]),
  });
}

function freezeSnapshot(snapshot: HtmlRequirementSnapshot): HtmlRequirementSnapshot {
  return Object.freeze({
    ...snapshot,
    selectedRequirementIds: Object.freeze([...snapshot.selectedRequirementIds]),
    selectedFlowIds: Object.freeze([...snapshot.selectedFlowIds]),
    records: Object.freeze(snapshot.records.map((record) => Object.freeze({
      ...record,
      relatedRequirementIds: Object.freeze([...record.relatedRequirementIds]),
    }))),
  });
}

function normalizedInputKey(input: NormalizedHtmlKnowledgeInput): string {
  return JSON.stringify(input);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameReference(
  left: HtmlKnowledgeReference,
  right: HtmlKnowledgeReference,
): boolean {
  return left.knowledgeSetId === right.knowledgeSetId
    && left.pageCount === right.pageCount
    && left.totalBytes === right.totalBytes
    && left.hasLowInformationPages === right.hasLowInformationPages
    && left.requirementSnapshotHash === right.requirementSnapshotHash
    && sameStrings(left.pageTitles, right.pageTitles);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
