import {
  HtmlKnowledgeLimitError,
  HtmlKnowledgeValidationError,
  normalizeStaticText,
  sanitizeHtmlRoute,
  tokenizeHtmlKnowledge,
  validateHtmlRequirementId,
} from './normalization.ts';
import {
  DEFAULT_HTML_QUERY_RESULTS,
  HTML_KNOWLEDGE_INDEX_VERSION,
  HTML_RETRIEVAL_WEIGHTS,
  MAX_HTML_QUERY_IDS,
  MAX_HTML_QUERY_RESULTS,
  MAX_HTML_QUERY_TERMS,
  MAX_HTML_QUERY_TEXT_CHARS,
  MAX_HTML_TOOL_CHARS,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  type HtmlKnowledgeElement,
  type HtmlKnowledgeMatchConfidence,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgeQueryChunk,
  type HtmlKnowledgeQueryContext,
  type HtmlKnowledgeQueryFocus,
  type HtmlKnowledgeQueryInput,
  type HtmlKnowledgeQueryResult,
  type HtmlKnowledgeSourceLocation,
  type HtmlPageRelation,
  type HtmlRequirementSnapshotRecord,
  type SanitizedHtmlRoute,
} from './types.ts';

interface NormalizedQuery {
  readonly requirementIds: readonly string[];
  readonly focus: HtmlKnowledgeQueryFocus;
  readonly maxResults: number;
}

interface QueryTerm {
  readonly value: string;
  readonly quoted: boolean;
  readonly scoreKey: string;
}

interface QueryTermBuildResult {
  readonly terms: readonly QueryTerm[];
  readonly truncated: boolean;
}

interface IndexedChunkReference {
  readonly page: HtmlKnowledgePageIndex;
  readonly chunk: HtmlKnowledgePageIndex['chunks'][number];
  readonly routeTargets: readonly SanitizedHtmlRoute[];
}

interface ChunkEvidenceTerms {
  readonly identityTerms: ReadonlySet<string>;
  readonly primaryTerms: ReadonlySet<string>;
  readonly secondaryTerms: ReadonlySet<string>;
  readonly bodyTerms: ReadonlySet<string>;
  readonly exactLabels: ReadonlySet<string>;
}

interface QueryGroupSeed {
  readonly key: string;
  readonly canonical: HtmlRequirementSnapshotRecord;
  readonly requestedAcceptanceCriteria: HtmlRequirementSnapshotRecord[];
}

interface QueryGroupDefinition extends QueryGroupSeed {
  readonly queryTerms: readonly QueryTerm[];
  readonly queryTruncated: boolean;
}

interface RequestedRequirement {
  readonly requested: HtmlRequirementSnapshotRecord;
  readonly canonical: HtmlRequirementSnapshotRecord;
  readonly groupKey: string;
}

interface RankedQueryGroup {
  readonly key: string;
  readonly canonical: HtmlRequirementSnapshotRecord;
  readonly queryTerms: readonly QueryTerm[];
  readonly scores: Int32Array;
  readonly rankedChunkIndexes: readonly number[];
  readonly matchedTermsByChunkIndex: Map<number, readonly string[]>;
  readonly confidence: HtmlKnowledgeMatchConfidence;
  readonly queryTruncated: boolean;
}

interface ResolvedRequirement {
  readonly requested: HtmlRequirementSnapshotRecord;
  readonly canonical: HtmlRequirementSnapshotRecord;
  readonly ranking: RankedQueryGroup;
}

interface MutableQueryMatch {
  requestedRequirementId: string;
  canonicalRequirementId: string;
  confidence: HtmlKnowledgeMatchConfidence;
  chunkIds: string[];
}

interface MutableQueryResult {
  source: {
    knowledgeSetId: string;
    pageCount: number;
    indexVersion: number;
  };
  matches: MutableQueryMatch[];
  chunks: HtmlKnowledgeQueryChunk[];
  omittedRequirementIds: string[];
  truncated: boolean;
  warnings: string[];
}

const FOCUS_TERMS: Readonly<Record<HtmlKnowledgeQueryFocus, readonly string[]>> = {
  all: [],
  interaction: ['button', 'checkbox', 'control', 'field', 'form', 'input', 'interaction', 'link', 'select', 'submit', 'textarea'],
  validation: ['error', 'invalid', 'maximum', 'minimum', 'pattern', 'required', 'validation'],
  navigation: ['action', 'href', 'link', 'navigation', 'route'],
  content: ['content', 'heading', 'text'],
};

const QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'given',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'then',
  'this',
  'to',
  'user',
  'when',
  'with',
]);

const FOCUS_VALUES = new Set<HtmlKnowledgeQueryFocus>([
  'all',
  'interaction',
  'validation',
  'navigation',
  'content',
]);

const FIELD_LIKE_TERM = /[\p{L}\p{N}]+(?:[-_.:/][\p{L}\p{N}?=&%]+)+/gu;
const QUOTED_TERM = /["“]([^"”]+)["”]|'([^']+)'/gu;
const MAX_PAGE_OUTLINE_FIELD_CHARS = 48;
const ROUTE_IDENTITY_PREFIX = 'route-sha256:';

export function queryHtmlKnowledge(
  context: HtmlKnowledgeQueryContext,
  query: HtmlKnowledgeQueryInput,
): string {
  const normalizedQuery = normalizeQuery(query);
  if (context.indexVersion !== HTML_KNOWLEDGE_INDEX_VERSION) {
    throw new HtmlKnowledgeValidationError(
      `HTML knowledge index version must be ${HTML_KNOWLEDGE_INDEX_VERSION}`,
    );
  }
  const snapshot = context.requirementSnapshot;
  if (snapshot.version !== 1) {
    throw new HtmlKnowledgeValidationError(`Unsupported HTML requirement snapshot version: ${snapshot.version}`);
  }
  if (snapshot.projectId !== context.projectId) {
    throw new HtmlKnowledgeValidationError('HTML requirement snapshot belongs to a different project');
  }

  const recordsById = new Map<string, HtmlRequirementSnapshotRecord>();
  const childrenByParent = new Map<string, HtmlRequirementSnapshotRecord[]>();
  for (const record of snapshot.records) {
    validateHtmlRequirementId(record.id, 'Snapshot requirement');
    if (record.parentId) validateHtmlRequirementId(record.parentId, 'Snapshot parent requirement');
    for (const relatedId of record.relatedRequirementIds) {
      validateHtmlRequirementId(relatedId, 'Snapshot related requirement');
    }
    if (record.projectId !== context.projectId) {
      throw new HtmlKnowledgeValidationError(`Requirement ${record.id} belongs to a different project`);
    }
    if (recordsById.has(record.id)) {
      throw new HtmlKnowledgeValidationError(`Duplicate requirement ID in HTML snapshot: ${record.id}`);
    }
    recordsById.set(record.id, record);
    if (record.parentId) {
      const children = childrenByParent.get(record.parentId) ?? [];
      children.push(record);
      childrenByParent.set(record.parentId, children);
    }
  }
  for (const children of childrenByParent.values()) {
    children.sort(compareSnapshotRecords);
  }

  const batchIds = canonicalIds(context.currentBatchRequirementIds, 'current batch requirement');
  const allowedIds = new Set<string>();
  for (const id of batchIds) {
    const record = recordsById.get(id);
    if (!record) {
      throw new HtmlKnowledgeValidationError(`Current batch references unknown snapshot requirement: ${id}`);
    }
    if (record.level === 'story') {
      allowedIds.add(record.id);
      for (const child of childrenByParent.get(record.id) ?? []) {
        if (child.level === 'ac') allowedIds.add(child.id);
      }
    } else if (record.level === 'ac') {
      allowedIds.add(record.id);
    }
  }

  const requestedRequirements: RequestedRequirement[] = [];
  const groupSeedsByKey = new Map<string, QueryGroupSeed>();
  for (const requestedId of normalizedQuery.requirementIds) {
    const requested = recordsById.get(requestedId);
    if (!requested) {
      throw new HtmlKnowledgeValidationError(`Unknown requirement ID in HTML snapshot: ${requestedId}`);
    }
    if (requested.level === 'epic') {
      throw new HtmlKnowledgeValidationError(`Epic requirement IDs cannot be queried: ${requestedId}`);
    }
    if (!allowedIds.has(requestedId)) {
      throw new HtmlKnowledgeValidationError(`Requirement is outside the current batch: ${requestedId}`);
    }

    const canonical = requested.level === 'ac'
      ? resolveParentStory(requested, recordsById)
      : requested;
    const groupKey = `${canonical.id}\0${normalizedQuery.focus}`;
    let group = groupSeedsByKey.get(groupKey);
    if (!group) {
      group = { key: groupKey, canonical, requestedAcceptanceCriteria: [] };
      groupSeedsByKey.set(groupKey, group);
    }
    if (requested.level === 'ac') group.requestedAcceptanceCriteria.push(requested);
    requestedRequirements.push({
      requested,
      canonical,
      groupKey,
    });
  }

  const groupDefinitions = [...groupSeedsByKey.values()]
    .sort((left, right) => compareText(left.key, right.key))
    .map((group) => {
      const queryTerms = buildQueryTerms(
        group.canonical,
        childrenByParent.get(group.canonical.id) ?? [],
        group.requestedAcceptanceCriteria,
        normalizedQuery.focus,
      );
      return { ...group, queryTerms: queryTerms.terms, queryTruncated: queryTerms.truncated };
    });
  const sortedPages = [...context.pages].sort(comparePages);
  const indexedChunks = flattenChunks(sortedPages, context.indexVersion);
  const sortedRelations = canonicalRelations(context.relations);
  const relatedPageIds = buildRelatedPageIds(sortedRelations);
  const rankedGroups = rankQueryGroups(groupDefinitions, indexedChunks, relatedPageIds);
  const rankedGroupsByKey = new Map(rankedGroups.map((group) => [group.key, group]));
  const resolvedRequirements: ResolvedRequirement[] = requestedRequirements.map((requirement) => ({
    requested: requirement.requested,
    canonical: requirement.canonical,
    ranking: rankedGroupsByKey.get(requirement.groupKey)!,
  }));

  const result: MutableQueryResult = {
    source: {
      knowledgeSetId: context.knowledgeSetId,
      pageCount: sortedPages.length,
      indexVersion: context.indexVersion,
    },
    matches: [],
    chunks: [],
    omittedRequirementIds: [...normalizedQuery.requirementIds],
    truncated: false,
    warnings: [],
  };
  assertBaseFits(result);

  const required = requiredWarnings(resolvedRequirements, sortedPages);
  if (required.truncated) result.truncated = true;
  for (const warning of required.values) {
    tryAddWarning(result, warning);
  }

  const matchesByRequirementId = new Map<string, MutableQueryMatch>();
  for (const resolved of resolvedRequirements) {
    const match: MutableQueryMatch = {
      requestedRequirementId: resolved.requested.id,
      canonicalRequirementId: resolved.canonical.id,
      confidence: resolved.ranking.confidence,
      chunkIds: [],
    };
    const omittedIndex = result.omittedRequirementIds.indexOf(resolved.requested.id);
    result.omittedRequirementIds.splice(omittedIndex, 1);
    result.matches.push(match);
    if (fits(result)) {
      matchesByRequirementId.set(resolved.requested.id, match);
      continue;
    }
    result.matches.pop();
    result.omittedRequirementIds.splice(omittedIndex, 0, resolved.requested.id);
    result.truncated = true;
  }

  const chunksById = new Map<string, number>();
  const blockedRequirementIds = new Set<string>();
  for (let rank = 0; rank < normalizedQuery.maxResults; rank += 1) {
    for (const resolved of resolvedRequirements) {
      const requestedId = resolved.requested.id;
      const match = matchesByRequirementId.get(requestedId);
      const chunkIndex = resolved.ranking.rankedChunkIndexes[rank];
      if (!match || chunkIndex === undefined || blockedRequirementIds.has(requestedId)) continue;

      if (!tryAddCandidate(
        result,
        match,
        chunkIndex,
        resolved.ranking,
        indexedChunks,
        sortedRelations,
        chunksById,
      )) {
        result.truncated = true;
        blockedRequirementIds.add(requestedId);
      }
    }
  }

  for (const resolved of resolvedRequirements) {
    if (resolved.ranking.rankedChunkIndexes.length > normalizedQuery.maxResults) result.truncated = true;
  }

  const optionalWarnings = optionalPageWarnings(sortedPages);
  if (optionalWarnings.truncated) result.truncated = true;
  for (const warning of optionalWarnings.values) {
    tryAddWarning(result, warning);
  }

  result.omittedRequirementIds.sort(compareText);
  const serialized = JSON.stringify(result satisfies HtmlKnowledgeQueryResult);
  if (serialized.length > MAX_HTML_TOOL_CHARS) {
    throw new HtmlKnowledgeLimitError('HTML knowledge result metadata exceeds 6,000 characters');
  }
  return serialized;
}

function normalizeQuery(query: HtmlKnowledgeQueryInput): NormalizedQuery {
  if (!query || typeof query !== 'object') {
    throw new HtmlKnowledgeValidationError('HTML knowledge query is required');
  }
  const rawIds = typeof query.requirementIds === 'string'
    ? [query.requirementIds]
    : query.requirementIds;
  if (!Array.isArray(rawIds)) {
    throw new HtmlKnowledgeValidationError('requirementIds must be a string or array of strings');
  }

  const requirementIds = canonicalIds(rawIds, 'query requirement');
  if (requirementIds.length === 0) {
    throw new HtmlKnowledgeValidationError('HTML knowledge query requires at least 1 requirement ID');
  }
  if (requirementIds.length > MAX_HTML_QUERY_IDS) {
    throw new HtmlKnowledgeValidationError('HTML knowledge query accepts at most 20 unique requirement IDs');
  }

  const focus = query.focus ?? 'all';
  if (!FOCUS_VALUES.has(focus)) {
    throw new HtmlKnowledgeValidationError('HTML knowledge query focus is invalid');
  }
  const maxResults = query.maxResults ?? DEFAULT_HTML_QUERY_RESULTS;
  if (!Number.isInteger(maxResults)) {
    throw new HtmlKnowledgeValidationError('HTML knowledge query maxResults must be an integer');
  }
  if (maxResults < 1 || maxResults > MAX_HTML_QUERY_RESULTS) {
    throw new HtmlKnowledgeValidationError('HTML knowledge query maxResults must be between 1 and 10');
  }

  return { requirementIds, focus, maxResults };
}

function resolveParentStory(
  acceptanceCriterion: HtmlRequirementSnapshotRecord,
  recordsById: ReadonlyMap<string, HtmlRequirementSnapshotRecord>,
): HtmlRequirementSnapshotRecord {
  const parent = acceptanceCriterion.parentId
    ? recordsById.get(acceptanceCriterion.parentId)
    : undefined;
  if (!parent || parent.level !== 'story') {
    throw new HtmlKnowledgeValidationError(
      `Acceptance criterion ${acceptanceCriterion.id} has no snapshotted parent story`,
    );
  }
  return parent;
}

function buildQueryTerms(
  canonical: HtmlRequirementSnapshotRecord,
  canonicalChildren: readonly HtmlRequirementSnapshotRecord[],
  requestedAcceptanceCriteria: readonly HtmlRequirementSnapshotRecord[],
  focus: HtmlKnowledgeQueryFocus,
): QueryTermBuildResult {
  const terms = new Map<string, QueryTerm>();
  let remainingTextChars = MAX_HTML_QUERY_TEXT_CHARS;
  let truncated = false;
  const acceptanceCriteria = canonicalChildren
    .filter((record) => record.level === 'ac')
    .sort(compareSnapshotRecords);
  const requestedIds = new Set(requestedAcceptanceCriteria.map((record) => record.id));
  const requested = acceptanceCriteria.filter((record) => requestedIds.has(record.id));
  const siblings = acceptanceCriteria.filter((record) => !requestedIds.has(record.id));

  addExact(canonical.id, false);
  for (const record of requested) {
    addExact(record.id, false);
  }
  for (const term of FOCUS_TERMS[focus]) addExact(term, false);
  addText(canonical.title);
  for (const record of requested) addText(record.title);

  addText(canonical.description);
  for (const record of requested) addText(record.description);
  for (const record of siblings) {
    addText(record.title);
    addText(record.description);
  }

  return {
    terms: [...terms.values()].sort((left, right) =>
      compareText(left.value, right.value) || Number(right.quoted) - Number(left.quoted)
    ),
    truncated,
  };

  function addText(value: string): void {
    const bounded = takeQueryText(value, remainingTextChars);
    remainingTextChars -= bounded.codePointLength;
    truncated ||= bounded.truncated;
    if (!bounded.value) return;

    const textWithoutMarkup = stripMarkupTags(bounded.value);
    for (const match of textWithoutMarkup.matchAll(QUOTED_TERM)) {
      addExact(match[1] ?? match[2] ?? '', true);
    }

    const textWithoutRoutes = unwrapInlineCode(unwrapMarkdownLinks(textWithoutMarkup))
      .split(/\s+/u)
      .map((part) => {
        const route = sanitizeRequirementRouteToken(part);
        if (!route) return part;
        const routeIdentity = routeIdentityTerm(route);
        addExact(routeIdentity, false, routeIdentity);
        addExact(route.normalizedTarget, false, routeIdentity);
        addExact(route.path, false, routeIdentity);
        for (const parameterName of route.queryParameterNames) {
          addExact(parameterName, false);
          for (const token of tokenizeHtmlKnowledge(parameterName)) addExact(token, false);
        }
        return ' ';
      })
      .join(' ');
    addGenericTerms(textWithoutRoutes);
  }

  function addGenericTerms(value: string): void {
    for (const token of tokenizeHtmlKnowledge(value)) {
      if (!QUERY_STOP_WORDS.has(token)) addExact(token, false);
    }
    for (const match of value.matchAll(FIELD_LIKE_TERM)) addExact(match[0], false);
  }

  function addExact(value: string, quoted: boolean, scoreKey?: string): void {
    const normalized = normalizeSearchValue(value);
    if (!normalized) return;
    const existing = terms.get(normalized);
    if (existing) {
      if ((quoted && !existing.quoted) || (scoreKey && scoreKey !== existing.scoreKey)) {
        terms.set(normalized, {
          value: normalized,
          quoted: existing.quoted || quoted,
          scoreKey: scoreKey ?? existing.scoreKey,
        });
      }
      return;
    }
    if (terms.size >= MAX_HTML_QUERY_TERMS) {
      truncated = true;
      return;
    }
    terms.set(normalized, {
      value: normalized,
      quoted,
      scoreKey: scoreKey ?? normalized,
    });
  }
}

function takeQueryText(
  value: string,
  maxCodePoints: number,
): { readonly value: string; readonly codePointLength: number; readonly truncated: boolean } {
  if (maxCodePoints <= 0) {
    return { value: '', codePointLength: 0, truncated: value.length > 0 };
  }

  const codePoints: string[] = [];
  let truncated = false;
  for (const codePoint of value) {
    if (codePoints.length >= maxCodePoints) {
      truncated = true;
      break;
    }
    codePoints.push(codePoint);
  }
  return {
    value: codePoints.join(''),
    codePointLength: codePoints.length,
    truncated,
  };
}

function stripMarkupTags(value: string): string {
  const result: string[] = [];
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '<' || !isMarkupStart(value, index + 1)) {
      result.push(value[index]);
      index += 1;
      continue;
    }

    const markupStart = index;
    if (value.startsWith('<!--', index)) {
      index += 4;
      while (index < value.length && !value.startsWith('-->', index)) index += 1;
      if (index >= value.length) {
        result.push(value.slice(markupStart));
        break;
      }
      index += 3;
      result.push(' ');
      continue;
    }

    index += 1;
    let quote: '"' | "'" | null = null;
    let closed = false;
    while (index < value.length) {
      const character = value[index];
      index += 1;
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        closed = true;
        break;
      }
    }
    if (!closed) {
      result.push(value.slice(markupStart));
      break;
    }
    result.push(' ');
  }
  return result.join('');
}

function unwrapMarkdownLinks(value: string): string {
  const result: string[] = [];
  let state: 'text' | 'label' | 'destination' = 'text';
  const label: string[] = [];
  const destination: string[] = [];
  let destinationDepth = 0;
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (state === 'text') {
      if (character === '[' && (index === 0 || value[index - 1] !== '\\')) {
        state = 'label';
        label.length = 0;
      } else {
        result.push(character);
      }
      index += 1;
      continue;
    }

    if (state === 'label') {
      if (character === ']' && value[index + 1] === '(' && value[index - 1] !== '\\') {
        state = 'destination';
        destination.length = 0;
        destinationDepth = 1;
        index += 2;
        continue;
      }
      if (character === ']' && value[index - 1] !== '\\') {
        result.push('[', ...label, ']');
        label.length = 0;
        state = 'text';
      } else {
        label.push(character);
      }
      index += 1;
      continue;
    }

    if (character === '(' && value[index - 1] !== '\\') {
      destinationDepth += 1;
      destination.push(character);
    } else if (character === ')' && value[index - 1] !== '\\') {
      destinationDepth -= 1;
      if (destinationDepth === 0) {
        result.push(...label, ' ', ...destination);
        label.length = 0;
        destination.length = 0;
        state = 'text';
      } else {
        destination.push(character);
      }
    } else {
      destination.push(character);
    }
    index += 1;
  }

  if (state === 'label') result.push('[', ...label);
  if (state === 'destination') result.push('[', ...label, '](', ...destination);
  return result.join('');
}

function unwrapInlineCode(value: string): string {
  const result: string[] = [];
  let code: string[] | null = null;
  let delimiterLength = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '`') {
      (code ?? result).push(value[index]);
      index += 1;
      continue;
    }

    let delimiterEnd = index;
    while (value[delimiterEnd] === '`') delimiterEnd += 1;
    const runLength = delimiterEnd - index;
    if (code === null) {
      delimiterLength = runLength;
      code = [];
    } else if (runLength === delimiterLength) {
      result.push(...code);
      code = null;
      delimiterLength = 0;
    } else {
      code.push(value.slice(index, delimiterEnd));
    }
    index = delimiterEnd;
  }

  if (code !== null) result.push('`'.repeat(delimiterLength), ...code);
  return result.join('');
}

function isMarkupStart(value: string, index: number): boolean {
  const first = value[index];
  if (!first) return false;
  if (/[A-Za-z!?]/u.test(first)) return true;
  return first === '/' && /[A-Za-z]/u.test(value[index + 1] ?? '');
}

function sanitizeRequirementRouteToken(raw: string): SanitizedHtmlRoute | null {
  const trimmed = raw.trim();
  let start = 0;
  while (start < trimmed.length && '([\{\'"“‘`'.includes(trimmed[start])) start += 1;
  const candidate = stripTrailingRoutePunctuation(trimmed.slice(start));
  if (!candidate) return null;

  const path = candidate.split(/[?#]/u, 1)[0];
  const looksLikeRoute = /^https?:\/\//iu.test(candidate)
    || candidate.startsWith('//')
    || candidate.startsWith('/')
    || candidate.startsWith('./')
    || candidate.startsWith('../')
    || path.includes('/')
    || /\.html?$/iu.test(path);
  return looksLikeRoute ? sanitizeHtmlRoute(candidate) : null;
}

function stripTrailingRoutePunctuation(value: string): string {
  const delimiterCounts = { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 };
  for (const character of value) {
    if (character in delimiterCounts) {
      delimiterCounts[character as keyof typeof delimiterCounts] += 1;
    }
  }

  let end = value.length;
  while (end > 0) {
    const last = value[end - 1];
    if (/[.,;!?"'”’]/u.test(last)) {
      end -= 1;
      continue;
    }
    if (last === ')' && delimiterCounts[')'] > delimiterCounts['(']) {
      delimiterCounts[')'] -= 1;
      end -= 1;
      continue;
    }
    if (last === ']' && delimiterCounts[']'] > delimiterCounts['[']) {
      delimiterCounts[']'] -= 1;
      end -= 1;
      continue;
    }
    if (last === '}' && delimiterCounts['}'] > delimiterCounts['{']) {
      delimiterCounts['}'] -= 1;
      end -= 1;
      continue;
    }
    break;
  }
  return value.slice(0, end);
}

function flattenChunks(
  pages: readonly HtmlKnowledgePageIndex[],
  indexVersion: number,
): IndexedChunkReference[] {
  const result: IndexedChunkReference[] = [];
  const pageIds = new Set<string>();
  for (const page of pages) {
    if (page.version !== indexVersion) {
      throw new HtmlKnowledgeValidationError(
        `HTML page ${page.pageId} index version must be ${HTML_KNOWLEDGE_INDEX_VERSION}`,
      );
    }
    if (pageIds.has(page.pageId)) {
      throw new HtmlKnowledgeValidationError(`Duplicate HTML knowledge page ID: ${page.pageId}`);
    }
    pageIds.add(page.pageId);

    const routeTargetsByDomPath = new Map<string, SanitizedHtmlRoute[]>();
    for (const candidate of page.relationCandidates) {
      const routes = routeTargetsByDomPath.get(candidate.sourceDomPath) ?? [];
      routes.push(candidate.target);
      routeTargetsByDomPath.set(candidate.sourceDomPath, routes);
    }
    for (const chunk of [...page.chunks].sort(compareChunks)) {
      if (chunk.pageId !== page.pageId) {
        throw new HtmlKnowledgeValidationError(`HTML chunk ${chunk.id} belongs to an unexpected page`);
      }
      const routeTargets: SanitizedHtmlRoute[] = [];
      const seenRoutes = new Set<string>();
      for (const domPath of [chunk.domPath, ...chunk.elements.map((element) => element.domPath)]) {
        for (const route of routeTargetsByDomPath.get(domPath) ?? []) {
          const key = `${route.fullPathSha256}\0${route.normalizedTarget}`;
          if (!seenRoutes.has(key)) {
            seenRoutes.add(key);
            routeTargets.push(route);
          }
        }
      }
      result.push({ page, chunk, routeTargets });
    }
  }
  return result;
}

function buildChunkEvidence(reference: IndexedChunkReference): ChunkEvidenceTerms {
  const { page, chunk, routeTargets } = reference;
  const identityTerms = new Set<string>();
  const primaryTerms = new Set<string>();
  const secondaryTerms = new Set<string>();
  const bodyTerms = new Set<string>();
  const exactLabels = new Set<string>();

  addSearchValue(primaryTerms, page.fileName);
  addSearchValue(primaryTerms, page.pageTitle);
  addRouteTerms(primaryTerms, page.canonicalRoute);
  addRouteTerms(primaryTerms, page.baseRoute);
  for (const route of page.routeAliases) addRouteTerms(primaryTerms, route);
  for (const route of routeTargets) addRouteTerms(primaryTerms, route);
  addSearchValue(primaryTerms, chunk.heading);
  addSearchValue(primaryTerms, chunk.sectionType);
  if (chunk.heading) primaryTerms.add('heading');
  if (chunk.sectionType === 'interactive') primaryTerms.add('interaction');
  if (chunk.sectionType === 'navigation') primaryTerms.add('navigation');
  if (chunk.sectionType === 'form') primaryTerms.add('form');
  if (chunk.sectionType === 'validation') {
    secondaryTerms.add('validation');
    secondaryTerms.add('error');
  }
  if (chunk.sectionType === 'content') {
    bodyTerms.add('content');
    bodyTerms.add('text');
  }
  addSearchValue(bodyTerms, chunk.staticText);

  for (const element of chunk.elements) {
    for (const value of [element.id, element.name, element.dataTestId, element.accessibleNameCandidate]) {
      addSearchValue(identityTerms, value);
    }
    if (element.label) {
      addSearchValue(secondaryTerms, element.label);
      exactLabels.add(normalizeSearchValue(element.label));
    }
    addSearchValue(secondaryTerms, element.validationText);
    addSearchValue(primaryTerms, element.tagName);

    if (element.tagName === 'form') primaryTerms.add('form');
    if (element.tagName === 'a' || element.tagName === 'area') {
      primaryTerms.add('link');
      primaryTerms.add('navigation');
    }
    if (['button', 'input', 'select', 'textarea'].includes(element.tagName)) {
      primaryTerms.add('control');
      primaryTerms.add('interaction');
      if (element.tagName === 'input' || element.tagName === 'select' || element.tagName === 'textarea') {
        primaryTerms.add('field');
      }
    }
    addRouteValue(primaryTerms, element.href, 'href');
    addRouteValue(primaryTerms, element.action, 'action');
    addConstraintTerms(secondaryTerms, element);
  }

  return { identityTerms, primaryTerms, secondaryTerms, bodyTerms, exactLabels };
}

function rankQueryGroups(
  groups: readonly QueryGroupDefinition[],
  chunks: readonly IndexedChunkReference[],
  relatedPageIds: ReadonlyMap<string, ReadonlySet<string>>,
): RankedQueryGroup[] {
  interface QueryTermReference {
    readonly groupIndex: number;
    readonly scoreKeyIndex: number;
    readonly quoted: boolean;
  }

  const referencesByTerm = new Map<string, QueryTermReference[]>();
  const scoresByGroup = groups.map(() => new Int32Array(chunks.length));
  const seenScoreKeysByGroup: Uint32Array[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const scoreKeyIndexes = new Map<string, number>();
    for (const term of group.queryTerms) {
      let scoreKeyIndex = scoreKeyIndexes.get(term.scoreKey);
      if (scoreKeyIndex === undefined) {
        scoreKeyIndex = scoreKeyIndexes.size;
        scoreKeyIndexes.set(term.scoreKey, scoreKeyIndex);
      }
      const references = referencesByTerm.get(term.value) ?? [];
      references.push({ groupIndex, scoreKeyIndex, quoted: term.quoted });
      referencesByTerm.set(term.value, references);
    }
    seenScoreKeysByGroup.push(new Uint32Array(scoreKeyIndexes.size));
  }

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const evidence = buildChunkEvidence(chunk);
    const marker = chunkIndex + 1;
    addEvidence(evidence.identityTerms, HTML_RETRIEVAL_WEIGHTS.identity, false);
    addEvidence(evidence.exactLabels, HTML_RETRIEVAL_WEIGHTS.identity, true);
    addEvidence(evidence.primaryTerms, HTML_RETRIEVAL_WEIGHTS.context, false);
    addEvidence(evidence.secondaryTerms, HTML_RETRIEVAL_WEIGHTS.label, false);
    addEvidence(evidence.bodyTerms, HTML_RETRIEVAL_WEIGHTS.text, false);

    function addEvidence(
      evidenceTerms: ReadonlySet<string>,
      weight: number,
      quotedOnly: boolean,
    ): void {
      for (const evidenceTerm of evidenceTerms) {
        for (const reference of referencesByTerm.get(evidenceTerm) ?? []) {
          if (quotedOnly && !reference.quoted) continue;
          const seenScoreKeys = seenScoreKeysByGroup[reference.groupIndex];
          if (seenScoreKeys[reference.scoreKeyIndex] === marker) continue;
          seenScoreKeys[reference.scoreKeyIndex] = marker;
          scoresByGroup[reference.groupIndex][chunkIndex] += weight;
        }
      }
    }
  }

  return groups.map((group, groupIndex): RankedQueryGroup => {
    const scores = scoresByGroup[groupIndex];
    const positivePageIds = new Set<string>();
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (scores[chunkIndex] > 0) positivePageIds.add(chunks[chunkIndex].page.pageId);
    }
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (scores[chunkIndex] === 0) continue;
      const pageId = chunks[chunkIndex].page.pageId;
      if ([...(relatedPageIds.get(pageId) ?? [])]
        .some((relatedPageId) => relatedPageId !== pageId && positivePageIds.has(relatedPageId))) {
        scores[chunkIndex] += HTML_RETRIEVAL_WEIGHTS.relation;
      }
    }

    const rankedChunkIndexes: number[] = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (scores[chunkIndex] > 0) rankedChunkIndexes.push(chunkIndex);
    }
    rankedChunkIndexes.sort((left, right) =>
      scores[right] - scores[left]
      || compareChunkReferences(chunks[left], chunks[right])
    );
    const seenChunkIds = new Set<string>();
    const deduplicatedIndexes = rankedChunkIndexes.filter((chunkIndex) => {
      const chunkId = chunks[chunkIndex].chunk.id;
      if (seenChunkIds.has(chunkId)) return false;
      seenChunkIds.add(chunkId);
      return true;
    });

    return {
      key: group.key,
      canonical: group.canonical,
      queryTerms: group.queryTerms,
      scores,
      rankedChunkIndexes: deduplicatedIndexes,
      matchedTermsByChunkIndex: new Map<number, readonly string[]>(),
      confidence: confidenceFor(scores[deduplicatedIndexes[0]] ?? 0),
      queryTruncated: group.queryTruncated,
    };
  });
}

function preferMatchedTerm(candidate: string, current: string): boolean {
  const priority = (value: string): number => {
    if (value.startsWith(ROUTE_IDENTITY_PREFIX)) return 0;
    if (/^https?:\/\//u.test(value)) return 3;
    if (value.includes('?')) return 2;
    return 1;
  };
  return priority(candidate) > priority(current)
    || (priority(candidate) === priority(current) && candidate.length > current.length);
}

function tryAddCandidate(
  result: MutableQueryResult,
  match: MutableQueryMatch,
  chunkIndex: number,
  ranking: RankedQueryGroup,
  chunks: readonly IndexedChunkReference[],
  relations: readonly HtmlPageRelation[],
  chunksById: Map<string, number>,
): boolean {
  const reference = chunks[chunkIndex];
  const chunkId = reference.chunk.id;
  const existingIndex = chunksById.get(chunkId);
  match.chunkIds.push(chunkId);

  let matchedTerms = ranking.matchedTermsByChunkIndex.get(chunkIndex);
  if (!matchedTerms) {
    matchedTerms = collectMatchedTerms(buildChunkEvidence(reference), ranking.queryTerms);
    ranking.matchedTermsByChunkIndex.set(chunkIndex, matchedTerms);
  }

  if (existingIndex === undefined) {
    const payload = toQueryChunk(reference, matchedTerms, relations);
    result.chunks.push(payload);
    if (fits(result)) {
      chunksById.set(chunkId, result.chunks.length - 1);
      return true;
    }
    result.chunks.pop();
    match.chunkIds.pop();
    return false;
  }

  const existing = result.chunks[existingIndex];
  const mergedTerms = [...new Set([...existing.matchedTerms, ...matchedTerms])].sort(compareText);
  result.chunks[existingIndex] = { ...existing, matchedTerms: mergedTerms };
  if (fits(result)) return true;

  result.chunks[existingIndex] = existing;
  match.chunkIds.pop();
  return false;
}

function collectMatchedTerms(
  evidence: ChunkEvidenceTerms,
  queryTerms: readonly QueryTerm[],
): readonly string[] {
  const matchesByScoreKey = new Map<string, { readonly term: string; readonly weight: number }>();
  for (const term of queryTerms) {
    const weight = evidence.identityTerms.has(term.value)
      || (term.quoted && evidence.exactLabels.has(term.value))
      ? HTML_RETRIEVAL_WEIGHTS.identity
      : evidence.primaryTerms.has(term.value)
        ? HTML_RETRIEVAL_WEIGHTS.context
        : evidence.secondaryTerms.has(term.value)
          ? HTML_RETRIEVAL_WEIGHTS.label
          : evidence.bodyTerms.has(term.value)
            ? HTML_RETRIEVAL_WEIGHTS.text
            : 0;
    const existing = matchesByScoreKey.get(term.scoreKey);
    if (weight > 0 && (
      !existing
      || weight > existing.weight
      || (weight === existing.weight && preferMatchedTerm(term.value, existing.term))
    )) {
      matchesByScoreKey.set(term.scoreKey, { term: term.value, weight });
    }
  }
  return [...matchesByScoreKey.values()]
    .map((match) => match.term)
    .sort(compareText);
}

function toQueryChunk(
  reference: IndexedChunkReference,
  matchedTerms: readonly string[],
  relations: readonly HtmlPageRelation[],
): HtmlKnowledgeQueryChunk {
  const { page, chunk } = reference;
  return {
    chunkId: chunk.id,
    pageId: page.pageId,
    fileName: page.fileName,
    pageTitle: page.pageTitle,
    sectionType: chunk.sectionType,
    domPath: chunk.domPath,
    ...(chunk.sourceLocation ? { sourceLocation: canonicalSourceLocation(chunk.sourceLocation) } : {}),
    matchedTerms,
    ...(chunk.staticText ? { staticText: chunk.staticText } : {}),
    elements: [...chunk.elements].sort(compareElements).map(canonicalElement),
    relations: relations.filter((relation) =>
      relation.fromPageId === page.pageId || relation.toPageId === page.pageId
    ),
  };
}

function canonicalElement(element: HtmlKnowledgeElement): HtmlKnowledgeElement {
  const ariaAttributes = element.ariaAttributes
    ? Object.fromEntries(Object.entries(element.ariaAttributes).sort(([left], [right]) => compareText(left, right)))
    : undefined;
  return {
    tagName: element.tagName,
    domPath: element.domPath,
    ...(element.inputType !== undefined ? { inputType: element.inputType } : {}),
    ...(element.label !== undefined ? { label: element.label } : {}),
    ...(element.accessibleNameCandidate !== undefined
      ? { accessibleNameCandidate: element.accessibleNameCandidate }
      : {}),
    ...(element.id !== undefined ? { id: element.id } : {}),
    ...(element.name !== undefined ? { name: element.name } : {}),
    ...(element.role !== undefined ? { role: element.role } : {}),
    ...(ariaAttributes ? { ariaAttributes } : {}),
    ...(element.dataTestId !== undefined ? { dataTestId: element.dataTestId } : {}),
    ...(element.href !== undefined ? { href: element.href } : {}),
    ...(element.action !== undefined ? { action: element.action } : {}),
    ...(element.method !== undefined ? { method: element.method } : {}),
    ...(element.required !== undefined ? { required: element.required } : {}),
    ...(element.disabled !== undefined ? { disabled: element.disabled } : {}),
    ...(element.readOnly !== undefined ? { readOnly: element.readOnly } : {}),
    ...(element.multiple !== undefined ? { multiple: element.multiple } : {}),
    ...(element.min !== undefined ? { min: element.min } : {}),
    ...(element.max !== undefined ? { max: element.max } : {}),
    ...(element.step !== undefined ? { step: element.step } : {}),
    ...(element.minLength !== undefined ? { minLength: element.minLength } : {}),
    ...(element.maxLength !== undefined ? { maxLength: element.maxLength } : {}),
    ...(element.pattern !== undefined ? { pattern: element.pattern } : {}),
    ...(element.options !== undefined
      ? { options: element.options.map((option) => ({
        label: option.label,
        ...(option.value !== undefined ? { value: option.value } : {}),
      })) }
      : {}),
    ...(element.validationText !== undefined ? { validationText: element.validationText } : {}),
    ...(element.sourceLocation
      ? { sourceLocation: canonicalSourceLocation(element.sourceLocation) }
      : {}),
  };
}

function canonicalRelations(relations: readonly HtmlPageRelation[]): HtmlPageRelation[] {
  const byValue = new Map<string, HtmlPageRelation>();
  for (const relation of relations) {
    const canonical: HtmlPageRelation = {
      fromPageId: relation.fromPageId,
      toPageId: relation.toPageId,
      type: relation.type,
      ...(relation.label !== undefined ? { label: relation.label } : {}),
      sourceDomPath: relation.sourceDomPath,
      sourceTarget: relation.sourceTarget,
      matchRule: relation.matchRule,
      confidence: relation.confidence,
    };
    byValue.set(JSON.stringify(canonical), canonical);
  }
  return [...byValue.values()].sort(compareRelations);
}

function buildRelatedPageIds(
  relations: readonly HtmlPageRelation[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const related = new Map<string, Set<string>>();
  for (const relation of relations) {
    add(relation.fromPageId, relation.toPageId);
    add(relation.toPageId, relation.fromPageId);
  }
  return related;

  function add(pageId: string, relatedPageId: string): void {
    const pageIds = related.get(pageId) ?? new Set<string>();
    pageIds.add(relatedPageId);
    related.set(pageId, pageIds);
  }
}

interface WarningBuildResult {
  readonly values: readonly string[];
  readonly truncated: boolean;
}

function requiredWarnings(
  requirements: readonly ResolvedRequirement[],
  pages: readonly HtmlKnowledgePageIndex[],
): WarningBuildResult {
  const warnings: string[] = [];
  let truncated = false;
  const unmatchedIds = requirements
    .filter((requirement) => requirement.ranking.rankedChunkIndexes.length === 0)
    .map((requirement) => requirement.requested.id);
  if (unmatchedIds.length > 0) {
    const outlineQueryTerms = new Map<string, QueryTerm>();
    for (const requirement of requirements.filter((item) =>
      item.ranking.rankedChunkIndexes.length === 0
    )) {
      for (const term of requirement.ranking.queryTerms) outlineQueryTerms.set(term.value, term);
    }
    let pageMetadataTruncated = false;
    const pageOutline = [...pages]
      .sort((left, right) =>
        pageOutlineScore(right, outlineQueryTerms) - pageOutlineScore(left, outlineQueryTerms)
        || compareText(normalizeSearchValue(left.pageTitle), normalizeSearchValue(right.pageTitle))
        || comparePages(left, right)
      )
      .map((page) => {
        const fullTitle = normalizeStaticText(page.pageTitle, Number.MAX_SAFE_INTEGER);
        const fullFileName = normalizeStaticText(page.fileName, Number.MAX_SAFE_INTEGER);
        const title = normalizeStaticText(fullTitle, MAX_PAGE_OUTLINE_FIELD_CHARS);
        const fileName = normalizeStaticText(fullFileName, MAX_PAGE_OUTLINE_FIELD_CHARS);
        pageMetadataTruncated ||= title !== fullTitle || fileName !== fullFileName;
        return `${title} (${fileName})`;
      });
    const outlineWarning = boundedListWarning(
      'Available HTML pages: ',
      pageOutline.length > 0 ? pageOutline : ['none indexed'],
      '. No relevant indexed match was found; treat this result as inconclusive.',
    );
    warnings.push(outlineWarning.value);
    truncated ||= outlineWarning.truncated || pageMetadataTruncated;

    const idWarning = boundedListWarning('Unmatched requirement IDs: ', unmatchedIds, '.');
    warnings.push(idWarning.value);
    truncated ||= idWarning.truncated;
  }

  const lowInformationPages = pages
    .filter((page) => page.informationLevel === 'LOW_INFORMATION')
    .map((page) => page.fileName);
  if (lowInformationPages.length > 0) {
    const lowInformationWarning = boundedListWarning(
      'Low-information HTML pages: ',
      lowInformationPages,
      '.',
    );
    warnings.push(lowInformationWarning.value);
    truncated ||= lowInformationWarning.truncated;
  }

  const truncatedQueryIds = [...new Set(
    requirements
      .filter((requirement) => requirement.ranking.queryTruncated)
      .map((requirement) => requirement.canonical.id),
  )].sort(compareText);
  if (truncatedQueryIds.length > 0) {
    const queryWarning = boundedListWarning(
      'Requirement query text or terms truncated for: ',
      truncatedQueryIds,
      '.',
    );
    warnings.push(queryWarning.value);
    truncated = true;
  }
  return { values: warnings, truncated };
}

function pageOutlineScore(
  page: HtmlKnowledgePageIndex,
  queryTerms: ReadonlyMap<string, QueryTerm>,
): number {
  const pageTerms = new Set<string>();
  addSearchValue(pageTerms, page.fileName);
  addSearchValue(pageTerms, page.pageTitle);
  addRouteTerms(pageTerms, page.canonicalRoute);
  addRouteTerms(pageTerms, page.baseRoute);
  for (const route of page.routeAliases) addRouteTerms(pageTerms, route);

  const matchedScoreKeys = new Set<string>();
  for (const term of queryTerms.values()) {
    if (pageTerms.has(term.value)) matchedScoreKeys.add(term.scoreKey);
  }
  return matchedScoreKeys.size * HTML_RETRIEVAL_WEIGHTS.context;
}

function optionalPageWarnings(pages: readonly HtmlKnowledgePageIndex[]): WarningBuildResult {
  const warnings = new Set<string>();
  let truncated = false;
  for (const page of pages) {
    for (const warning of page.warnings) {
      const bounded = boundWarning(`${page.fileName}: ${warning}`);
      warnings.add(bounded.value);
      truncated ||= bounded.truncated;
    }
  }
  return { values: [...warnings].sort(compareText), truncated };
}

function tryAddWarning(result: MutableQueryResult, warning: string): void {
  if (!warning || result.warnings.includes(warning)) return;
  if (result.warnings.length >= MAX_HTML_WARNINGS) {
    result.truncated = true;
    return;
  }
  result.warnings.push(warning);
  if (!fits(result)) {
    result.warnings.pop();
    result.truncated = true;
  }
}

function addConstraintTerms(terms: Set<string>, element: HtmlKnowledgeElement): void {
  const booleanConstraints: ReadonlyArray<[string, boolean | undefined]> = [
    ['required', element.required],
    ['disabled', element.disabled],
    ['readonly', element.readOnly],
    ['multiple', element.multiple],
  ];
  for (const [name, value] of booleanConstraints) {
    if (value !== undefined) terms.add(name);
  }

  const valueConstraints: ReadonlyArray<[string, string | number | undefined]> = [
    ['min', element.min],
    ['minimum', element.min],
    ['max', element.max],
    ['maximum', element.max],
    ['step', element.step],
    ['minlength', element.minLength],
    ['maxlength', element.maxLength],
    ['pattern', element.pattern],
  ];
  for (const [name, value] of valueConstraints) {
    if (value === undefined) continue;
    terms.add(name);
    addSearchValue(terms, String(value));
  }
  for (const option of element.options ?? []) {
    addSearchValue(terms, option.label);
    addSearchValue(terms, option.value);
  }
  if (element.validationText) {
    terms.add('validation');
    terms.add('error');
  }
  if (element.role === 'alert' || element.role === 'status') {
    terms.add('validation');
    terms.add('error');
  }
  if (element.ariaAttributes?.['aria-invalid'] === 'true') terms.add('invalid');
}

function addRouteTerms(terms: Set<string>, route: SanitizedHtmlRoute | undefined): void {
  if (!route) return;
  terms.add(routeIdentityTerm(route));
  addSearchValue(terms, route.normalizedTarget);
  addSearchValue(terms, route.path);
  for (const name of route.queryParameterNames) addSearchValue(terms, name);
  terms.add('route');
  terms.add('navigation');
}

function routeIdentityTerm(route: SanitizedHtmlRoute): string {
  return `${ROUTE_IDENTITY_PREFIX}${route.fullPathSha256}`;
}

function addRouteValue(terms: Set<string>, value: string | undefined, kind: 'href' | 'action'): void {
  if (!value) return;
  addSearchValue(terms, value);
  terms.add(kind);
  terms.add('route');
  terms.add('navigation');
}

function addSearchValue(terms: Set<string>, value: string | undefined): void {
  if (!value) return;
  const normalized = normalizeSearchValue(value);
  if (normalized) terms.add(normalized);
  for (const token of tokenizeHtmlKnowledge(value)) terms.add(token);
}

function normalizeSearchValue(value: string): string {
  return String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

function confidenceFor(score: number): HtmlKnowledgeMatchConfidence {
  if (score >= HTML_RETRIEVAL_WEIGHTS.identity) return 'high';
  if (score >= HTML_RETRIEVAL_WEIGHTS.label) return 'medium';
  if (score >= 1) return 'low';
  return 'none';
}

function fits(result: MutableQueryResult): boolean {
  return JSON.stringify(result).length <= MAX_HTML_TOOL_CHARS;
}

function assertBaseFits(result: MutableQueryResult): void {
  if (!fits(result)) {
    throw new HtmlKnowledgeLimitError('HTML knowledge result source metadata exceeds 6,000 characters');
  }
}

function boundedListWarning(
  prefix: string,
  rawItems: readonly string[],
  suffix: string,
): { readonly value: string; readonly truncated: boolean } {
  const items = rawItems.map((item) => normalizeStaticText(item, MAX_HTML_WARNING_CHARS));
  const included: string[] = [];
  let truncated = false;

  for (const item of items) {
    const separator = included.length > 0 ? ', ' : '';
    const candidate = `${prefix}${included.join(', ')}${separator}${item}${suffix}`;
    if (Array.from(candidate).length <= MAX_HTML_WARNING_CHARS) {
      included.push(item);
      continue;
    }

    truncated = true;
    if (included.length === 0) {
      const availableChars = Math.max(
        0,
        MAX_HTML_WARNING_CHARS - Array.from(`${prefix}${suffix}`).length,
      );
      included.push(Array.from(item).slice(0, availableChars).join(''));
    }
    break;
  }
  if (included.length < items.length) truncated = true;

  return {
    value: `${prefix}${included.join(', ')}${suffix}`,
    truncated,
  };
}

function boundWarning(value: string): { readonly value: string; readonly truncated: boolean } {
  const normalized = normalizeStaticText(value, Number.MAX_SAFE_INTEGER);
  return {
    value: normalizeStaticText(normalized, MAX_HTML_WARNING_CHARS),
    truncated: Array.from(normalized).length > MAX_HTML_WARNING_CHARS,
  };
}

function canonicalIds(ids: readonly string[], context: string): string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    unique.add(validateHtmlRequirementId(id, context));
  }
  return [...unique].sort(compareText);
}

function canonicalSourceLocation(location: HtmlKnowledgeSourceLocation): HtmlKnowledgeSourceLocation {
  return { startLine: location.startLine, endLine: location.endLine };
}

function compareSnapshotRecords(
  left: HtmlRequirementSnapshotRecord,
  right: HtmlRequirementSnapshotRecord,
): number {
  return left.position - right.position || compareText(left.id, right.id);
}

function comparePages(left: HtmlKnowledgePageIndex, right: HtmlKnowledgePageIndex): number {
  return compareText(left.fileNameKey, right.fileNameKey)
    || compareText(left.pageId, right.pageId);
}

function compareChunks(
  left: HtmlKnowledgePageIndex['chunks'][number],
  right: HtmlKnowledgePageIndex['chunks'][number],
): number {
  return compareText(left.domPath, right.domPath) || compareText(left.id, right.id);
}

function compareChunkReferences(left: IndexedChunkReference, right: IndexedChunkReference): number {
  return compareText(left.page.fileNameKey, right.page.fileNameKey)
    || compareText(left.chunk.domPath, right.chunk.domPath)
    || compareText(left.chunk.id, right.chunk.id);
}

function compareElements(left: HtmlKnowledgeElement, right: HtmlKnowledgeElement): number {
  return compareText(left.domPath, right.domPath) || compareText(left.tagName, right.tagName);
}

function compareRelations(left: HtmlPageRelation, right: HtmlPageRelation): number {
  return compareText(left.fromPageId, right.fromPageId)
    || compareText(left.toPageId, right.toPageId)
    || compareText(left.sourceDomPath, right.sourceDomPath)
    || compareText(left.type, right.type)
    || compareText(left.sourceTarget, right.sourceTarget)
    || compareText(left.label ?? '', right.label ?? '')
    || compareText(left.matchRule, right.matchRule)
    || compareText(left.confidence, right.confidence);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
