// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  normalizeHtmlFileName,
  normalizeStaticText,
  sanitizeHtmlRoute,
  tokenizeHtmlKnowledge,
} from '../html-knowledge/normalization.ts';
import {
  decodeAndNormalizeHtml,
  parseAndIndexHtml,
} from '../html-knowledge/parser.ts';
import {
  MAX_HTML_CHUNKS,
  MAX_HTML_DOM_DEPTH,
  MAX_HTML_DOM_NODES,
  MAX_HTML_ELEMENTS,
  MAX_HTML_INDEX_BYTES,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_SELECT_OPTIONS,
  MAX_HTML_TEXT_CHARS,
  MAX_HTML_WARNINGS,
  MAX_HTML_WARNING_CHARS,
} from '../html-knowledge/types.ts';
import {
  ADVERSARIAL_HTML,
  DASHBOARD_HTML,
  HEADING_SECTIONS_HTML,
  LOGIN_HTML,
  MALFORMED_HTML,
  SPA_SHELL_HTML,
  makeChunkHeavyHtml,
  makeCandidateHeavyHtml,
  makeDeepHtml,
  makeElementHeavyHtml,
  makeIndexHeavyHtml,
  makeNodeHeavyHtml,
  makeSelectHtml,
  makeWarningAndSelectHtml,
  makeWarningHeavyHtml,
} from './fixtures/html-knowledge-fixtures.ts';

const encoder = new TextEncoder();

function fullPathSha256(path: string): string {
  return createHash('sha256').update(path).digest('hex');
}

function indexHtml(html: string, fileName = 'page.html', pageId = 'page-1') {
  return parseAndIndexHtml({
    pageId,
    fileName,
    source: decodeAndNormalizeHtml(encoder.encode(html)),
  });
}

describe('HTML knowledge normalization', () => {
  it('normalizes file names to NFC and returns a stable case-folded key', () => {
    expect(normalizeHtmlFileName('Cafe\u0301.HTML')).toEqual({
      displayName: 'Café.HTML',
      key: 'café.html',
    });
  });

  it('accepts exactly 255 filename code points and rejects 256', () => {
    const exact = `${'😀'.repeat(250)}.html`;
    const over = `${'😀'.repeat(251)}.html`;

    expect(Array.from(exact)).toHaveLength(255);
    expect(normalizeHtmlFileName(exact).displayName).toBe(exact);
    expect(Array.from(over)).toHaveLength(256);
    expect(() => normalizeHtmlFileName(over)).toThrow(/255 Unicode code points/);
  });

  it.each([
    '',
    'not-html.txt',
    'folder/page.html',
    'folder\\page.html',
    'nul\0page.html',
    'control\u0001page.html',
    'bidi\u202Epage.html',
    `${'😀'.repeat(256)}.html`,
  ])('rejects unsafe HTML file name %j', (fileName) => {
    expect(() => normalizeHtmlFileName(fileName)).toThrow();
  });

  it('normalizes and bounds static text without splitting Unicode code points', () => {
    expect(normalizeStaticText('  Fullwidth：ＡＢＣ\r\n next\tvalue  ')).toBe('Fullwidth:ABC next value');
    expect(normalizeStaticText('😀😀😀', 2)).toBe('😀😀');
  });

  it('tokenizes normalized Latin/numeric terms and CJK bigrams deterministically', () => {
    expect(tokenizeHtmlKnowledge('Ｆｉｅｌｄ 42 登录页面')).toEqual([
      'field',
      '42',
      '登录',
      '录页',
      '页面',
    ]);
  });

  it('preserves signed numeric boundaries and decimals as distinct exact tokens', () => {
    expect(tokenizeHtmlKnowledge('-1 1 +2.5 2.5 -0.75')).toEqual([
      '-1',
      '1',
      '+2.5',
      '2.5',
      '-0.75',
    ]);
    expect(tokenizeHtmlKnowledge('-1')).not.toContain('1');

    const indexed = indexHtml(
      '<form><input min="-1" max="+2.5" step="0.25"></form>',
      'numeric.html',
      'page-numeric',
    );
    const searchTerms = indexed.index.chunks.flatMap((item) => item.searchTerms);
    expect(searchTerms).toEqual(expect.arrayContaining(['-1', '+2.5', '0.25']));
  });

  it('sanitizes HTTP and relative routes without retaining credentials or query values', () => {
    expect(sanitizeHtmlRoute(
      'https://user:password@Example.test/a/../dashboard?token=secret&lang=en&token=again#private',
    )).toEqual({
      normalizedTarget: 'https://example.test/dashboard?lang&token',
      origin: 'https://example.test',
      path: '/dashboard',
      queryParameterNames: ['lang', 'token'],
      fullPathSha256: fullPathSha256('/dashboard'),
    });

    expect(sanitizeHtmlRoute('../reports?z=private&a=visible', 'https://example.test/app/pages/'))
      .toEqual({
        normalizedTarget: 'https://example.test/app/reports?a&z',
        origin: 'https://example.test',
        path: '/app/reports',
        queryParameterNames: ['a', 'z'],
        fullPathSha256: fullPathSha256('/app/reports'),
      });

    expect(sanitizeHtmlRoute('https:Example.test/account?=ignored&view=private')).toEqual({
      normalizedTarget: 'https://example.test/account?view',
      origin: 'https://example.test',
      path: '/account',
      queryParameterNames: ['view'],
      fullPathSha256: fullPathSha256('/account'),
    });
  });

  it.each([
    '#local',
    'javascript:alert(1)',
    'data:text/html;base64,private',
    'file:///etc/passwd',
    'blob:https://example.test/private',
    'mailto:test@example.test',
  ])('rejects non-route target %j', (target) => {
    expect(sanitizeHtmlRoute(target)).toBeNull();
  });

  it('rejects backslash routes and bases before URL normalization can reinterpret their origin', () => {
    expect(sanitizeHtmlRoute('\\\\evil.example/path')).toBeNull();
    expect(sanitizeHtmlRoute('/\\\\evil.example/path')).toBeNull();
    expect(sanitizeHtmlRoute('target', '\\\\evil.example/base/')).toBeNull();
    expect(sanitizeHtmlRoute('target', '/\\\\evil.example/base/')).toBeNull();
  });
});

describe('decodeAndNormalizeHtml', () => {
  it('hashes the raw bytes, removes one leading BOM, and normalizes line endings', () => {
    const raw = encoder.encode('\uFEFF<!doctype html>\r\n<p>café</p>\rend');

    expect(decodeAndNormalizeHtml(raw)).toEqual({
      byteSize: raw.byteLength,
      sha256: createHash('sha256').update(raw).digest('hex'),
      normalizedHtml: '<!doctype html>\n<p>café</p>\nend',
    });
  });

  it('uses fatal UTF-8 decoding and rejects raw or decoded NULs', () => {
    expect(() => decodeAndNormalizeHtml(Uint8Array.from([0xc3, 0x28]))).toThrow();
    expect(() => decodeAndNormalizeHtml(Uint8Array.from([0x3c, 0x00, 0x3e]))).toThrow(/NUL/i);
  });

  it('enforces the raw 512 KiB limit before decoding', () => {
    const exactLimit = new Uint8Array(MAX_HTML_PAGE_BYTES).fill(0x20);
    expect(decodeAndNormalizeHtml(exactLimit)).toMatchObject({
      byteSize: MAX_HTML_PAGE_BYTES,
    });
    expect(() => decodeAndNormalizeHtml(new Uint8Array(MAX_HTML_PAGE_BYTES + 1)))
      .toThrow(/512 KiB/i);
  });

  it('accepts a complete multibyte code point at 512 KiB and rejects the next byte', () => {
    const exactLimit = encoder.encode(`${'a'.repeat(MAX_HTML_PAGE_BYTES - 2)}é`);
    const overLimit = encoder.encode(`${'a'.repeat(MAX_HTML_PAGE_BYTES - 2)}€`);

    expect(exactLimit.byteLength).toBe(MAX_HTML_PAGE_BYTES);
    expect(decodeAndNormalizeHtml(exactLimit).normalizedHtml.endsWith('é')).toBe(true);
    expect(overLimit.byteLength).toBe(MAX_HTML_PAGE_BYTES + 1);
    expect(() => decodeAndNormalizeHtml(overLimit)).toThrow(/512 KiB/i);
  });
});

describe('parseAndIndexHtml', () => {
  it('extracts deterministic form knowledge, constraints, labels, routes, and source lines', () => {
    const source = decodeAndNormalizeHtml(encoder.encode(LOGIN_HTML));
    const first = parseAndIndexHtml({
      pageId: 'page-login',
      fileName: 'login.html',
      source,
    });
    const second = parseAndIndexHtml({
      pageId: 'page-login',
      fileName: 'login.html',
      source,
    });

    expect(first).toEqual(second);
    expect(first.serializedIndex).toBe(JSON.stringify(first.index));
    expect(first.pageTitle).toBe('Sign in');
    expect(first.informationLevel).toBe('NORMAL');
    expect(first.index.canonicalRoute).toMatchObject({
      normalizedTarget: 'https://example.test/app/login.html?tenant',
      path: '/app/login.html',
      queryParameterNames: ['tenant'],
    });

    const formChunk = first.index.chunks.find((chunk) => chunk.sectionType === 'form');
    expect(formChunk).toBeDefined();
    expect(formChunk?.domPath).toMatch(/^\/html:nth-of-type\(1\)\/body:nth-of-type\(1\)/);
    expect(formChunk?.sourceLocation).toEqual(expect.objectContaining({
      startLine: expect.any(Number),
      endLine: expect.any(Number),
    }));
    expect(formChunk?.sourceLocation?.startLine).toBeGreaterThan(1);

    const expectedChunkId = `hkc-${createHash('sha256')
      .update(`${source.sha256}\0form\0${formChunk?.domPath}`)
      .digest('hex')
      .slice(0, 24)}`;
    expect(formChunk?.id).toBe(expectedChunkId);

    const email = formChunk?.elements.find((element) => element.dataTestId === 'login-email');
    expect(email).toMatchObject({
      tagName: 'input',
      inputType: 'email',
      label: 'Email address',
      accessibleNameCandidate: 'Email address',
      id: 'email',
      name: 'email',
      required: true,
      minLength: 5,
      maxLength: 120,
      pattern: '[^@]+@[^@]+',
      validationText: 'Use your work email. Enter a valid email address.',
      ariaAttributes: {
        'aria-label': 'Ignored email label',
        'aria-describedby': 'email-help email-error',
      },
      sourceLocation: expect.objectContaining({ startLine: expect.any(Number) }),
    });

    const password = formChunk?.elements.find((element) => element.id === 'password');
    expect(password).toMatchObject({
      accessibleNameCandidate: 'Password',
      readOnly: true,
    });

    const form = formChunk?.elements.find((element) => element.tagName === 'form');
    expect(form).toMatchObject({
      action: 'https://example.test/sessions?csrf&returnTo',
      method: 'post',
    });
    expect(first.serializedIndex).not.toContain('secret-value');
    expect(Buffer.byteLength(first.serializedIndex, 'utf8')).toBeLessThanOrEqual(MAX_HTML_INDEX_BYTES);
  });

  it('builds each semantic chunk category and does not duplicate covered controls in generic chunks', () => {
    const login = indexHtml(LOGIN_HTML, 'login.html', 'page-login');
    const dashboard = indexHtml(DASHBOARD_HTML, 'dashboard.html', 'page-dashboard');
    const interactive = indexHtml(
      '<!doctype html><html><body><div><button data-testid="standalone">Refresh</button></div></body></html>',
      'interactive.html',
      'page-interactive',
    );
    const sectionTypes = new Set([
      ...login.index.chunks.map((chunk) => chunk.sectionType),
      ...dashboard.index.chunks.map((chunk) => chunk.sectionType),
      ...interactive.index.chunks.map((chunk) => chunk.sectionType),
    ]);

    expect(sectionTypes).toEqual(new Set([
      'navigation',
      'form',
      'content',
      'dialog',
      'table',
      'validation',
      'interactive',
    ]));

    const loginEmailOccurrences = login.index.chunks.flatMap((chunk) => chunk.elements)
      .filter((element) => element.dataTestId === 'login-email');
    expect(loginEmailOccurrences).toHaveLength(1);

    const overviewOccurrences = dashboard.index.chunks.flatMap((chunk) => chunk.elements)
      .filter((element) => element.accessibleNameCandidate === 'Overview');
    expect(overviewOccurrences).toHaveLength(1);
  });

  it('indexes hierarchical heading ranges including bare and nested text with spanning source lines', () => {
    const indexed = indexHtml(HEADING_SECTIONS_HTML, 'headings.html', 'page-headings');
    const contentChunks = indexed.index.chunks.filter((chunk) => chunk.sectionType === 'content');
    const account = contentChunks.find((chunk) => chunk.heading === 'Account');
    const details = contentChunks.find((chunk) => chunk.heading === 'Details');
    const deepDetail = contentChunks.find((chunk) => chunk.heading === 'Deep detail');

    expect(account?.staticText).toBe(
      'Account Bare account text Nested account text Details Bare details text '
      + 'Nested details text Deep detail Deep nested text Second details Second details text',
    );
    expect(account?.sourceLocation).toEqual({ startLine: 4, endLine: 17 });
    expect(details?.staticText).toBe(
      'Details Bare details text Nested details text Deep detail Deep nested text',
    );
    expect(details?.sourceLocation).toEqual({ startLine: 9, endLine: 15 });
    expect(deepDetail?.staticText).toBe('Deep detail Deep nested text');
    expect(deepDetail?.sourceLocation).toEqual({ startLine: 13, endLine: 14 });
  });

  it('does not let headings owned by semantic regions terminate an outer heading range', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <h1>Outer section</h1>
      <p>Before regions</p>
      <form><h1>Form heading</h1><input name="query"></form>
      <p>After form</p>
      <nav><h1>Navigation heading</h1><a href="/next">Next</a></nav>
      <p>After navigation</p>
      <dialog><h1>Dialog heading</h1><button>Close</button></dialog>
      <p>After dialog</p>
      <table><caption><h1>Table heading</h1></caption><tr><td>Cell</td></tr></table>
      <p>After table</p>
      <div role="alert"><h1>Alert heading</h1></div>
      <p>After alert</p>
      <ul>
        <li><h1>Link-list heading</h1><a href="/one">One</a></li>
        <li><a href="/two">Two</a></li>
      </ul>
      <p>After link list</p>
      <h1>Next section</h1>
      <p>Next content</p>
    </body></html>`, 'owned-headings.html');
    const outer = indexed.index.chunks.find((chunk) =>
      chunk.sectionType === 'content' && chunk.heading === 'Outer section'
    );

    expect(outer?.staticText).toContain('After form');
    expect(outer?.staticText).toContain('After navigation');
    expect(outer?.staticText).toContain('After dialog');
    expect(outer?.staticText).toContain('After table');
    expect(outer?.staticText).toContain('After alert');
    expect(outer?.staticText).toContain('After link list');
    expect(outer?.staticText).not.toContain('Next section');
  });

  it('walks template content and parses malformed full documents tolerantly', () => {
    const dashboard = indexHtml(DASHBOARD_HTML, 'dashboard.html', 'page-dashboard');
    expect(dashboard.index.chunks.some((chunk) =>
      chunk.elements.some((element) => element.dataTestId === 'template-query')
    )).toBe(true);

    const malformed = indexHtml(MALFORMED_HTML, 'malformed.html', 'page-malformed');
    expect(malformed.pageTitle).toBe('Recovered page Malformed but useful content Recovery code Recover');
    expect(malformed.index.chunks.some((chunk) => chunk.sectionType === 'form')).toBe(true);
  });

  it('ignores template metadata while retaining controls from template content', () => {
    const indexed = indexHtml(`<!doctype html><html><head>
      <template>
        <title>TEMPLATE-TITLE-SECRET</title>
        <base href="https://template-base-secret.test/private/">
        <link rel="canonical" href="https://template-canonical-secret.test/private">
        <form aria-label="Deferred filter" action="filter?token=private">
          <input data-testid="template-filter">
        </form>
      </template>
      <title>Real document title</title>
      <base href="https://real.example/app/">
      <link rel="canonical" href="canonical.html?view=private">
    </head><body><h1>Real heading</h1></body></html>`, 'template-metadata.html');
    const elements = indexed.index.chunks.flatMap((chunk) => chunk.elements);

    expect(indexed.pageTitle).toBe('Real document title');
    expect(indexed.index.baseRoute?.normalizedTarget).toBe('https://real.example/app/');
    expect(indexed.index.canonicalRoute?.normalizedTarget)
      .toBe('https://real.example/app/canonical.html?view');
    expect(elements.some((element) => element.dataTestId === 'template-filter')).toBe(true);
    expect(elements.find((element) => element.tagName === 'form')?.action)
      .toBe('https://real.example/app/filter?token');
    expect(indexed.serializedIndex).not.toContain('TEMPLATE-TITLE-SECRET');
    expect(indexed.serializedIndex).not.toContain('template-base-secret');
    expect(indexed.serializedIndex).not.toContain('template-canonical-secret');
  });

  it('isolates template headings from active-document title fallback and section boundaries', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <template>
        <h1>Deferred first section</h1>
        <p>Deferred first content</p>
      </template>
      <h1>Active section</h1>
      <p>Before deferred region</p>
      <template>
        <h1>Deferred second section</h1>
        <p>Deferred second content</p>
      </template>
      <p>After deferred region</p>
      <h1>Next active section</h1>
      <p>Next active content</p>
    </body></html>`, 'template-headings.html');
    const contentChunks = indexed.index.chunks.filter((chunk) => chunk.sectionType === 'content');
    const active = contentChunks.find((chunk) => chunk.heading === 'Active section');

    expect(indexed.pageTitle).toBe('Active section');
    expect(active?.staticText).toContain('After deferred region');
    expect(active?.staticText).not.toContain('Deferred second section');
    expect(active?.staticText).not.toContain('Next active section');
    expect(contentChunks.some((chunk) =>
      chunk.heading === 'Deferred first section'
      && chunk.staticText.includes('Deferred first content')
    )).toBe(true);
    expect(contentChunks.some((chunk) =>
      chunk.heading === 'Deferred second section'
      && chunk.staticText.includes('Deferred second content')
    )).toBe(true);
  });

  it('uses the first heading and then the file stem when the title is unavailable', () => {
    expect(indexHtml('<h1>Heading title</h1>', 'heading.html').pageTitle).toBe('Heading title');
    expect(indexHtml('<div id="root"></div>', 'Fallback.HTML').pageTitle).toBe('Fallback');
  });

  it('caps page titles at exactly 200 characters and warns only when truncated', () => {
    const exactTitle = 't'.repeat(200);
    const exact = indexHtml(`<title>${exactTitle}</title>`, 'exact-title.html');
    const over = indexHtml(`<title>${exactTitle}x</title>`, 'over-title.html');

    expect(exact.pageTitle).toBe(exactTitle);
    expect(exact.warnings.some((warning) => warning.includes('Page title'))).toBe(false);
    expect(over.pageTitle).toBe(exactTitle);
    expect(over.warnings.some((warning) => warning.includes('Page title'))).toBe(true);
  });

  it('treats URL delimiters in file route aliases as filename characters', () => {
    const indexed = indexHtml('<h1>Route alias</h1>', 'report ?#%.html');

    expect(indexed.index.routeAliases).toEqual([{
      normalizedTarget: '/report%20%3F%23%25.html',
      origin: null,
      path: '/report%20%3F%23%25.html',
      queryParameterNames: [],
      fullPathSha256: fullPathSha256('/report%20%3F%23%25.html'),
    }]);
  });

  it('keeps a long percent-encoded filename alias URI-decodable', () => {
    const fileName = `${'😀'.repeat(250)}.html`;
    const indexed = indexHtml('<h1>Long route alias</h1>', fileName);
    const alias = indexed.index.routeAliases[0];

    expect(alias.path.length).toBeLessThanOrEqual(MAX_HTML_TEXT_CHARS);
    expect(() => decodeURI(alias.path)).not.toThrow();
    expect(decodeURI(alias.path)).toMatch(/\.html$/u);
    expect(alias.normalizedTarget).toBe(alias.path);
  });

  it('keeps bounded Unicode base, canonical, href, and form-action routes URI-decodable', () => {
    const longPath = '😀'.repeat(300);
    const indexed = indexHtml(`<!doctype html><html><head>
      <base href="https://example.test/${longPath}/">
      <link rel="canonical" href="https://example.test/${longPath}/canonical">
    </head><body>
      <h1>Unicode routes</h1>
      <a href="/${longPath}/target?view=private">Target</a>
      <form action="/${longPath}/submit?token=private"><button>Submit</button></form>
    </body></html>`, 'unicode-routes.html');
    const elements = indexed.index.chunks.flatMap((chunk) => chunk.elements);
    const routes = [
      indexed.index.baseRoute,
      indexed.index.canonicalRoute,
      elements.find((element) => element.tagName === 'a')?.href,
      elements.find((element) => element.tagName === 'form')?.action,
    ];

    expect(routes.every(Boolean)).toBe(true);
    for (const route of routes) {
      const path = typeof route === 'string' ? new URL(route, 'https://relative.invalid').pathname : route!.path;
      expect(path.length).toBeLessThanOrEqual(MAX_HTML_TEXT_CHARS);
      expect(() => decodeURI(path)).not.toThrow();
    }
  });

  it('budgets high-cardinality query names in one deterministic Set-based pass', () => {
    const parameterNames = Array.from(
      { length: 600 },
      (_, index) => `parameter-${index.toString().padStart(3, '0')}-${'x'.repeat(12)}`,
    );
    const query = parameterNames.map((name) => `${name}=private`).join('&amp;');
    const html = `<!doctype html><html><body><h1>Query budget</h1>
      <a data-testid="query-link" href="/target?${query}">Target</a>
    </body></html>`;
    const originalIndexOf = Array.prototype.indexOf;
    let largeArrayIndexOfCalls = 0;
    const indexOfSpy = vi.spyOn(Array.prototype, 'indexOf').mockImplementation(function (
      this: unknown[],
      searchElement: unknown,
      fromIndex?: number,
    ) {
      if (this.length >= parameterNames.length) largeArrayIndexOfCalls += 1;
      return originalIndexOf.call(this, searchElement, fromIndex);
    });
    let indexed!: ReturnType<typeof indexHtml>;
    try {
      indexed = indexHtml(html, 'query-budget.html');
    } finally {
      indexOfSpy.mockRestore();
    }

    const relation = indexed.index.relationCandidates.find((candidate) => candidate.type === 'link');
    const retainedNames = relation?.target.queryParameterNames ?? [];
    const repeated = indexHtml(html, 'query-budget.html');
    const dropWarnings = indexed.warnings.filter((warning) =>
      warning.includes('query parameter') && warning.includes('dropped')
    );

    expect(largeArrayIndexOfCalls).toBe(0);
    expect(retainedNames.length).toBeLessThan(parameterNames.length);
    expect(new Set(retainedNames).size).toBe(retainedNames.length);
    expect(relation?.target.normalizedTarget.length).toBeLessThanOrEqual(MAX_HTML_TEXT_CHARS);
    expect(dropWarnings).toHaveLength(1);
    expect(repeated.serializedIndex).toBe(indexed.serializedIndex);
  });

  it('keeps only allowlisted inert evidence from adversarial markup', () => {
    delete (globalThis as Record<string, unknown>).__htmlKnowledgeExecuted;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const indexed = indexHtml(ADVERSARIAL_HTML, 'adversarial.html', 'page-adversarial');

    expect((globalThis as Record<string, unknown>).__htmlKnowledgeExecuted).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(indexed.serializedIndex).toContain('Visible validation evidence.');
    expect(indexed.serializedIndex).toContain('Safe account');
    expect(indexed.serializedIndex).not.toContain('globalThis.__htmlKnowledgeExecuted');
    expect(indexed.serializedIndex).not.toContain('script-secret');
    expect(indexed.serializedIndex).not.toContain('COMMENT-INJECTION');
    expect(indexed.serializedIndex).not.toContain('style-secret');
    expect(indexed.serializedIndex).not.toContain('SVG-PATH-SECRET');
    expect(indexed.serializedIndex).not.toContain('BASE64-SECRET');
    expect(indexed.serializedIndex).not.toContain('DATA-URL-SECRET');
    expect(indexed.serializedIndex).not.toContain('SRCDOC-SECRET');
    expect(indexed.serializedIndex).not.toContain('refresh-secret');
    expect(indexed.serializedIndex).not.toContain('EVENT-HANDLER-SECRET');
    expect(indexed.serializedIndex).not.toContain('FORM-HANDLER-SECRET');
    expect(indexed.serializedIndex).not.toContain('secret-value');
    expect(indexed.serializedIndex).not.toContain('TEXTAREA-SECRET');
    expect(indexed.serializedIndex).not.toContain('query-secret');
    expect(indexed.serializedIndex).not.toContain('form-secret');
    expect(indexed.serializedIndex).not.toContain('user-secret');
    expect(indexed.serializedIndex).not.toContain('password-secret');

    const accountLink = indexed.index.chunks.flatMap((chunk) => chunk.elements)
      .find((element) => element.accessibleNameCandidate === 'Safe account');
    expect(accountLink?.href).toBe('https://example.test/safe?token&view');
    expect(indexed.warnings.some((warning) => warning.includes('event handler'))).toBe(true);
  });

  it('extracts option labels, nearby alerts, and sanitized image-map links', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <form>
        <input id="code" name="code">
        <span role="alert">The code is invalid.</span>
        <select id="status" multiple disabled>
          <option label="Ready label" value="ready">Fallback option text</option>
        </select>
      </form>
      <map name="details-map">
        <area alt="Details area" href="/details?token=secret#private">
      </map>
    </body></html>`, 'controls.html');
    const elements = indexed.index.chunks.flatMap((chunk) => chunk.elements);

    expect(elements.find((element) => element.id === 'code')?.validationText)
      .toBe('The code is invalid.');
    expect(elements.find((element) => element.id === 'status')).toMatchObject({
      disabled: true,
      multiple: true,
      options: [{ label: 'Ready label', value: 'ready' }],
    });
    expect(elements.find((element) => element.tagName === 'area')).toMatchObject({
      accessibleNameCandidate: 'Details area',
      href: '/details?token',
    });
  });

  it('keeps nearest validation sibling ordering with a right-side tie break', () => {
    const indexed = indexHtml(
      '<!doctype html><html><body><form>'
      + '<span role="alert">Far left</span><i></i>'
      + '<span role="alert">Left tie</span><input id="tie"><span role="status">Right tie</span>'
      + '<i></i><input id="nearest-left"><i></i><i></i><span aria-live="polite">Far right</span>'
      + '</form></body></html>',
      'nearest-validation.html',
    );
    const elements = indexed.index.chunks.flatMap((chunk) => chunk.elements);

    expect(elements.find((element) => element.id === 'tie')?.validationText).toBe('Right tie');
    expect(elements.find((element) => element.id === 'nearest-left')?.validationText).toBe('Right tie');
  });

  it('excludes SVG-descendant options when indexing a select', () => {
    const indexed = indexHtml(`<!doctype html><html><body><form>
      <select id="choice">
        <option value="safe">Safe option</option>
        <template>
          <svg><foreignObject>
            <option label="SVG-OPTION-SECRET" value="svg-option-secret">Ignored</option>
          </foreignObject></svg>
        </template>
      </select>
    </form></body></html>`, 'svg-options.html');
    const select = indexed.index.chunks.flatMap((chunk) => chunk.elements)
      .find((element) => element.id === 'choice');

    expect(select?.options).toEqual([{ label: 'Safe option', value: 'safe' }]);
    expect(indexed.serializedIndex).not.toContain('SVG-OPTION-SECRET');
    expect(indexed.serializedIndex).not.toContain('svg-option-secret');
  });

  it('skips whitespace-only text siblings when deriving a nearby accessible name', () => {
    const indexed = indexHtml(`<!doctype html><html><body><form>
      <span>Customer reference</span>
      
      <input id="reference">
    </form></body></html>`, 'nearby-name.html');
    const input = indexed.index.chunks.flatMap((chunk) => chunk.elements)
      .find((element) => element.id === 'reference');

    expect(input?.accessibleNameCandidate).toBe('Customer reference');
  });

  it('scopes labels and ID references to the active document or owning template', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <svg><foreignObject>
        <span id="shared-name">SVG-WRONG-NAME</span>
        <span id="svg-only-name">SVG-ONLY-NAME</span>
      </foreignObject></svg>
      <span id="shared-name">Active name</span>
      <form>
        <input id="active-field" aria-labelledby="shared-name">
        <input id="svg-only-field" aria-labelledby="svg-only-name">
      </form>
      <template>
        <span id="shared-name">Template name</span>
        <label for="active-field">TEMPLATE-WRONG-LABEL</label>
        <label for="template-field">Template explicit label</label>
        <form>
          <input id="template-field">
          <input id="template-aria" aria-labelledby="shared-name">
        </form>
      </template>
    </body></html>`, 'scoped-labels.html');
    const indexedElements = indexed.index.chunks.flatMap((chunk) => chunk.elements);

    expect(indexedElements.find((element) => element.id === 'active-field')?.accessibleNameCandidate)
      .toBe('Active name');
    expect(indexedElements.find((element) => element.id === 'svg-only-field')?.accessibleNameCandidate)
      .toBeUndefined();
    expect(indexedElements.find((element) => element.id === 'template-field')).toMatchObject({
      label: 'Template explicit label',
      accessibleNameCandidate: 'Template explicit label',
    });
    expect(indexedElements.find((element) => element.id === 'template-aria')?.accessibleNameCandidate)
      .toBe('Template name');
    expect(indexed.serializedIndex).not.toContain('SVG-WRONG-NAME');
    expect(indexed.serializedIndex).not.toContain('SVG-ONLY-NAME');
    expect(indexed.serializedIndex).not.toContain('TEMPLATE-WRONG-LABEL');
  });

  it('does not expose template-host subtree text to active IDREF or nearby-name resolution', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <div>
        <template id="template-host"><span>TEMPLATE-HOST-SECRET</span></template>
      </div>
      <form>
        <button id="active-button" aria-labelledby="template-host"></button>
        <template><span>ADJACENT-TEMPLATE-SECRET</span></template>
        <input id="adjacent-input">
      </form>
      <template>
        <span id="template-internal-label">Template internal label</span>
        <form><input id="template-internal-input" aria-labelledby="template-internal-label"></form>
      </template>
    </body></html>`, 'template-host-text.html');
    const indexedElements = indexed.index.chunks.flatMap((chunk) => chunk.elements);

    expect(indexedElements.find((element) => element.id === 'active-button')?.accessibleNameCandidate)
      .toBeUndefined();
    expect(indexedElements.find((element) => element.id === 'adjacent-input')?.accessibleNameCandidate)
      .toBeUndefined();
    expect(indexedElements.find((element) => element.id === 'template-internal-input')?.accessibleNameCandidate)
      .toBe('Template internal label');
    expect(indexed.serializedIndex).not.toContain('TEMPLATE-HOST-SECRET');
  });

  it('reuses bounded normalized text for many controls sharing one large label', () => {
    const labelParts = Array.from(
      { length: 800 },
      (_, index) => `<span>shared-label-segment-${index}</span>`,
    ).join('');
    const controls = Array.from(
      { length: 100 },
      (_, index) => `<input data-testid="shared-control-${index}" aria-labelledby="shared-label">`,
    ).join('');
    const html = `<!doctype html><html><body>
      <div id="shared-label">${labelParts}</div>
      <form>${controls}</form>
    </body></html>`;
    const originalSlice = Array.prototype.slice;
    let largeTextArraySlices = 0;
    const sliceSpy = vi.spyOn(Array.prototype, 'slice').mockImplementation(function (
      this: unknown[],
      start?: number,
      end?: number,
    ) {
      if (this.length >= 800) largeTextArraySlices += 1;
      return originalSlice.call(this, start, end);
    });
    let indexed!: ReturnType<typeof indexHtml>;
    try {
      indexed = indexHtml(html, 'shared-label.html');
    } finally {
      sliceSpy.mockRestore();
    }
    const names = indexed.index.chunks.flatMap((chunk) => chunk.elements)
      .filter((element) => element.dataTestId?.startsWith('shared-control-'))
      .map((element) => element.accessibleNameCandidate);

    expect(names).toHaveLength(100);
    expect(new Set(names).size).toBe(1);
    expect(Array.from(names[0] ?? '')).toHaveLength(MAX_HTML_TEXT_CHARS);
    expect(largeTextArraySlices).toBeLessThan(10);
  });

  it('bounds sibling-evidence operations for 1,999 controls among about 40k inert siblings', () => {
    const controlCount = MAX_HTML_ELEMENTS - 1;
    const inertSiblingCount = 40_000;
    const inertPerControl = Math.floor(inertSiblingCount / controlCount);
    const trailingInertCount = inertSiblingCount - inertPerControl * controlCount;
    const children = Array.from(
      { length: controlCount },
      (_, index) => `<input id="control-${index}">${'<i></i>'.repeat(inertPerControl)}`,
    ).join('') + '<i></i>'.repeat(trailingInertCount);
    const html = `<!doctype html><html><body><form>${children}</form></body></html>`;
    const siblingCount = controlCount + inertSiblingCount;
    const operationLimit = MAX_HTML_DOM_NODES * 4;
    const originalIndexOf = Array.prototype.indexOf;
    const originalMapGet = Map.prototype.get;
    let fullSiblingIndexScans = 0;
    let siblingRecordLookups = 0;

    expect(encoder.encode(html).byteLength).toBeLessThanOrEqual(MAX_HTML_PAGE_BYTES);

    const indexOfSpy = vi.spyOn(Array.prototype, 'indexOf').mockImplementation(function (
      this: unknown[],
      searchElement: unknown,
      fromIndex?: number,
    ) {
      if (this.length === siblingCount) fullSiblingIndexScans += 1;
      return originalIndexOf.call(this, searchElement, fromIndex);
    });
    const mapGetSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
    ) {
      if (key && typeof key === 'object') {
        const parent = (key as { parentNode?: { childNodes?: unknown[] } }).parentNode;
        if (parent?.childNodes?.length === siblingCount) {
          siblingRecordLookups += 1;
          if (siblingRecordLookups > operationLimit) {
            throw new Error(`Sibling evidence lookup exceeded ${operationLimit} operations`);
          }
        }
      }
      return originalMapGet.call(this, key);
    });

    let indexed!: ReturnType<typeof indexHtml>;
    try {
      indexed = indexHtml(html, 'sibling-complexity.html');
    } finally {
      mapGetSpy.mockRestore();
      indexOfSpy.mockRestore();
    }

    const indexedControls = indexed.index.chunks.flatMap((chunk) => chunk.elements)
      .filter((element) => element.id?.startsWith('control-'));
    expect(indexedControls).toHaveLength(controlCount);
    expect(fullSiblingIndexScans).toBe(0);
    expect(siblingRecordLookups).toBeLessThanOrEqual(operationLimit);
  });

  it('does not index semantic-looking controls or attributes inside SVG', () => {
    const indexed = indexHtml(`<!doctype html><html><body>
      <svg>
        <a role="button" data-testid="SVG-CONTROL-SECRET" href="https://svg-secret.test/">
          SVG-TEXT-SECRET
        </a>
        <foreignObject>
          <div>
            <button data-testid="FOREIGN-OBJECT-CONTROL" aria-label="FOREIGN-OBJECT-LABEL">
              FOREIGN-OBJECT-TEXT
            </button>
          </div>
        </foreignObject>
      </svg>
      <h1>Real page heading</h1>
    </body></html>`, 'svg.html');

    expect(indexed.pageTitle).toBe('Real page heading');
    expect(indexed.serializedIndex).not.toContain('SVG-CONTROL-SECRET');
    expect(indexed.serializedIndex).not.toContain('SVG-TEXT-SECRET');
    expect(indexed.serializedIndex).not.toContain('svg-secret');
    expect(indexed.serializedIndex).not.toContain('FOREIGN-OBJECT-CONTROL');
    expect(indexed.serializedIndex).not.toContain('FOREIGN-OBJECT-LABEL');
    expect(indexed.serializedIndex).not.toContain('FOREIGN-OBJECT-TEXT');
  });

  it('derives LOW_INFORMATION from meaningful indexed evidence', () => {
    const unsafeEmptyLink = indexHtml(
      '<!doctype html><html><body><a href="javascript:private()"></a></body></html>',
      'unsafe-link.html',
    );
    const accessibleAlert = indexHtml(
      '<!doctype html><html><body><div role="alert" aria-label="Session expired"></div></body></html>',
      'accessible-alert.html',
    );

    expect(unsafeEmptyLink.informationLevel).toBe('LOW_INFORMATION');
    expect(accessibleAlert.informationLevel).toBe('NORMAL');
    expect(accessibleAlert.serializedIndex).toContain('Session expired');
  });

  it('creates fallback evidence for accessible attribute-only elements but not empty test mounts', () => {
    const accessible = indexHtml(`<!doctype html><html><body>
      <div data-testid="app-root"></div>
      <img src="/diagram.png" alt="Architecture diagram">
      <output aria-label="Calculated total"></output>
    </body></html>`, 'attribute-evidence.html');
    const mountOnly = indexHtml(`<!doctype html><html><body>
      <div data-testid="app-root"></div><script src="/app.js"></script>
    </body></html>`, 'mount-only.html');
    const evidenceElements = accessible.index.chunks.flatMap((chunk) => chunk.elements);

    expect(accessible.informationLevel).toBe('NORMAL');
    expect(evidenceElements.find((element) => element.tagName === 'img')?.accessibleNameCandidate)
      .toBe('Architecture diagram');
    expect(evidenceElements.find((element) => element.tagName === 'output')?.accessibleNameCandidate)
      .toBe('Calculated total');
    expect(accessible.serializedIndex).not.toContain('/diagram.png');
    expect(mountOnly.informationLevel).toBe('LOW_INFORMATION');
    expect(mountOnly.index.chunks).toEqual([]);
  });

  it('marks an asset-only SPA mount shell as LOW_INFORMATION', () => {
    const indexed = indexHtml(SPA_SHELL_HTML, 'shell.html', 'page-shell');

    expect(indexed.pageTitle).toBe('Client application');
    expect(indexed.informationLevel).toBe('LOW_INFORMATION');
    expect(indexed.warnings.some((warning) => warning.includes('rendered DOM'))).toBe(true);
    expect(indexed.index.chunks).toEqual([]);

    const longTestId = 'mount'.repeat(500);
    const noisyShell = indexHtml(`<!doctype html><html><body>
      ${Array.from({ length: MAX_HTML_WARNINGS + 5 }, (_, index) =>
        `<div data-testid="${longTestId}-${index}"></div>`
      ).join('')}
      <script src="/app.js"></script>
    </body></html>`, 'noisy-shell.html');
    expect(noisyShell.informationLevel).toBe('LOW_INFORMATION');
    expect(noisyShell.warnings.some((warning) => warning.includes('rendered DOM'))).toBe(true);
  });

  it('soft-truncates select options and extracted text with bounded warnings', () => {
    const options = indexHtml(makeSelectHtml(MAX_HTML_SELECT_OPTIONS + 1), 'options.html');
    const select = options.index.chunks.flatMap((chunk) => chunk.elements)
      .find((element) => element.tagName === 'select');
    expect(select?.options).toHaveLength(MAX_HTML_SELECT_OPTIONS);
    expect(select?.options?.at(-1)).toEqual({ label: 'Option 199', value: 'value-199' });
    expect(options.warnings.some((warning) => warning.includes('201 options'))).toBe(true);

    const longLabel = '😀'.repeat(MAX_HTML_TEXT_CHARS + 1);
    const text = indexHtml(
      `<!doctype html><html><body><form><label for="field">${longLabel}</label><input id="field"></form></body></html>`,
      'long-text.html',
    );
    const input = text.index.chunks.flatMap((chunk) => chunk.elements)
      .find((element) => element.id === 'field');
    expect(Array.from(input?.label ?? '')).toHaveLength(MAX_HTML_TEXT_CHARS);
    expect(text.warnings.some((warning) => warning.includes('truncated'))).toBe(true);

    const warnings = indexHtml(makeWarningHeavyHtml(MAX_HTML_WARNINGS + 10), 'warnings.html');
    expect(warnings.warnings).toHaveLength(MAX_HTML_WARNINGS);
    expect(new Set(warnings.warnings).size).toBe(MAX_HTML_WARNINGS);
    expect(warnings.warnings.every((warning) => Array.from(warning).length <= MAX_HTML_WARNING_CHARS))
      .toBe(true);

    const mixedWarnings = indexHtml(
      makeWarningAndSelectHtml(MAX_HTML_WARNINGS + 10, MAX_HTML_SELECT_OPTIONS + 1),
      'mixed-warnings.html',
    );
    expect(mixedWarnings.warnings.some((warning) => warning.includes('201 options'))).toBe(true);
  });

  it('rejects documents over the DOM depth limit', () => {
    expect(() => indexHtml(makeDeepHtml(MAX_HTML_DOM_DEPTH + 1), 'deep.html'))
      .toThrow(/depth.*128/i);
  });

  it('rejects documents over the DOM node limit', () => {
    const html = makeNodeHeavyHtml(MAX_HTML_DOM_NODES + 1);
    expect(encoder.encode(html).byteLength).toBeLessThanOrEqual(MAX_HTML_PAGE_BYTES);
    expect(() => indexHtml(html, 'nodes.html')).toThrow(/node.*50,?000/i);
  });

  it('rejects documents over the semantic chunk limit', () => {
    expect(() => indexHtml(makeChunkHeavyHtml(MAX_HTML_CHUNKS + 1), 'chunks.html'))
      .toThrow(/chunk.*500/i);
  });

  it('rejects 25,000 semantic candidates at the chunk bound before element indexing', () => {
    const html = makeCandidateHeavyHtml(25_000);
    expect(encoder.encode(html).byteLength).toBeLessThanOrEqual(MAX_HTML_PAGE_BYTES);
    expect(() => indexHtml(html, 'candidate-heavy.html')).toThrow(/chunk.*500/i);
  });

  it('rejects documents over the indexed element limit', () => {
    expect(() => indexHtml(makeElementHeavyHtml(MAX_HTML_ELEMENTS + 1), 'elements.html'))
      .toThrow(/element.*2,?000/i);
  });

  it('rejects a serialized index over 1 MiB', () => {
    const html = makeIndexHeavyHtml(MAX_HTML_CHUNKS - 1, 450);
    expect(encoder.encode(html).byteLength).toBeLessThanOrEqual(MAX_HTML_PAGE_BYTES);
    expect(() => indexHtml(html, 'large-index.html')).toThrow(/index.*1 MiB/i);
  });
});
