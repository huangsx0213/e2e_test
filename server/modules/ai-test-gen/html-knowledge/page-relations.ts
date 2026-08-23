import { HtmlKnowledgeLimitError, normalizeStaticText } from './normalization.ts';
import {
  MAX_HTML_PAGE_RELATIONS,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  type HtmlKnowledgePageIndex,
  type HtmlPageRelation,
  type HtmlPageRelationBuildResult,
  type HtmlPageRelationCandidate,
  type HtmlPageRelationConfidence,
  type HtmlPageRelationMatchRule,
} from './types.ts';

interface PageAlias {
  readonly pageId: string;
  readonly pathComponents: readonly string[];
}

interface RelationMatch {
  readonly pageId: string;
  readonly matchRule: HtmlPageRelationMatchRule;
  readonly confidence: HtmlPageRelationConfidence;
}

interface AmbiguousRelationMatch {
  readonly matchRule: HtmlPageRelationMatchRule;
  readonly matchCount: number;
}

export function buildHtmlPageRelations(
  pages: readonly HtmlKnowledgePageIndex[],
): HtmlPageRelationBuildResult {
  const sortedPages = [...pages].sort(comparePages);
  const canonicalTargets = new Map<string, Set<string>>();
  const fileTargets = new Map<string, Set<string>>();
  const suffixAliases: PageAlias[] = [];
  const acceptedOrigins = new Set<string>();

  for (const page of sortedPages) {
    for (const route of [page.canonicalRoute, page.baseRoute]) {
      if (route?.origin) acceptedOrigins.add(route.origin);
    }

    if (page.canonicalRoute) {
      addTarget(canonicalTargets, page.canonicalRoute.fullPathSha256, page.pageId);
      if (!page.canonicalRoute.pathTruncated) {
        addSuffixAlias(suffixAliases, page.pageId, page.canonicalRoute.path);
      }
    }

    for (const alias of page.routeAliases) {
      addTarget(fileTargets, alias.fullPathSha256, page.pageId);
      if (!alias.pathTruncated) addSuffixAlias(suffixAliases, page.pageId, alias.path);
    }
  }

  const relationsByKey = new Map<string, HtmlPageRelation>();
  const warnings = new Map<string, { values: string[]; seen: Set<string> }>();

  for (const sourcePage of sortedPages) {
    const candidates = [...sourcePage.relationCandidates].sort(compareCandidates);
    for (const candidate of candidates) {
      if (!isEligibleCandidate(candidate, acceptedOrigins)) continue;

      const match = matchCandidate(
        candidate,
        canonicalTargets,
        fileTargets,
        suffixAliases,
      );
      if (!match) continue;
      if (!('pageId' in match)) {
        addWarning(
          warnings,
          sourcePage.pageId,
          `Ambiguous HTML relation at ${candidate.sourceDomPath}: ${candidate.sourceTarget} matched ${match.matchCount} pages by ${match.matchRule}`,
        );
        continue;
      }
      if (match.pageId === sourcePage.pageId) continue;

      const relation: HtmlPageRelation = {
        fromPageId: sourcePage.pageId,
        toPageId: match.pageId,
        type: candidate.type,
        ...(candidate.label ? { label: candidate.label } : {}),
        sourceDomPath: candidate.sourceDomPath,
        sourceTarget: candidate.sourceTarget,
        matchRule: match.matchRule,
        confidence: match.confidence,
      };
      const key = JSON.stringify([
        relation.fromPageId,
        relation.toPageId,
        relation.type,
        relation.sourceDomPath,
        relation.sourceTarget,
      ]);
      const existing = relationsByKey.get(key);
      if (!existing || compareLabels(relation.label, existing.label) < 0) {
        relationsByKey.set(key, relation);
      }
      if (relationsByKey.size > MAX_HTML_PAGE_RELATIONS) {
        throw new HtmlKnowledgeLimitError('HTML page graph exceeds 2,000 relations');
      }
    }
  }

  const sourceFileKeys = new Map(sortedPages.map((page) => [page.pageId, page.fileNameKey]));
  const relations = [...relationsByKey.values()].sort((left, right) =>
    compareText(sourceFileKeys.get(left.fromPageId) ?? '', sourceFileKeys.get(right.fromPageId) ?? '')
    || compareText(left.sourceDomPath, right.sourceDomPath)
    || compareText(left.type, right.type)
    || compareText(left.sourceTarget, right.sourceTarget)
    || compareText(left.toPageId, right.toPageId)
    || compareText(left.fromPageId, right.fromPageId)
    || compareLabels(left.label, right.label)
  );
  const warningsByPageId: Record<string, readonly string[]> = {};
  for (const page of sortedPages) {
    const pageWarnings = warnings.get(page.pageId)?.values;
    if (pageWarnings?.length) warningsByPageId[page.pageId] = pageWarnings;
  }

  return { relations, warningsByPageId };
}

function matchCandidate(
  candidate: HtmlPageRelationCandidate,
  canonicalTargets: ReadonlyMap<string, ReadonlySet<string>>,
  fileTargets: ReadonlyMap<string, ReadonlySet<string>>,
  suffixAliases: readonly PageAlias[],
): RelationMatch | AmbiguousRelationMatch | undefined {
  const rules: ReadonlyArray<{
    matchRule: HtmlPageRelationMatchRule;
    confidence: HtmlPageRelationConfidence;
    pageIds: ReadonlySet<string>;
  }> = [
    {
      matchRule: 'canonical-path',
      confidence: 'high',
      pageIds: canonicalTargets.get(candidate.target.fullPathSha256) ?? EMPTY_TARGETS,
    },
    {
      matchRule: 'file-path',
      confidence: 'high',
      pageIds: fileTargets.get(candidate.target.fullPathSha256) ?? EMPTY_TARGETS,
    },
    {
      matchRule: 'unique-path-suffix',
      confidence: 'medium',
      pageIds: candidate.target.pathTruncated
        ? EMPTY_TARGETS
        : suffixTargets(candidate.target.path, suffixAliases),
    },
  ];

  for (const rule of rules) {
    if (rule.pageIds.size === 0) continue;
    if (rule.pageIds.size !== 1) {
      return { matchRule: rule.matchRule, matchCount: rule.pageIds.size };
    }
    return {
      pageId: rule.pageIds.values().next().value!,
      matchRule: rule.matchRule,
      confidence: rule.confidence,
    };
  }
  return undefined;
}

const EMPTY_TARGETS: ReadonlySet<string> = new Set<string>();

function suffixTargets(path: string, aliases: readonly PageAlias[]): ReadonlySet<string> {
  const candidateComponents = pathComponents(path);
  const pageIds = new Set<string>();
  if (candidateComponents.length === 0) return pageIds;

  for (const alias of aliases) {
    if (isComponentSuffix(candidateComponents, alias.pathComponents)) {
      pageIds.add(alias.pageId);
    }
  }
  return pageIds;
}

function isComponentSuffix(
  candidateComponents: readonly string[],
  aliasComponents: readonly string[],
): boolean {
  if (aliasComponents.length === 0 || aliasComponents.length > candidateComponents.length) return false;
  const offset = candidateComponents.length - aliasComponents.length;
  return aliasComponents.every((component, index) => component === candidateComponents[offset + index]);
}

function pathComponents(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function isEligibleCandidate(
  candidate: HtmlPageRelationCandidate,
  acceptedOrigins: ReadonlySet<string>,
): boolean {
  if (!candidate.target.path.startsWith('/') || candidate.sourceTarget.startsWith('#')) return false;
  if (candidate.sourceTarget.includes('#')) return false;
  if (!candidate.target.origin) return true;
  if (!/^https?:\/\//iu.test(candidate.target.origin)) return false;
  return acceptedOrigins.has(candidate.target.origin);
}

function addTarget(targets: Map<string, Set<string>>, path: string, pageId: string): void {
  const pageIds = targets.get(path) ?? new Set<string>();
  pageIds.add(pageId);
  targets.set(path, pageIds);
}

function addSuffixAlias(aliases: PageAlias[], pageId: string, path: string): void {
  const components = pathComponents(path);
  if (components.length > 0) aliases.push({ pageId, pathComponents: components });
}

function addWarning(
  warnings: Map<string, { values: string[]; seen: Set<string> }>,
  pageId: string,
  message: string,
): void {
  const warning = normalizeStaticText(message, MAX_HTML_WARNING_CHARS);
  if (!warning) return;

  const pageWarnings = warnings.get(pageId) ?? { values: [], seen: new Set<string>() };
  if (!pageWarnings.seen.has(warning) && pageWarnings.values.length < MAX_HTML_WARNINGS) {
    pageWarnings.values.push(warning);
    pageWarnings.seen.add(warning);
  }
  warnings.set(pageId, pageWarnings);
}

function comparePages(left: HtmlKnowledgePageIndex, right: HtmlKnowledgePageIndex): number {
  return compareText(left.fileNameKey, right.fileNameKey) || compareText(left.pageId, right.pageId);
}

function compareCandidates(left: HtmlPageRelationCandidate, right: HtmlPageRelationCandidate): number {
  return compareText(left.sourceDomPath, right.sourceDomPath)
    || compareText(left.type, right.type)
    || compareText(left.sourceTarget, right.sourceTarget)
    || compareLabels(left.label, right.label);
}

function compareLabels(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareText(left, right);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en-US');
}
