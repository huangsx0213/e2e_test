// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { normalizeHtmlFileName, sanitizeHtmlRoute } from '../html-knowledge/normalization.ts';
import { buildHtmlPageRelations } from '../html-knowledge/page-relations.ts';
import { decodeAndNormalizeHtml, parseAndIndexHtml } from '../html-knowledge/parser.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  MAX_HTML_INDEX_BYTES,
  MAX_HTML_PAGE_RELATIONS,
  MAX_HTML_TEXT_CHARS,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  type HtmlKnowledgePageIndex,
  type HtmlPageRelationCandidate,
  type HtmlPageRelationType,
  type SanitizedHtmlRoute,
} from '../html-knowledge/types.ts';

const encoder = new TextEncoder();

function sanitizedRoute(raw: string, base?: string): SanitizedHtmlRoute {
  const result = sanitizeHtmlRoute(raw, base);
  if (!result) throw new Error(`Expected a safe route for ${raw}`);
  return result;
}

function relationCandidate(input: {
  rawTarget: string;
  base?: string;
  type?: HtmlPageRelationType;
  sourceDomPath?: string;
  label?: string;
}): HtmlPageRelationCandidate {
  const target = sanitizedRoute(input.rawTarget, input.base);
  return {
    type: input.type ?? 'link',
    ...(input.label ? { label: input.label } : {}),
    sourceDomPath: input.sourceDomPath ?? '/html:nth-of-type(1)/body:nth-of-type(1)/a:nth-of-type(1)',
    sourceTarget: target.normalizedTarget,
    target,
  };
}

function pageIndex(input: {
  pageId: string;
  fileName: string;
  canonicalRoute?: SanitizedHtmlRoute;
  baseRoute?: SanitizedHtmlRoute;
  relationCandidates?: readonly HtmlPageRelationCandidate[];
}): HtmlKnowledgePageIndex {
  const fileName = normalizeHtmlFileName(input.fileName);
  return {
    version: HTML_KNOWLEDGE_INDEX_VERSION,
    pageId: input.pageId,
    fileName: fileName.displayName,
    fileNameKey: fileName.key,
    pageTitle: fileName.displayName,
    contentSha256: input.pageId,
    informationLevel: 'NORMAL',
    ...(input.canonicalRoute ? { canonicalRoute: input.canonicalRoute } : {}),
    ...(input.baseRoute ? { baseRoute: input.baseRoute } : {}),
    routeAliases: [sanitizedRoute(`/${encodeURIComponent(fileName.displayName)}`)],
    chunks: [],
    relationCandidates: input.relationCandidates ?? [],
    warnings: [],
  };
}

function parsedPage(pageId: string, fileName: string, html: string): HtmlKnowledgePageIndex {
  return parseAndIndexHtml({
    pageId,
    fileName,
    source: decodeAndNormalizeHtml(encoder.encode(html)),
  }).index;
}

describe('buildHtmlPageRelations', () => {
  it('prefers an exact canonical path over an exact file path', () => {
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: [relationCandidate({ rawTarget: '/dashboard.html' })],
    });
    const canonicalTarget = pageIndex({
      pageId: 'page-canonical',
      fileName: 'canonical-target.html',
      canonicalRoute: sanitizedRoute('/dashboard.html'),
    });
    const fileTarget = pageIndex({
      pageId: 'page-file',
      fileName: 'dashboard.html',
      canonicalRoute: sanitizedRoute('/another-route'),
    });

    expect(buildHtmlPageRelations([fileTarget, source, canonicalTarget]).relations).toEqual([{
      fromPageId: 'page-source',
      toPageId: 'page-canonical',
      type: 'link',
      sourceDomPath: '/html:nth-of-type(1)/body:nth-of-type(1)/a:nth-of-type(1)',
      sourceTarget: '/dashboard.html',
      matchRule: 'canonical-path',
      confidence: 'high',
    }]);
  });

  it('matches a relative target to a unique absolute canonical path', () => {
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: [relationCandidate({ rawTarget: '/dashboard' })],
    });
    const target = pageIndex({
      pageId: 'page-dashboard',
      fileName: 'dashboard.html',
      canonicalRoute: sanitizedRoute('https://app.example.test/dashboard'),
    });

    expect(buildHtmlPageRelations([source, target]).relations).toEqual([
      expect.objectContaining({
        fromPageId: 'page-source',
        toPageId: 'page-dashboard',
        sourceTarget: '/dashboard',
        matchRule: 'canonical-path',
        confidence: 'high',
      }),
    ]);
  });

  it('treats duplicate canonical paths across origins as ambiguous', () => {
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: [relationCandidate({
        rawTarget: 'https://one.example.test/dashboard',
      })],
    });
    const firstTarget = pageIndex({
      pageId: 'page-dashboard-one',
      fileName: 'dashboard-one.html',
      canonicalRoute: sanitizedRoute('https://one.example.test/dashboard'),
    });
    const secondTarget = pageIndex({
      pageId: 'page-dashboard-two',
      fileName: 'dashboard-two.html',
      canonicalRoute: sanitizedRoute('https://two.example.test/dashboard'),
    });

    const result = buildHtmlPageRelations([secondTarget, source, firstTarget]);

    expect(result.relations).toEqual([]);
    expect(result.warningsByPageId['page-source']).toEqual([
      expect.stringMatching(/ambiguous.*canonical-path/i),
    ]);
  });

  it('matches an exact encoded file path and retains sanitized provenance', () => {
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: [relationCandidate({
        rawTarget: '/account%20details.html?token=secret&view=compact#private',
        sourceDomPath: '/html/body/nav/a:nth-of-type(2)',
        label: 'Account details',
      })],
    });
    const target = pageIndex({
      pageId: 'page-account',
      fileName: 'account details.html',
    });

    expect(buildHtmlPageRelations([source, target]).relations).toEqual([{
      fromPageId: 'page-source',
      toPageId: 'page-account',
      type: 'link',
      label: 'Account details',
      sourceDomPath: '/html/body/nav/a:nth-of-type(2)',
      sourceTarget: '/account%20details.html?token&view',
      matchRule: 'file-path',
      confidence: 'high',
    }]);
  });

  it('uses a unique whole-component path suffix with medium confidence', () => {
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: [relationCandidate({ rawTarget: '/deploy/v2/reports.html' })],
    });
    const target = pageIndex({ pageId: 'page-reports', fileName: 'reports.html' });

    expect(buildHtmlPageRelations([source, target]).relations).toEqual([
      expect.objectContaining({
        fromPageId: 'page-source',
        toPageId: 'page-reports',
        matchRule: 'unique-path-suffix',
        confidence: 'medium',
      }),
    ]);

    const nonComponentSource = pageIndex({
      pageId: 'page-non-component-source',
      fileName: 'non-component-source.html',
      relationCandidates: [relationCandidate({ rawTarget: '/deploy/myreports.html' })],
    });
    expect(buildHtmlPageRelations([nonComponentSource, target]).relations).toEqual([]);
  });

  it('builds form-action relations with their label and DOM path', () => {
    const source = pageIndex({
      pageId: 'page-login',
      fileName: 'login.html',
      relationCandidates: [relationCandidate({
        rawTarget: '/sessions',
        type: 'form-action',
        sourceDomPath: '/html/body/main/form:nth-of-type(1)',
        label: 'Sign in',
      })],
    });
    const target = pageIndex({
      pageId: 'page-session',
      fileName: 'session.html',
      canonicalRoute: sanitizedRoute('/sessions'),
    });

    expect(buildHtmlPageRelations([source, target]).relations).toContainEqual({
      fromPageId: 'page-login',
      toPageId: 'page-session',
      type: 'form-action',
      label: 'Sign in',
      sourceDomPath: '/html/body/main/form:nth-of-type(1)',
      sourceTarget: '/sessions',
      matchRule: 'canonical-path',
      confidence: 'high',
    });
  });

  it('stops at an ambiguous earlier rule and bounds warnings per source page', () => {
    const ambiguousCandidates = Array.from({ length: MAX_HTML_WARNINGS + 5 }, (_, index) =>
      relationCandidate({
        rawTarget: '/shared.html?token=secret',
        sourceDomPath: `/html/body/a:nth-of-type(${index + 1})`,
      })
    );
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      relationCandidates: ambiguousCandidates,
    });
    const firstCanonical = pageIndex({
      pageId: 'page-canonical-a',
      fileName: 'canonical-a.html',
      canonicalRoute: sanitizedRoute('/shared.html'),
    });
    const secondCanonical = pageIndex({
      pageId: 'page-canonical-b',
      fileName: 'canonical-b.html',
      canonicalRoute: sanitizedRoute('/shared.html'),
    });
    const otherwiseExactFile = pageIndex({
      pageId: 'page-file',
      fileName: 'shared.html',
    });

    const result = buildHtmlPageRelations([
      otherwiseExactFile,
      secondCanonical,
      source,
      firstCanonical,
    ]);
    const warnings = result.warningsByPageId['page-source'];

    expect(result.relations).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length).toBeLessThanOrEqual(MAX_HTML_WARNINGS);
    expect(warnings.every((warning) => Array.from(warning).length <= MAX_HTML_WARNING_CHARS))
      .toBe(true);
    expect(warnings.every((warning) => /ambiguous/i.test(warning))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('allows uploaded canonical/base origins but rejects an external origin with the same path', () => {
    const trustedBase = sanitizedRoute('https://trusted.example.test/app/');
    const source = pageIndex({
      pageId: 'page-source',
      fileName: 'source.html',
      baseRoute: trustedBase,
      relationCandidates: [
        relationCandidate({
          rawTarget: 'https://evil.example.test/app/dashboard?token=secret',
          sourceDomPath: '/html/body/a:nth-of-type(1)',
        }),
        relationCandidate({
          rawTarget: 'https://evil.example.test/proxy/app/dashboard?token=secret',
          sourceDomPath: '/html/body/a:nth-of-type(2)',
        }),
        relationCandidate({
          rawTarget: 'https://trusted.example.test/app/dashboard?token=secret',
          sourceDomPath: '/html/body/a:nth-of-type(3)',
        }),
      ],
    });
    const target = pageIndex({
      pageId: 'page-dashboard',
      fileName: 'dashboard.html',
      canonicalRoute: sanitizedRoute('https://trusted.example.test/app/dashboard'),
    });

    const result = buildHtmlPageRelations([source, target]);

    expect(result.relations).toEqual([
      expect.objectContaining({
        toPageId: 'page-dashboard',
        sourceDomPath: '/html/body/a:nth-of-type(3)',
        sourceTarget: 'https://trusted.example.test/app/dashboard?token',
        matchRule: 'canonical-path',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('evil.example.test');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('uses parser-resolved base, dot, percent, fragment, and query sanitation metadata', () => {
    const source = parsedPage('page-source', 'source.html', `<!doctype html><html><head>
      <base href="https://app.example.test/root/forms/">
    </head><body>
      <a href="../%64ashboard/./?view=compact&amp;token=secret#private">Dashboard</a>
    </body></html>`);
    const target = parsedPage('page-dashboard', 'dashboard.html', `<!doctype html><html><head>
      <link rel="canonical" href="https://app.example.test/root/dashboard/">
    </head><body><h1>Dashboard</h1></body></html>`);

    expect(buildHtmlPageRelations([target, source]).relations).toEqual([{
      fromPageId: 'page-source',
      toPageId: 'page-dashboard',
      type: 'link',
      label: 'Dashboard',
      sourceDomPath: expect.stringContaining('/a:nth-of-type(1)'),
      sourceTarget: 'https://app.example.test/root/dashboard/?token&view',
      matchRule: 'canonical-path',
      confidence: 'high',
    }]);
  });

  it('does not match distinct canonical and target paths collapsed by soft truncation', () => {
    const sharedPrefix = 'a'.repeat(MAX_HTML_TEXT_CHARS + 20);
    const source = parsedPage('page-source', 'source.html', `<!doctype html><html><body>
      <a href="/${sharedPrefix}-source-tail">Long target</a>
    </body></html>`);
    const target = parsedPage('page-target', 'target.html', `<!doctype html><html><head>
      <link rel="canonical" href="/${sharedPrefix}-canonical-tail">
    </head><body><h1>Long canonical</h1></body></html>`);
    const candidate = source.relationCandidates[0];

    expect(candidate.target.path).toBe(target.canonicalRoute?.path);
    expect(candidate.target.pathTruncated).toBe(true);
    expect(target.canonicalRoute?.pathTruncated).toBe(true);
    expect(candidate.target.fullPathSha256).not.toBe(target.canonicalRoute?.fullPathSha256);
    expect(buildHtmlPageRelations([source, target]).relations).toEqual([]);
  });

  it('matches identical long canonical full-path identities after truncation', () => {
    const longPath = `/${'c'.repeat(MAX_HTML_TEXT_CHARS + 20)}-shared-tail`;
    const source = parsedPage('page-source', 'source.html', `<!doctype html><html><body>
      <a href="https://one.example.test${longPath}">Long canonical</a>
    </body></html>`);
    const matchingTarget = parsedPage('page-matching', 'matching.html', `<!doctype html><html><head>
      <link rel="canonical" href="https://one.example.test${longPath}">
    </head><body><h1>Matching origin</h1></body></html>`);
    const candidate = source.relationCandidates[0];

    expect(candidate.target.pathTruncated).toBe(true);
    expect(matchingTarget.canonicalRoute?.pathTruncated).toBe(true);
    expect(candidate.target.fullPathSha256).toBe(matchingTarget.canonicalRoute?.fullPathSha256);
    expect(buildHtmlPageRelations([source, matchingTarget]).relations).toEqual([
      expect.objectContaining({
        fromPageId: 'page-source',
        toPageId: 'page-matching',
        matchRule: 'canonical-path',
        confidence: 'high',
      }),
    ]);
  });

  it('matches a full 255-code-point filename but rejects its synthetic bounded alias', () => {
    const fileName = `${'😀'.repeat(250)}.html`;
    const target = parseAndIndexHtml({
      pageId: 'page-long-file',
      fileName,
      source: decodeAndNormalizeHtml(encoder.encode('<h1>Long filename target</h1>')),
    });
    const alias = target.index.routeAliases[0];
    const fullEncodedPath = `/${encodeURIComponent(fileName)}`;
    const source = parseAndIndexHtml({
      pageId: 'page-source',
      fileName: 'source.html',
      source: decodeAndNormalizeHtml(encoder.encode(`<!doctype html><html><body>
        <a href="${fullEncodedPath}">Full filename</a>
        <a href="${alias.path}">Bounded filename alias</a>
      </body></html>`)),
    });

    expect(Array.from(fileName)).toHaveLength(255);
    expect(alias.pathTruncated).toBe(true);
    expect(alias.path).not.toBe(fullEncodedPath);
    expect(alias.normalizedTarget.length).toBeLessThanOrEqual(MAX_HTML_TEXT_CHARS);
    expect(source.index.relationCandidates[0].target.pathTruncated).toBe(true);
    expect(source.index.relationCandidates[1].target.pathTruncated).toBeUndefined();
    expect(source.index.relationCandidates.every((candidate) =>
      candidate.sourceTarget.length <= MAX_HTML_TEXT_CHARS
    )).toBe(true);
    expect([source, target].every((page) =>
      Buffer.byteLength(page.serializedIndex, 'utf8') <= MAX_HTML_INDEX_BYTES
    )).toBe(true);

    expect(buildHtmlPageRelations([source.index, target.index]).relations).toEqual([
      expect.objectContaining({
        fromPageId: 'page-source',
        toPageId: 'page-long-file',
        label: 'Full filename',
        sourceTarget: source.index.relationCandidates[0].sourceTarget,
        matchRule: 'file-path',
        confidence: 'high',
      }),
    ]);
  });

  it('matches a trusted absolute long file identity despite asymmetric display truncation', () => {
    const origin = 'https://trusted.example.test';
    const fileName = `${'😀'.repeat(164)}.html`;
    const fullEncodedPath = `/${encodeURIComponent(fileName)}`;
    const target = parseAndIndexHtml({
      pageId: 'page-long-file',
      fileName,
      source: decodeAndNormalizeHtml(encoder.encode('<h1>Absolute file target</h1>')),
    });
    const source = parseAndIndexHtml({
      pageId: 'page-source',
      fileName: 'source.html',
      source: decodeAndNormalizeHtml(encoder.encode(`<!doctype html><html><head>
        <base href="${origin}/">
      </head><body>
        <a href="${origin}${fullEncodedPath}">Absolute file link</a>
      </body></html>`)),
    });
    const alias = target.index.routeAliases[0];
    const candidate = source.index.relationCandidates[0];

    expect(alias.pathTruncated).toBeUndefined();
    expect(candidate.target.pathTruncated).toBe(true);
    expect(candidate.target.path).not.toBe(alias.path);
    expect(candidate.target.fullPathSha256).toBe(alias.fullPathSha256);
    expect(buildHtmlPageRelations([source.index, target.index]).relations).toEqual([
      expect.objectContaining({
        fromPageId: 'page-source',
        toPageId: 'page-long-file',
        sourceTarget: candidate.sourceTarget,
        matchRule: 'file-path',
        confidence: 'high',
      }),
    ]);
  });

  it('excludes executable, data, file, blob, fragment-only, and unmatched targets', () => {
    const source = parsedPage('page-source', 'source.html', `<!doctype html><html><body>
      <a href="#local">Fragment</a>
      <a href="javascript:alert(1)">JavaScript</a>
      <a href="data:text/html,private">Data</a>
      <a href="file:///private.html">File</a>
      <a href="blob:https://example.test/private">Blob</a>
      <a href="/not-uploaded.html">Missing</a>
    </body></html>`);
    const target = pageIndex({
      pageId: 'page-target',
      fileName: 'target.html',
      canonicalRoute: sanitizedRoute('/target'),
    });

    expect(source.relationCandidates.map((candidate) => candidate.sourceTarget))
      .toEqual(['/not-uploaded.html']);
    expect(buildHtmlPageRelations([source, target]).relations).toEqual([]);
  });

  it('removes self edges without falling through to a weaker rule', () => {
    const self = pageIndex({
      pageId: 'page-self',
      fileName: 'self.html',
      canonicalRoute: sanitizedRoute('/self'),
      relationCandidates: [
        relationCandidate({ rawTarget: '/self' }),
        relationCandidate({
          rawTarget: '/self.html',
          sourceDomPath: '/html/body/a:nth-of-type(2)',
        }),
      ],
    });

    expect(buildHtmlPageRelations([self])).toEqual({
      relations: [],
      warningsByPageId: {},
    });
  });

  it('deduplicates and sorts independently of page and candidate input order', () => {
    const alphaTarget = pageIndex({
      pageId: 'page-alpha',
      fileName: 'alpha.html',
      canonicalRoute: sanitizedRoute('/alpha'),
    });
    const betaTarget = pageIndex({
      pageId: 'page-beta',
      fileName: 'beta.html',
      canonicalRoute: sanitizedRoute('/beta'),
    });
    const alphaLink = relationCandidate({
      rawTarget: '/alpha',
      sourceDomPath: '/html/body/shared',
    });
    const betaLink = relationCandidate({
      rawTarget: '/beta',
      sourceDomPath: '/html/body/shared',
    });
    const betaForm = relationCandidate({
      rawTarget: '/beta',
      type: 'form-action',
      sourceDomPath: '/html/body/shared',
    });
    const sourceA = pageIndex({
      pageId: 'page-source-a',
      fileName: 'A-source.html',
      relationCandidates: [betaLink, alphaLink, betaForm, alphaLink],
    });
    const sourceAReversed = pageIndex({
      pageId: 'page-source-a',
      fileName: 'A-source.html',
      relationCandidates: [alphaLink, betaForm, alphaLink, betaLink],
    });
    const sourceZ = pageIndex({
      pageId: 'page-source-z',
      fileName: 'z-source.html',
      relationCandidates: [relationCandidate({
        rawTarget: '/alpha',
        sourceDomPath: '/html/body/a',
      })],
    });

    const first = buildHtmlPageRelations([betaTarget, sourceZ, sourceA, alphaTarget]);
    const second = buildHtmlPageRelations([sourceAReversed, alphaTarget, sourceZ, betaTarget]);

    expect(second).toEqual(first);
    expect(first.relations.map((relation) => [
      relation.fromPageId,
      relation.sourceDomPath,
      relation.type,
      relation.sourceTarget,
    ])).toEqual([
      ['page-source-a', '/html/body/shared', 'form-action', '/beta'],
      ['page-source-a', '/html/body/shared', 'link', '/alpha'],
      ['page-source-a', '/html/body/shared', 'link', '/beta'],
      ['page-source-z', '/html/body/a', 'link', '/alpha'],
    ]);
  });

  it('allows 2,000 deduplicated relations and hard-fails on the next one', () => {
    const target = pageIndex({ pageId: 'page-target', fileName: 'target.html' });
    const candidates = (count: number, prefix: string) => Array.from({ length: count }, (_, index) =>
      relationCandidate({
        rawTarget: '/target.html',
        sourceDomPath: `/html/body/${prefix}:nth-of-type(${index + 1})`,
      })
    );
    const firstThousand = pageIndex({
      pageId: 'page-source-a',
      fileName: 'source-a.html',
      relationCandidates: candidates(1_000, 'a'),
    });
    const secondThousand = pageIndex({
      pageId: 'page-source-b',
      fileName: 'source-b.html',
      relationCandidates: candidates(1_000, 'a'),
    });

    expect(buildHtmlPageRelations([target, firstThousand, secondThousand]).relations)
      .toHaveLength(MAX_HTML_PAGE_RELATIONS);

    const overLimit = pageIndex({
      pageId: 'page-source-b',
      fileName: 'source-b.html',
      relationCandidates: candidates(1_001, 'a'),
    });
    expect(() => buildHtmlPageRelations([target, firstThousand, overLimit]))
      .toThrow(/2,?000 relations/i);
  });
});
