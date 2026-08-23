// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Requirement } from '../../../shared/contracts/index.ts';
import {
  buildHtmlRequirementSnapshot,
  hashHtmlRequirementSnapshot,
  requirementsFromHtmlSnapshot,
  serializeHtmlRequirementSnapshot,
} from '../html-knowledge/requirement-snapshot.ts';
import { sanitizeHtmlRoute } from '../html-knowledge/normalization.ts';
import { decodeAndNormalizeHtml, parseAndIndexHtml } from '../html-knowledge/parser.ts';
import { queryHtmlKnowledge } from '../html-knowledge/retrieval.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  HTML_RETRIEVAL_WEIGHTS,
  MAX_HTML_CHUNKS,
  MAX_HTML_PAGES,
  MAX_HTML_QUERY_TERMS,
  MAX_HTML_QUERY_TEXT_CHARS,
  MAX_HTML_REQUIREMENT_ID_CODE_POINTS,
  MAX_HTML_TOOL_CHARS,
  type HtmlKnowledgeChunk,
  type HtmlKnowledgeElement,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgeQueryFocus,
  type HtmlKnowledgeQueryResult,
  type HtmlPageRelation,
  type HtmlRequirementSnapshot,
  type SanitizedHtmlRoute,
} from '../html-knowledge/types.ts';

function requirement(input: Partial<Requirement> & Pick<Requirement, 'id' | 'level' | 'title'>): Requirement {
  return {
    projectId: 'project-1',
    description: '',
    status: 'APPROVED',
    position: 0,
    ...input,
  };
}

function chunk(input: {
  id: string;
  pageId: string;
  sectionType?: HtmlKnowledgeChunk['sectionType'];
  heading?: string;
  domPath?: string;
  staticText?: string;
  elements?: readonly HtmlKnowledgeElement[];
}): HtmlKnowledgeChunk {
  return {
    id: input.id,
    pageId: input.pageId,
    sectionType: input.sectionType ?? 'content',
    ...(input.heading ? { heading: input.heading } : {}),
    domPath: input.domPath ?? `/html/body/section-${input.id}`,
    staticText: input.staticText ?? '',
    elements: input.elements ?? [],
    searchTerms: [],
  };
}

function page(input: {
  pageId: string;
  fileName: string;
  pageTitle?: string;
  chunks?: readonly HtmlKnowledgeChunk[];
  informationLevel?: HtmlKnowledgePageIndex['informationLevel'];
  warnings?: readonly string[];
  canonicalRoute?: SanitizedHtmlRoute;
}): HtmlKnowledgePageIndex {
  return {
    version: HTML_KNOWLEDGE_INDEX_VERSION,
    pageId: input.pageId,
    fileName: input.fileName,
    fileNameKey: input.fileName.normalize('NFC').toLocaleLowerCase('en-US'),
    pageTitle: input.pageTitle ?? input.fileName.replace(/\.html?$/iu, ''),
    contentSha256: `sha-${input.pageId}`,
    informationLevel: input.informationLevel ?? 'NORMAL',
    ...(input.canonicalRoute ? { canonicalRoute: input.canonicalRoute } : {}),
    routeAliases: [],
    chunks: input.chunks ?? [],
    relationCandidates: [],
    warnings: input.warnings ?? [],
  };
}

function relation(
  fromPageId: string,
  toPageId: string,
  sourceDomPath = '/html/body/a',
): HtmlPageRelation {
  return {
    fromPageId,
    toPageId,
    type: 'link',
    sourceDomPath,
    sourceTarget: `/${toPageId}.html`,
    matchRule: 'file-path',
    confidence: 'high',
  };
}

function makeSnapshot(
  requirements: Requirement[],
  selectedRequirementIds: string[],
  selectedFlowIds: string[] = [],
): HtmlRequirementSnapshot {
  return buildHtmlRequirementSnapshot({
    projectId: 'project-1',
    selectedRequirementIds,
    selectedFlowIds,
    requirements,
  });
}

function context(input: {
  snapshot: HtmlRequirementSnapshot;
  currentBatchRequirementIds: readonly string[];
  pages?: readonly HtmlKnowledgePageIndex[];
  relations?: readonly HtmlPageRelation[];
  projectId?: string;
  knowledgeSetId?: string;
  indexVersion?: number;
}) {
  return {
    projectId: input.projectId ?? 'project-1',
    knowledgeSetId: input.knowledgeSetId ?? 'set-1',
    indexVersion: input.indexVersion ?? HTML_KNOWLEDGE_INDEX_VERSION,
    requirementSnapshot: input.snapshot,
    currentBatchRequirementIds: input.currentBatchRequirementIds,
    pages: input.pages ?? [],
    relations: input.relations ?? [],
  };
}

function parseResult(serialized: string): HtmlKnowledgeQueryResult {
  expect(serialized.length).toBeLessThanOrEqual(MAX_HTML_TOOL_CHARS);
  return JSON.parse(serialized) as HtmlKnowledgeQueryResult;
}

describe('HTML requirement snapshot', () => {
  it('captures the selected closure and serializes/hashs it canonically', () => {
    const requirements = [
      requirement({ id: 'story-unrelated', parentId: 'epic-auth', level: 'story', title: 'Unrelated', position: 9 }),
      requirement({
        id: 'ac-flow-checkout',
        parentId: 'story-flow',
        level: 'ac',
        title: 'Checkout path',
        description: 'Given login When checkout Then complete',
        position: 2,
        relatedRequirementIds: ['story-login', 'story-dashboard', 'story-login'],
      }),
      requirement({ id: 'ac-dashboard', parentId: 'story-dashboard', level: 'ac', title: 'Show dashboard', position: 1 }),
      requirement({ id: 'story-dashboard', parentId: 'epic-auth', level: 'story', title: 'Dashboard', position: 2 }),
      requirement({ id: 'epic-auth', level: 'epic', title: 'Authentication', description: 'Auth epic', position: 3 }),
      requirement({ id: 'ac-login-password', parentId: 'story-login', level: 'ac', title: 'Password', position: 2 }),
      requirement({ id: 'story-flow', parentId: 'epic-auth', level: 'story', title: 'Checkout flow', position: 3, isFlow: true }),
      requirement({ id: 'story-login', parentId: 'epic-auth', level: 'story', title: 'Sign in', position: 1 }),
      requirement({ id: 'ac-login-email', parentId: 'story-login', level: 'ac', title: 'Email', position: 1 }),
    ];

    const snapshot = buildHtmlRequirementSnapshot({
      projectId: 'project-1',
      selectedRequirementIds: ['story-login', 'story-login'],
      selectedFlowIds: ['story-flow'],
      requirements,
    });
    const expected: HtmlRequirementSnapshot = {
      version: 1,
      projectId: 'project-1',
      selectedRequirementIds: ['story-login'],
      selectedFlowIds: ['story-flow'],
      records: [
        {
          id: 'ac-dashboard',
          projectId: 'project-1',
          level: 'ac',
          parentId: 'story-dashboard',
          title: 'Show dashboard',
          description: '',
          position: 1,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
        {
          id: 'ac-flow-checkout',
          projectId: 'project-1',
          level: 'ac',
          parentId: 'story-flow',
          title: 'Checkout path',
          description: 'Given login When checkout Then complete',
          position: 2,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: ['story-dashboard', 'story-login'],
        },
        {
          id: 'ac-login-email',
          projectId: 'project-1',
          level: 'ac',
          parentId: 'story-login',
          title: 'Email',
          description: '',
          position: 1,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
        {
          id: 'ac-login-password',
          projectId: 'project-1',
          level: 'ac',
          parentId: 'story-login',
          title: 'Password',
          description: '',
          position: 2,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
        {
          id: 'epic-auth',
          projectId: 'project-1',
          level: 'epic',
          title: 'Authentication',
          description: 'Auth epic',
          position: 3,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
        {
          id: 'story-dashboard',
          projectId: 'project-1',
          level: 'story',
          parentId: 'epic-auth',
          title: 'Dashboard',
          description: '',
          position: 2,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
        {
          id: 'story-flow',
          projectId: 'project-1',
          level: 'story',
          parentId: 'epic-auth',
          title: 'Checkout flow',
          description: '',
          position: 3,
          status: 'APPROVED',
          flowType: null,
          isFlow: true,
          relatedRequirementIds: [],
        },
        {
          id: 'story-login',
          projectId: 'project-1',
          level: 'story',
          parentId: 'epic-auth',
          title: 'Sign in',
          description: '',
          position: 1,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
      ],
    };
    const expectedJson = JSON.stringify(expected);

    expect(snapshot).toEqual(expected);
    expect(serializeHtmlRequirementSnapshot(snapshot)).toBe(expectedJson);
    expect(hashHtmlRequirementSnapshot(snapshot)).toBe(
      createHash('sha256').update(expectedJson).digest('hex'),
    );

    const reordered: HtmlRequirementSnapshot = {
      ...snapshot,
      selectedRequirementIds: [...snapshot.selectedRequirementIds].reverse(),
      selectedFlowIds: [...snapshot.selectedFlowIds].reverse(),
      records: [...snapshot.records].reverse().map((record) => ({
        ...record,
        relatedRequirementIds: [...record.relatedRequirementIds].reverse(),
      })),
    };
    expect(serializeHtmlRequirementSnapshot(reordered)).toBe(expectedJson);
    expect(hashHtmlRequirementSnapshot(reordered)).toBe(hashHtmlRequirementSnapshot(snapshot));
  });

  it('does not retain mutable requirement or selection arrays', () => {
    const selectedRequirementIds = ['story-login'];
    const selectedFlowIds: string[] = [];
    const relatedRequirementIds = ['story-login'];
    const requirements = [
      requirement({ id: 'epic-auth', level: 'epic', title: 'Auth' }),
      requirement({ id: 'story-login', parentId: 'epic-auth', level: 'story', title: 'Sign in' }),
      requirement({
        id: 'ac-login',
        parentId: 'story-login',
        level: 'ac',
        title: 'Login succeeds',
        relatedRequirementIds,
      }),
    ];
    const snapshot = buildHtmlRequirementSnapshot({
      projectId: 'project-1',
      selectedRequirementIds,
      selectedFlowIds,
      requirements,
    });
    const before = serializeHtmlRequirementSnapshot(snapshot);

    selectedRequirementIds.push('another-story');
    selectedFlowIds.push('another-flow');
    relatedRequirementIds.push('another-story');
    requirements[1].title = 'Mutated title';

    expect(serializeHtmlRequirementSnapshot(snapshot)).toBe(before);
    expect(snapshot.records.find((record) => record.id === 'story-login')?.title).toBe('Sign in');
  });

  it('only snapshots approved selected and flow-referenced stories', () => {
    const epic = requirement({ id: 'epic-auth', level: 'epic', title: 'Auth' });
    const draftStory = {
      ...requirement({ id: 'story-draft', parentId: epic.id, level: 'story', title: 'Draft' }),
      status: 'DRAFT' as const,
    };
    expect(() => buildHtmlRequirementSnapshot({
      projectId: 'project-1',
      selectedRequirementIds: [draftStory.id],
      selectedFlowIds: [],
      requirements: [epic, draftStory],
    })).toThrow(/must be APPROVED/i);

    const flow = requirement({
      id: 'story-flow',
      parentId: epic.id,
      level: 'story',
      title: 'Flow',
      isFlow: true,
    });
    const flowCriterion = requirement({
      id: 'ac-flow',
      parentId: flow.id,
      level: 'ac',
      title: 'Flow criterion',
      relatedRequirementIds: [draftStory.id],
    });
    expect(() => buildHtmlRequirementSnapshot({
      projectId: 'project-1',
      selectedRequirementIds: [],
      selectedFlowIds: [flow.id],
      requirements: [epic, flow, flowCriterion, draftStory],
    })).toThrow(/must reference an APPROVED component story/i);
  });

  it('deterministically closes related targets from every included acceptance criterion', () => {
    const requirements = [
      requirement({ id: 'epic-c', level: 'epic', title: 'Epic C' }),
      requirement({ id: 'story-c', parentId: 'epic-c', level: 'story', title: 'Story C' }),
      requirement({ id: 'ac-c', parentId: 'story-c', level: 'ac', title: 'AC C' }),
      requirement({ id: 'epic-b', level: 'epic', title: 'Epic B' }),
      requirement({ id: 'story-b', parentId: 'epic-b', level: 'story', title: 'Story B' }),
      requirement({
        id: 'ac-b',
        parentId: 'story-b',
        level: 'ac',
        title: 'AC B',
        relatedRequirementIds: ['story-c'],
      }),
      requirement({ id: 'epic-a', level: 'epic', title: 'Epic A' }),
      requirement({ id: 'story-a', parentId: 'epic-a', level: 'story', title: 'Story A' }),
      requirement({
        id: 'ac-a',
        parentId: 'story-a',
        level: 'ac',
        title: 'AC A',
        relatedRequirementIds: ['story-b'],
      }),
    ];

    const snapshot = makeSnapshot(requirements, ['story-a']);

    expect(snapshot.records.map((record) => record.id)).toEqual([
      'ac-a',
      'ac-b',
      'ac-c',
      'epic-a',
      'epic-b',
      'epic-c',
      'story-a',
      'story-b',
      'story-c',
    ]);
    expect(() => requirementsFromHtmlSnapshot(snapshot)).not.toThrow();
  });

  it('round-trips real status and nullable or explicit flowType values', () => {
    const requirements = [
      requirement({ id: 'epic-status', level: 'epic', title: 'Status epic', status: 'DEPRECATED' }),
      requirement({
        id: 'story-status',
        parentId: 'epic-status',
        level: 'story',
        title: 'Status story',
        status: 'APPROVED',
      }),
      requirement({
        id: 'ac-atomic',
        parentId: 'story-status',
        level: 'ac',
        title: 'Atomic AC',
        status: 'DRAFT',
        flowType: 'atomic',
      }),
      requirement({
        id: 'ac-flow',
        parentId: 'story-status',
        level: 'ac',
        title: 'Flow AC',
        status: 'APPROVED',
        flowType: 'flow',
      }),
      requirement({
        id: 'ac-null',
        parentId: 'story-status',
        level: 'ac',
        title: 'Null AC',
        status: 'DEPRECATED',
        flowType: null,
      }),
    ];

    const snapshot = makeSnapshot(requirements, ['story-status']);
    const roundTrip = requirementsFromHtmlSnapshot(snapshot);

    expect(snapshot.records.find((record) => record.id === 'epic-status'))
      .toMatchObject({ status: 'DEPRECATED', flowType: null });
    expect(roundTrip.find((record) => record.id === 'ac-atomic'))
      .toMatchObject({ status: 'DRAFT', flowType: 'atomic' });
    expect(roundTrip.find((record) => record.id === 'ac-flow'))
      .toMatchObject({ status: 'APPROVED', flowType: 'flow' });
    expect(roundTrip.find((record) => record.id === 'ac-null'))
      .toMatchObject({ status: 'DEPRECATED', flowType: null });
  });

  it('validates requirement IDs only when they enter the selected snapshot closure', () => {
    const overlongId = 'r'.repeat(MAX_HTML_REQUIREMENT_ID_CODE_POINTS + 1);
    const selectedStory = requirement({ id: 'story-selected', level: 'story', title: 'Selected' });
    const unrelatedStory = requirement({ id: overlongId, level: 'story', title: 'Unrelated' });

    expect(makeSnapshot([selectedStory, unrelatedStory], ['story-selected']).records)
      .toEqual([expect.objectContaining({ id: 'story-selected' })]);
    expect(() => makeSnapshot([selectedStory, unrelatedStory], [overlongId]))
      .toThrow(/128 Unicode code points/i);
    expect(() => makeSnapshot([
      selectedStory,
      requirement({
        id: 'ac-selected',
        parentId: 'story-selected',
        level: 'ac',
        title: 'References unrelated story',
        relatedRequirementIds: [overlongId],
      }),
      unrelatedStory,
    ], ['story-selected'])).toThrow(/128 Unicode code points/i);
  });

  it('rejects unknown selections, foreign project data, and invalid flow references', () => {
    const base = [requirement({ id: 'story-login', level: 'story', title: 'Sign in' })];

    expect(() => makeSnapshot(base, ['missing'])).toThrow(/unknown.*missing/i);
    expect(() => makeSnapshot([
      ...base,
      requirement({ id: 'foreign-story', projectId: 'project-2', level: 'story', title: 'Foreign' }),
    ], ['story-login'])).toThrow(/project/i);
    expect(() => makeSnapshot([
      requirement({ id: 'flow', level: 'story', title: 'Flow', isFlow: true }),
      requirement({
        id: 'flow-ac',
        parentId: 'flow',
        level: 'ac',
        title: 'Path',
        relatedRequirementIds: ['missing-component'],
      }),
    ], [], ['flow'])).toThrow(/unknown.*missing-component/i);
  });
});

describe('queryHtmlKnowledge', () => {
  it('exports the immutable approved scoring weights', () => {
    expect(HTML_RETRIEVAL_WEIGHTS).toEqual({
      identity: 12,
      context: 8,
      label: 6,
      text: 3,
      relation: 2,
    });
    expect(Object.isFrozen(HTML_RETRIEVAL_WEIGHTS)).toBe(true);
  });

  it('queries stories and preserves an AC request while canonicalizing it to the parent story', () => {
    const requirements = [
      requirement({ id: 'story-login', level: 'story', title: 'Sign in', description: 'Authenticate an account' }),
      requirement({
        id: 'ac-login-password',
        parentId: 'story-login',
        level: 'ac',
        title: 'Password entry',
        description: 'Given the sign-in form When the password is entered Then continue',
      }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-login']);
    const loginPage = page({
      pageId: 'page-login',
      fileName: 'login.html',
      pageTitle: 'Sign in',
      chunks: [chunk({
        id: 'chunk-login',
        pageId: 'page-login',
        sectionType: 'form',
        elements: [{ tagName: 'input', domPath: '/html/body/form/input', id: 'password', name: 'password' }],
      })],
    });

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-login'],
      pages: [loginPage],
    }), {
      requirementIds: ['story-login', 'ac-login-password'],
      focus: 'all',
      maxResults: 5,
    }));

    expect(result.matches).toEqual([
      {
        requestedRequirementId: 'ac-login-password',
        canonicalRequirementId: 'story-login',
        confidence: 'high',
        chunkIds: ['chunk-login'],
      },
      {
        requestedRequirementId: 'story-login',
        canonicalRequirementId: 'story-login',
        confidence: 'high',
        chunkIds: ['chunk-login'],
      },
    ]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({ chunkId: 'chunk-login', fileName: 'login.html' });
  });

  it('rejects unknown, epic, out-of-batch, and wrong-project IDs from the snapshot only', () => {
    const requirements = [
      requirement({ id: 'epic-auth', level: 'epic', title: 'Auth' }),
      requirement({ id: 'story-login', parentId: 'epic-auth', level: 'story', title: 'Login' }),
      requirement({ id: 'story-profile', parentId: 'epic-auth', level: 'story', title: 'Profile' }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-login', 'story-profile']);
    const queryContext = context({ snapshot, currentBatchRequirementIds: ['story-login'] });

    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: ['missing'] })).toThrow(/unknown/i);
    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: ['epic-auth'] })).toThrow(/epic/i);
    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: ['story-profile'] })).toThrow(/current batch/i);

    const wrongProjectSnapshot: HtmlRequirementSnapshot = {
      ...snapshot,
      records: [
        ...snapshot.records,
        {
          id: 'story-foreign',
          projectId: 'project-2',
          level: 'story',
          title: 'Foreign',
          description: '',
          position: 0,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
      ],
    };
    expect(() => queryHtmlKnowledge(context({
      snapshot: wrongProjectSnapshot,
      currentBatchRequirementIds: ['story-foreign'],
    }), { requirementIds: ['story-foreign'] })).toThrow(/project/i);
  });

  it('matches normalized Latin terms and CJK bigrams', () => {
    const requirements = [
      requirement({ id: 'story-cjk', level: 'story', title: '用户登录', description: '显示账户页面' }),
      requirement({ id: 'story-latin', level: 'story', title: 'Ｅｍａｉｌ account', description: 'Enter credentials' }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-latin', 'story-cjk']);
    const pages = [
      page({
        pageId: 'page-cjk',
        fileName: 'cjk.html',
        chunks: [chunk({ id: 'chunk-cjk', pageId: 'page-cjk', heading: '用户登录页面' })],
      }),
      page({
        pageId: 'page-latin',
        fileName: 'latin.html',
        chunks: [chunk({
          id: 'chunk-latin',
          pageId: 'page-latin',
          elements: [{ tagName: 'input', domPath: '/html/body/input', name: 'email' }],
        })],
      }),
    ];

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-latin', 'story-cjk'],
      pages,
    }), { requirementIds: ['story-latin', 'story-cjk'] }));

    expect(result.matches.find((match) => match.requestedRequirementId === 'story-cjk')?.chunkIds)
      .toContain('chunk-cjk');
    expect(result.matches.find((match) => match.requestedRequirementId === 'story-latin')?.chunkIds)
      .toContain('chunk-latin');
  });

  it.each<{
    focus: HtmlKnowledgeQueryFocus;
    expectedChunkId: string;
    expectedChunk: HtmlKnowledgeChunk;
  }>([
    {
      focus: 'all',
      expectedChunkId: 'chunk-all',
      expectedChunk: chunk({ id: 'chunk-all', pageId: 'page-focus', staticText: 'focusneedle' }),
    },
    {
      focus: 'interaction',
      expectedChunkId: 'chunk-interaction',
      expectedChunk: chunk({
        id: 'chunk-interaction',
        pageId: 'page-focus',
        sectionType: 'interactive',
        elements: [{ tagName: 'button', domPath: '/html/body/button' }],
      }),
    },
    {
      focus: 'validation',
      expectedChunkId: 'chunk-validation',
      expectedChunk: chunk({
        id: 'chunk-validation',
        pageId: 'page-focus',
        sectionType: 'validation',
        elements: [{ tagName: 'input', domPath: '/html/body/input', required: true }],
      }),
    },
    {
      focus: 'navigation',
      expectedChunkId: 'chunk-navigation',
      expectedChunk: chunk({
        id: 'chunk-navigation',
        pageId: 'page-focus',
        sectionType: 'navigation',
        elements: [{ tagName: 'a', domPath: '/html/body/nav/a', href: '/next' }],
      }),
    },
    {
      focus: 'content',
      expectedChunkId: 'chunk-content',
      expectedChunk: chunk({ id: 'chunk-content', pageId: 'page-focus', sectionType: 'content' }),
    },
  ])('applies the fixed $focus focus terms', ({ focus, expectedChunkId, expectedChunk }) => {
    const queryRequirement = requirement({
      id: 'story-focus',
      level: 'story',
      title: focus === 'all' ? 'focusneedle' : 'otherwise-unmatched',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-focus']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-focus'],
      pages: [page({ pageId: 'page-focus', fileName: 'focus.html', chunks: [expectedChunk] })],
    }), { requirementIds: ['story-focus'], focus, maxResults: 1 }));

    expect(result.matches[0].chunkIds).toEqual([expectedChunkId]);
  });

  it('orders identity, heading, label, and static-body matches by their exact weights', () => {
    const queryRequirement = requirement({
      id: 'story-weights',
      level: 'story',
      title: 'identityterm headingterm labelterm bodyterm',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-weights']);
    const weightedPage = page({
      pageId: 'page-weights',
      fileName: 'weights.html',
      chunks: [
        chunk({ id: 'chunk-body', pageId: 'page-weights', staticText: 'bodyterm' }),
        chunk({
          id: 'chunk-label',
          pageId: 'page-weights',
          elements: [{ tagName: 'input', domPath: '/html/body/input', label: 'labelterm' }],
        }),
        chunk({ id: 'chunk-heading', pageId: 'page-weights', heading: 'headingterm' }),
        chunk({
          id: 'chunk-identity',
          pageId: 'page-weights',
          elements: [{ tagName: 'input', domPath: '/html/body/input', id: 'identityterm' }],
        }),
      ],
    });

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-weights'],
      pages: [weightedPage],
    }), { requirementIds: ['story-weights'], maxResults: 4 }));

    expect(result.matches[0]).toMatchObject({ confidence: 'high' });
    expect(result.matches[0].chunkIds).toEqual([
      'chunk-identity',
      'chunk-heading',
      'chunk-label',
      'chunk-body',
    ]);
  });

  it('adds the relation boost only once when a page links to multiple other positive pages', () => {
    const queryRequirement = requirement({ id: 'story-relation', level: 'story', title: 'boostword' });
    const snapshot = makeSnapshot([queryRequirement], ['story-relation']);
    const pages = ['a', 'b', 'c'].map((name) => page({
      pageId: `page-${name}`,
      fileName: `${name}.html`,
      chunks: [chunk({ id: `chunk-${name}`, pageId: `page-${name}`, staticText: 'boostword' })],
    }));

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-relation'],
      pages,
      relations: [relation('page-a', 'page-b', '/a/one'), relation('page-a', 'page-c', '/a/two')],
    }), { requirementIds: ['story-relation'], maxResults: 1 }));

    expect(result.matches[0]).toMatchObject({ confidence: 'low', chunkIds: ['chunk-a'] });
  });

  it('breaks score ties by normalized file name, DOM path, and chunk ID', () => {
    const queryRequirement = requirement({ id: 'story-tie', level: 'story', title: 'tieword' });
    const snapshot = makeSnapshot([queryRequirement], ['story-tie']);
    const pages = [
      page({
        pageId: 'page-b',
        fileName: 'B.html',
        chunks: [chunk({ id: 'chunk-b', pageId: 'page-b', domPath: '/a', staticText: 'tieword' })],
      }),
      page({
        pageId: 'page-a',
        fileName: 'a.html',
        chunks: [
          chunk({ id: 'chunk-z', pageId: 'page-a', domPath: '/z', staticText: 'tieword' }),
          chunk({ id: 'chunk-2', pageId: 'page-a', domPath: '/same', staticText: 'tieword' }),
          chunk({ id: 'chunk-1', pageId: 'page-a', domPath: '/same', staticText: 'tieword' }),
        ],
      }),
    ];

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-tie'],
      pages,
    }), { requirementIds: ['story-tie'], maxResults: 4 }));

    expect(result.matches[0].chunkIds).toEqual(['chunk-1', 'chunk-2', 'chunk-z', 'chunk-b']);
  });

  it('deduplicates a shared chunk payload while retaining many-to-many references', () => {
    const requirements = [
      requirement({ id: 'story-alpha', level: 'story', title: 'sharedterm' }),
      requirement({ id: 'story-beta', level: 'story', title: 'sharedterm' }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-alpha', 'story-beta']);
    const sharedPage = page({
      pageId: 'page-shared',
      fileName: 'shared.html',
      chunks: [chunk({ id: 'chunk-shared', pageId: 'page-shared', staticText: 'sharedterm' })],
    });

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-alpha', 'story-beta'],
      pages: [sharedPage],
    }), { requirementIds: ['story-beta', 'story-alpha'] }));

    expect(result.matches.map((match) => match.chunkIds)).toEqual([
      ['chunk-shared'],
      ['chunk-shared'],
    ]);
    expect(result.chunks.map((item) => item.chunkId)).toEqual(['chunk-shared']);
  });

  it('deduplicates a legal 2,000-character matched label shared by requirements', () => {
    const longLabel = 'L'.repeat(2_000);
    const requirements = [
      requirement({ id: 'story-long-alpha', level: 'story', title: 'Alpha', description: `"${longLabel}"` }),
      requirement({ id: 'story-long-beta', level: 'story', title: 'Beta', description: `"${longLabel}"` }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-long-alpha', 'story-long-beta']);
    const sharedPage = page({
      pageId: 'page-long-label',
      fileName: 'long-label.html',
      chunks: [chunk({
        id: 'chunk-long-label',
        pageId: 'page-long-label',
        elements: [{ tagName: 'button', domPath: '/html/body/button', label: longLabel }],
      })],
    });

    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-long-alpha', 'story-long-beta'],
      pages: [sharedPage],
    }), { requirementIds: ['story-long-alpha', 'story-long-beta'], maxResults: 1 });
    const result = parseResult(serialized);

    expect(result.matches.map((match) => match.chunkIds)).toEqual([
      ['chunk-long-label'],
      ['chunk-long-label'],
    ]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].matchedTerms).toEqual([longLabel.toLocaleLowerCase('en-US')]);
    expect(result.truncated).toBe(false);
  });

  it('allocates a constrained evidence budget round-robin before lower-ranked matches', () => {
    const requirements = [
      requirement({ id: 'story-alpha', level: 'story', title: 'alphaterm' }),
      requirement({ id: 'story-beta', level: 'story', title: 'betaterm' }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-alpha', 'story-beta']);
    const longText = (term: string) => `${term} ${'x'.repeat(1_950)}`;
    const pages = [
      page({
        pageId: 'page-alpha',
        fileName: 'alpha.html',
        chunks: [
          chunk({ id: 'chunk-alpha-1', pageId: 'page-alpha', domPath: '/a', staticText: longText('alphaterm') }),
          chunk({ id: 'chunk-alpha-2', pageId: 'page-alpha', domPath: '/b', staticText: longText('alphaterm') }),
        ],
      }),
      page({
        pageId: 'page-beta',
        fileName: 'beta.html',
        chunks: [
          chunk({ id: 'chunk-beta-1', pageId: 'page-beta', domPath: '/a', staticText: longText('betaterm') }),
          chunk({ id: 'chunk-beta-2', pageId: 'page-beta', domPath: '/b', staticText: longText('betaterm') }),
        ],
      }),
    ];

    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-alpha', 'story-beta'],
      pages,
    }), { requirementIds: ['story-alpha', 'story-beta'], maxResults: 2 });
    const result = parseResult(serialized);

    expect(result.matches.map((match) => match.chunkIds.length)).toEqual([1, 1]);
    expect(result.chunks).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('requires 1 to 20 unique IDs and accepts repeated IDs after normalization', () => {
    const requirements = Array.from({ length: 20 }, (_, index) => requirement({
      id: `story-${String(index).padStart(2, '0')}`,
      level: 'story',
      title: `Story ${index}`,
    }));
    const ids = requirements.map((item) => item.id);
    const snapshot = makeSnapshot(requirements, ids);
    const queryContext = context({ snapshot, currentBatchRequirementIds: ids });

    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: [] })).toThrow(/at least 1/i);
    expect(() => queryHtmlKnowledge(queryContext, {
      requirementIds: [...ids, 'story-over-limit'],
    })).toThrow(/20 unique/i);

    const exactLimit = parseResult(queryHtmlKnowledge(queryContext, { requirementIds: [...ids].reverse() }));
    expect(exactLimit.matches).toHaveLength(20);
    expect(parseResult(queryHtmlKnowledge(queryContext, {
      requirementIds: Array.from({ length: 21 }, () => 'story-00'),
    })).matches).toHaveLength(1);
  });

  it('accepts 128-code-point IDs, rejects 129, and keeps 20 maximum IDs representable', () => {
    expect(MAX_HTML_REQUIREMENT_ID_CODE_POINTS).toBe(128);
    const requirements = Array.from({ length: 20 }, (_, index) => {
      const prefix = `需求-${String(index).padStart(2, '0')}-`;
      return requirement({
        id: `${prefix}${'😀'.repeat(128 - Array.from(prefix).length)}`,
        level: 'story',
        title: `Requirement ${index}`,
      });
    });
    const ids = requirements.map((item) => item.id);
    expect(ids.every((id) => Array.from(id).length === 128)).toBe(true);

    const snapshot = makeSnapshot(requirements, ids);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ids,
    }), { requirementIds: ids }));
    const representedIds = [
      ...result.matches.map((match) => match.requestedRequirementId),
      ...result.omittedRequirementIds,
    ];
    expect(new Set(representedIds)).toEqual(new Set(ids));
    expect(representedIds).toHaveLength(ids.length);

    const overlongId = 'r'.repeat(129);
    expect(() => makeSnapshot([
      requirement({ id: overlongId, level: 'story', title: 'Too long' }),
    ], [overlongId])).toThrow(/128 Unicode code points/i);
    expect(() => queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ids,
    }), { requirementIds: [overlongId] })).toThrow(/128 Unicode code points/i);

    const invalidSnapshot: HtmlRequirementSnapshot = {
      ...snapshot,
      records: [
        ...snapshot.records,
        {
          id: overlongId,
          projectId: 'project-1',
          level: 'story',
          title: 'Invalid snapshot record',
          description: '',
          position: 99,
          status: 'APPROVED',
          flowType: null,
          isFlow: false,
          relatedRequirementIds: [],
        },
      ],
    };
    expect(() => queryHtmlKnowledge(context({
      snapshot: invalidSnapshot,
      currentBatchRequirementIds: ids,
    }), { requirementIds: [ids[0]] })).toThrow(/128 Unicode code points/i);
    expect(() => serializeHtmlRequirementSnapshot(invalidSnapshot)).toThrow(/128 Unicode code points/i);
  });

  it('rejects control characters and unpaired surrogates in requirement IDs', () => {
    const valid = requirement({ id: '需求-😀-valid', level: 'story', title: 'Unicode ID' });
    expect(makeSnapshot([valid], [valid.id]).records[0].id).toBe(valid.id);

    for (const invalidId of ['bad\0id', 'bad\u001fid', 'bad\u202Eid', 'bad\uD800id']) {
      expect(() => makeSnapshot([
        requirement({ id: invalidId, level: 'story', title: 'Invalid ID' }),
      ], [invalidId])).toThrow(/control|surrogate/i);
    }

    const snapshot = makeSnapshot([valid], [valid.id]);
    expect(() => queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: [valid.id],
    }), { requirementIds: ['bad\uD800id'] })).toThrow(/surrogate/i);
  });

  it('validates maxResults and defaults it to five matches per requirement', () => {
    const queryRequirement = requirement({ id: 'story-limit', level: 'story', title: 'limitword' });
    const snapshot = makeSnapshot([queryRequirement], ['story-limit']);
    const limitPage = page({
      pageId: 'page-limit',
      fileName: 'limit.html',
      chunks: Array.from({ length: 6 }, (_, index) => chunk({
        id: `chunk-${index}`,
        pageId: 'page-limit',
        domPath: `/chunk-${index}`,
        staticText: 'limitword',
      })),
    });
    const queryContext = context({
      snapshot,
      currentBatchRequirementIds: ['story-limit'],
      pages: [limitPage],
    });

    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: 'story-limit', maxResults: 0 })).toThrow(/maxResults/i);
    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: 'story-limit', maxResults: 11 })).toThrow(/maxResults/i);
    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: 'story-limit', maxResults: 1.5 })).toThrow(/integer/i);
    expect(() => queryHtmlKnowledge(queryContext, {
      requirementIds: 'story-limit',
      focus: 'invalid' as HtmlKnowledgeQueryFocus,
    })).toThrow(/focus/i);
    expect(parseResult(queryHtmlKnowledge(queryContext, { requirementIds: 'story-limit' })).matches[0].chunkIds)
      .toHaveLength(5);
  });

  it('returns none confidence plus a bounded available-page warning without claiming absence', () => {
    const queryRequirement = requirement({ id: 'story-payment', level: 'story', title: 'Card payment' });
    const snapshot = makeSnapshot([queryRequirement], ['story-payment']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-payment'],
      pages: [
        page({
          pageId: 'page-shell',
          fileName: 'shell.html',
          pageTitle: 'Client application',
          informationLevel: 'LOW_INFORMATION',
        }),
        page({ pageId: 'page-help', fileName: 'help.html', pageTitle: 'Help center' }),
      ],
    }), { requirementIds: ['story-payment'] }));

    expect(result.matches).toEqual([{
      requestedRequirementId: 'story-payment',
      canonicalRequirementId: 'story-payment',
      confidence: 'none',
      chunkIds: [],
    }]);
    expect(result.chunks).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/available HTML pages.*Client application.*Help center/i);
    expect(result.warnings.join(' ')).toMatch(/low-information/i);
    expect(result.warnings.every((warning) => Array.from(warning).length <= 200)).toBe(true);
    expect(result.warnings.join(' ')).not.toMatch(/not implemented|is absent/i);
  });

  it('represents every requested 124-character ID exactly once under base-result pressure', () => {
    const requirements = Array.from({ length: 20 }, (_, index) => requirement({
      id: `story-${String(index).padStart(2, '0')}-`.padEnd(124, String(index % 10)),
      level: 'story',
      title: `Unmatched ${index}`,
    }));
    const ids = requirements.map((item) => item.id);
    expect(ids.every((id) => id.length === 124)).toBe(true);
    const snapshot = makeSnapshot(requirements, ids);

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ids,
    }), { requirementIds: [...ids].reverse() }));
    const representedIds = [
      ...result.matches.map((match) => match.requestedRequirementId),
      ...result.omittedRequirementIds,
    ];

    expect(representedIds).toHaveLength(20);
    expect(new Set(representedIds)).toEqual(new Set(ids));
    expect(representedIds.every((id) => representedIds.indexOf(id) === representedIds.lastIndexOf(id)))
      .toBe(true);
  });

  it('preserves the page outline before bounded unmatched-ID detail and marks omitted detail', () => {
    const requirements = Array.from({ length: 20 }, (_, index) => requirement({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      level: 'story',
      title: `Unmatched requirement ${index}`,
    }));
    const ids = requirements.map((item) => item.id);
    const snapshot = makeSnapshot(requirements, ids);

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ids,
      pages: [
        page({
          pageId: 'page-account',
          fileName: 'account.html',
          pageTitle: 'Account overview',
        }),
        ...Array.from({ length: 19 }, (_, index) => page({
          pageId: `page-outline-${String.fromCharCode(97 + index)}`,
          fileName: `outline-${String.fromCharCode(97 + index)}.html`,
          pageTitle: `Supplemental page ${String.fromCharCode(65 + index)}`,
        })),
      ],
    }), { requirementIds: ids }));

    expect(result.warnings[0]).toMatch(/available HTML pages.*Account overview.*account\.html/i);
    expect(result.warnings[0]).not.toContain('Supplemental page S');
    expect(result.warnings.some((warning) => /unmatched requirement IDs/i.test(warning))).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it('sanitizes requirement-side routes and ranks exact route evidence above generic text', () => {
    const route = sanitizeHtmlRoute('checkout.html?token=other-secret&view=compact');
    if (!route) throw new Error('Expected checkout route to sanitize');
    const queryRequirement = requirement({
      id: 'story-route',
      level: 'story',
      title: 'Checkout navigation',
      description: 'Open checkout.html?token=query-secret&view=summary and continue',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-route']);
    const pages = [
      page({
        pageId: 'page-route',
        fileName: 'route.html',
        pageTitle: 'Route target',
        canonicalRoute: route,
        chunks: [chunk({ id: 'chunk-route', pageId: 'page-route' })],
      }),
      page({
        pageId: 'page-text',
        fileName: 'text.html',
        chunks: [chunk({ id: 'chunk-text', pageId: 'page-text', staticText: 'checkout' })],
      }),
      page({
        pageId: 'page-value',
        fileName: 'value.html',
        chunks: [chunk({ id: 'chunk-value', pageId: 'page-value', staticText: 'query-secret summary other-secret compact' })],
      }),
    ];

    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-route'],
      pages,
    }), { requirementIds: ['story-route'], maxResults: 3 });
    const result = parseResult(serialized);

    expect(result.matches[0].chunkIds[0]).toBe('chunk-route');
    expect(result.chunks.find((item) => item.chunkId === 'chunk-route')?.matchedTerms)
      .toContain('/checkout.html?token&view');
    expect(result.matches[0].chunkIds).not.toContain('chunk-value');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('other-secret');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('compact');
  });

  it('surfaces zero-chunk LOW_INFORMATION pages only through a relevance-ordered outline', () => {
    const queryRequirement = requirement({ id: 'story-billing', level: 'story', title: 'Billing' });
    const snapshot = makeSnapshot([queryRequirement], ['story-billing']);

    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-billing'],
      pages: [
        page({
          pageId: 'page-general-shell',
          fileName: 'a-shell.html',
          pageTitle: 'Account shell',
          informationLevel: 'LOW_INFORMATION',
        }),
        page({
          pageId: 'page-billing-shell',
          fileName: 'z-billing.html',
          pageTitle: 'Billing portal',
          informationLevel: 'LOW_INFORMATION',
        }),
      ],
    }), { requirementIds: ['story-billing'] }));

    expect(result.matches[0]).toEqual({
      requestedRequirementId: 'story-billing',
      canonicalRequirementId: 'story-billing',
      confidence: 'none',
      chunkIds: [],
    });
    expect(result).not.toHaveProperty('pages');
    expect(result.matches[0]).not.toHaveProperty('pageIds');
    expect(result.chunks).toEqual([]);
    const outline = result.warnings.find((warning) => /available HTML pages/i.test(warning));
    expect(outline).toContain('Billing portal (z-billing.html)');
    expect(outline).toContain('Account shell (a-shell.html)');
    expect(outline!.indexOf('Billing portal')).toBeLessThan(outline!.indexOf('Account shell'));
    expect(result.truncated).toBe(false);
  });

  it.each([
    {
      label: 'extensionless relative path',
      requirementRoute: 'account/settings?token=query-secret&view=summary,',
      indexedRoute: 'account/settings?token=index-secret&view=compact',
      expectedTerm: '/account/settings?token&view',
    },
    {
      label: 'leading-slash path',
      requirementRoute: '/orders/confirm?session=query-secret.',
      indexedRoute: '/orders/confirm?session=index-secret',
      expectedTerm: '/orders/confirm?session',
    },
    {
      label: 'absolute route',
      requirementRoute: 'https://example.test/app/help?token=query-secret&view=summary).',
      indexedRoute: 'https://example.test/app/help?token=index-secret&view=compact',
      expectedTerm: 'https://example.test/app/help?token&view',
    },
    {
      label: 'balanced route punctuation',
      requirementRoute: 'docs/topic_(advanced).',
      indexedRoute: 'docs/topic_(advanced)',
      expectedTerm: '/docs/topic_(advanced)',
    },
    {
      label: '.html route',
      requirementRoute: 'checkout.html?token=query-secret;',
      indexedRoute: 'checkout.html?token=index-secret',
      expectedTerm: '/checkout.html?token',
    },
    {
      label: '.htm route',
      requirementRoute: 'legacy.htm?token=query-secret!',
      indexedRoute: 'legacy.htm?token=index-secret',
      expectedTerm: '/legacy.htm?token',
    },
  ])('canonicalizes a $label and strips prose punctuation and query values', ({
    requirementRoute,
    indexedRoute,
    expectedTerm,
  }) => {
    const route = sanitizeHtmlRoute(indexedRoute);
    if (!route) throw new Error('Expected route evidence to sanitize');
    const queryRequirement = requirement({
      id: 'story-route-shape',
      level: 'story',
      title: 'Navigate',
      description: `Open ${requirementRoute} Then continue`,
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-route-shape']);
    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-route-shape'],
      pages: [page({
        pageId: 'page-route-shape',
        fileName: 'route-shape.html',
        canonicalRoute: route,
        chunks: [chunk({ id: 'chunk-route-shape', pageId: 'page-route-shape' })],
      })],
    }), { requirementIds: ['story-route-shape'] });
    const result = parseResult(serialized);

    expect(result.matches[0].chunkIds).toEqual(['chunk-route-shape']);
    expect(result.chunks[0].matchedTerms).toContain(expectedTerm);
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('index-secret');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('compact');
  });

  it('scores a quoted canonical route once under one logical route key', () => {
    const route = sanitizeHtmlRoute('/checkout');
    if (!route) throw new Error('Expected checkout route to sanitize');
    const queryRequirement = requirement({
      id: 'story-quoted-route',
      level: 'story',
      title: 'Proceed',
      description: 'Open "/checkout".',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-quoted-route']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-quoted-route'],
      pages: [page({
        pageId: 'page-quoted-route',
        fileName: 'target.html',
        pageTitle: 'Destination',
        canonicalRoute: route,
        chunks: [chunk({ id: 'chunk-quoted-route', pageId: 'page-quoted-route' })],
      })],
    }), { requirementIds: ['story-quoted-route'], maxResults: 1 }));

    expect(result.matches[0]).toMatchObject({
      confidence: 'medium',
      chunkIds: ['chunk-quoted-route'],
    });
    expect(result.chunks[0].matchedTerms).toEqual(['/checkout']);
  });

  it('preserves a quoted HTML filename as a label before removing route terms', () => {
    const queryRequirement = requirement({
      id: 'story-help-label',
      level: 'story',
      title: 'Help link',
      description: 'Choose "help.html" to continue',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-help-label']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-help-label'],
      pages: [page({
        pageId: 'page-help-label',
        fileName: 'unrelated.html',
        pageTitle: 'Unrelated',
        chunks: [chunk({
          id: 'chunk-help-label',
          pageId: 'page-help-label',
          elements: [{ tagName: 'output', domPath: '/help', label: 'help.html' }],
        })],
      })],
    }), { requirementIds: ['story-help-label'], maxResults: 1 }));

    expect(result.matches[0]).toMatchObject({
      confidence: 'high',
      chunkIds: ['chunk-help-label'],
    });
    expect(result.chunks[0].matchedTerms).toContain('help.html');
  });

  it.each([
    { source: 'Use `/checkout`.', preservesLabel: false },
    { source: 'Follow [Checkout](/checkout).', preservesLabel: true },
    { source: 'Open (/checkout), then continue.', preservesLabel: false },
  ])('unwraps Markdown and prose punctuation in "$source"', ({ source, preservesLabel }) => {
    const route = sanitizeHtmlRoute('/checkout');
    if (!route) throw new Error('Expected checkout route to sanitize');
    const queryRequirement = requirement({
      id: 'story-markdown-route',
      level: 'story',
      title: 'Proceed',
      description: source,
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-markdown-route']);
    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-markdown-route'],
      pages: [
        page({
          pageId: 'page-checkout-route',
          fileName: 'route-target.html',
          pageTitle: 'Destination',
          canonicalRoute: route,
          chunks: [chunk({ id: 'chunk-checkout-route', pageId: 'page-checkout-route' })],
        }),
        page({
          pageId: 'page-checkout-label',
          fileName: 'visible-label.html',
          pageTitle: 'Visible label',
          chunks: [chunk({
            id: 'chunk-checkout-label',
            pageId: 'page-checkout-label',
            elements: [{ tagName: 'output', domPath: '/label', label: 'Checkout' }],
          })],
        }),
      ],
    }), { requirementIds: ['story-markdown-route'], maxResults: 2 });
    const result = parseResult(serialized);

    expect(result.matches[0].chunkIds[0]).toBe('chunk-checkout-route');
    expect(result.chunks.find((item) => item.chunkId === 'chunk-checkout-route')?.matchedTerms)
      .toContain('/checkout');
    if (preservesLabel) {
      expect(result.matches[0].chunkIds).toContain('chunk-checkout-label');
      expect(result.chunks.find((item) => item.chunkId === 'chunk-checkout-label')?.matchedTerms)
        .toContain('checkout');
    } else {
      expect(result.matches[0].chunkIds).not.toContain('chunk-checkout-label');
    }
    expect(serialized).not.toContain('`');
    expect(serialized).not.toContain('[Checkout]');
  });

  it('strips markup before generic tokenization while retaining literal quoted labels', () => {
    const queryRequirement = requirement({
      id: 'story-markup',
      level: 'story',
      title: 'Markup example',
      description: '<button aria-label="Injected control"></button><p>Documented text and "Continue"</p>',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-markup']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-markup'],
      pages: [page({
        pageId: 'page-markup',
        fileName: 'reference.html',
        pageTitle: 'Reference',
        chunks: [
          chunk({
            id: 'chunk-button-markup',
            pageId: 'page-markup',
            sectionType: 'interactive',
            elements: [{ tagName: 'button', domPath: '/button' }],
          }),
          chunk({ id: 'chunk-body-markup', pageId: 'page-markup', staticText: 'Documented text' }),
          chunk({
            id: 'chunk-continue-label',
            pageId: 'page-markup',
            elements: [{ tagName: 'output', domPath: '/continue', label: 'Continue' }],
          }),
        ],
      })],
    }), { requirementIds: ['story-markup'], maxResults: 5 }));

    expect(result.matches[0].chunkIds).toContain('chunk-body-markup');
    expect(result.matches[0].chunkIds).toContain('chunk-continue-label');
    expect(result.matches[0].chunkIds).not.toContain('chunk-button-markup');
    expect(result.chunks.find((item) => item.chunkId === 'chunk-continue-label')?.matchedTerms)
      .toContain('continue');
    expect(JSON.stringify(result)).not.toContain('Injected control');
  });

  it('preserves an unterminated markup candidate as ordinary semantic text', () => {
    const queryRequirement = requirement({
      id: 'story-unterminated-markup',
      level: 'story',
      title: 'Boundary prose',
      description: 'value <limit then needle',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-unterminated-markup']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-unterminated-markup'],
      pages: [page({
        pageId: 'page-needle',
        fileName: 'evidence.html',
        pageTitle: 'Evidence',
        chunks: [chunk({ id: 'chunk-needle', pageId: 'page-needle', staticText: 'needle' })],
      })],
    }), { requirementIds: ['story-unterminated-markup'] }));

    expect(result.matches[0]).toMatchObject({ confidence: 'low', chunkIds: ['chunk-needle'] });
    expect(result.truncated).toBe(false);
  });

  it.each([
    ['markup', '<a'.repeat(4_000)],
    ['Markdown', '['.repeat(4_000)],
  ])('bounds and deterministically handles malformed repeated %s openers', (_kind, openers) => {
    expect(MAX_HTML_QUERY_TEXT_CHARS).toBe(20_000);
    const queryRequirement = requirement({
      id: 'story-malformed-query',
      level: 'story',
      title: 'Malformed input',
      description: `${openers}${' trailing'.repeat(2_000)}`,
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-malformed-query']);
    const queryContext = context({ snapshot, currentBatchRequirementIds: ['story-malformed-query'] });

    const first = queryHtmlKnowledge(queryContext, { requirementIds: ['story-malformed-query'] });
    const second = queryHtmlKnowledge(queryContext, { requirementIds: ['story-malformed-query'] });
    const result = parseResult(first);

    expect(second).toBe(first);
    expect(result.truncated).toBe(true);
    expect(result.warnings.some((warning) => /requirement query.*truncated/i.test(warning)))
      .toBe(true);
  });

  it('caps unique requirement query terms and warns when later terms are omitted', () => {
    expect(MAX_HTML_QUERY_TERMS).toBe(256);
    const terms = Array.from({ length: MAX_HTML_QUERY_TERMS + 50 }, (_, index) => `uniqueterm${index}`);
    const omittedTerm = terms.at(-1)!;
    const queryRequirement = requirement({
      id: 'story-term-cap',
      level: 'story',
      title: 'Bounded vocabulary',
      description: terms.join(' '),
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-term-cap']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-term-cap'],
      pages: [page({
        pageId: 'page-term-cap',
        fileName: 'term-cap.html',
        pageTitle: 'No overlap',
        chunks: [chunk({ id: 'chunk-omitted-term', pageId: 'page-term-cap', staticText: omittedTerm })],
      })],
    }), { requirementIds: ['story-term-cap'] }));

    expect(result.matches[0]).toMatchObject({ confidence: 'none', chunkIds: [] });
    expect(result.truncated).toBe(true);
    expect(result.warnings.some((warning) => /requirement query.*truncated/i.test(warning)))
      .toBe(true);
  });

  it('reserves requested AC identity and focus evidence before a long parent description', () => {
    const acceptanceCriterionId = 'ac-opaque-742';
    const requirements = [
      requirement({
        id: 'story-reserved-signals',
        level: 'story',
        title: 'Parent behavior',
        description: Array.from({ length: 300 }, (_, index) => `parentnoise${index}`).join(' '),
      }),
      requirement({
        id: acceptanceCriterionId,
        parentId: 'story-reserved-signals',
        level: 'ac',
        title: 'Reserved criterion',
      }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-reserved-signals']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-reserved-signals'],
      pages: [page({
        pageId: 'page-reserved-signals',
        fileName: 'evidence.html',
        pageTitle: 'Evidence',
        chunks: [chunk({
          id: 'chunk-reserved-signals',
          pageId: 'page-reserved-signals',
          elements: [{
            tagName: 'output',
            domPath: '/html/body/output',
            name: acceptanceCriterionId,
            required: true,
          }],
        })],
      })],
    }), {
      requirementIds: [acceptanceCriterionId],
      focus: 'validation',
      maxResults: 1,
    }));

    expect(result.matches[0]).toMatchObject({
      requestedRequirementId: acceptanceCriterionId,
      canonicalRequirementId: 'story-reserved-signals',
      confidence: 'high',
      chunkIds: ['chunk-reserved-signals'],
    });
    expect(result.chunks[0].matchedTerms).toEqual([acceptanceCriterionId, 'required']);
    expect(result.truncated).toBe(true);
    expect(result.warnings.some((warning) => /requirement query.*truncated/i.test(warning)))
      .toBe(true);
  });

  it('keeps fixed focus terms without reserving sibling AC identity terms', () => {
    const acceptanceCriteria = Array.from({ length: MAX_HTML_QUERY_TERMS + 20 }, (_, index) => requirement({
      id: `ac-${String(index).padStart(3, '0')}`,
      parentId: 'story-focus-cap',
      level: 'ac',
      title: '',
      position: index,
    }));
    const requirements = [
      requirement({ id: 'story-focus-cap', level: 'story', title: '' }),
      ...acceptanceCriteria,
    ];
    const snapshot = makeSnapshot(requirements, ['story-focus-cap']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-focus-cap'],
      pages: [page({
        pageId: 'page-focus-cap',
        fileName: 'bounded.html',
        pageTitle: 'Bounded',
        chunks: [chunk({
          id: 'chunk-required-focus',
          pageId: 'page-focus-cap',
          elements: [{ tagName: 'output', domPath: '/required', required: true }],
        })],
      })],
    }), { requirementIds: ['story-focus-cap'], focus: 'validation', maxResults: 1 }));

    expect(result.matches[0].chunkIds).toEqual(['chunk-required-focus']);
    expect(result.truncated).toBe(false);
  });

  it('prioritizes story semantics before an earlier oversized sibling AC', () => {
    const requirements = [
      requirement({
        id: 'story-priority',
        level: 'story',
        title: 'storypriorityneedle',
        position: 10,
      }),
      requirement({
        id: 'ac-oversized-first',
        parentId: 'story-priority',
        level: 'ac',
        title: 'Oversized sibling',
        description: 'siblingnoise '.repeat(MAX_HTML_QUERY_TEXT_CHARS),
        position: -1,
      }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-priority']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-priority'],
      pages: [page({
        pageId: 'page-story-priority',
        fileName: 'priority.html',
        pageTitle: 'Evidence',
        chunks: [chunk({
          id: 'chunk-story-priority',
          pageId: 'page-story-priority',
          staticText: 'storypriorityneedle',
        })],
      })],
    }), { requirementIds: ['story-priority'] }));

    expect(result.matches[0].chunkIds).toEqual(['chunk-story-priority']);
    expect(result.truncated).toBe(true);
  });

  it('prioritizes the requested AC semantics before an earlier oversized sibling', () => {
    const requirements = [
      requirement({ id: 'story-ac-priority', level: 'story', title: 'Parent behavior', position: 10 }),
      requirement({
        id: 'ac-oversized-sibling',
        parentId: 'story-ac-priority',
        level: 'ac',
        title: 'Earlier sibling',
        description: 'siblingnoise '.repeat(MAX_HTML_QUERY_TEXT_CHARS),
        position: -1,
      }),
      requirement({
        id: 'ac-requested-priority',
        parentId: 'story-ac-priority',
        level: 'ac',
        title: 'requestedacneedle',
        position: 5,
      }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-ac-priority']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-ac-priority'],
      pages: [page({
        pageId: 'page-ac-priority',
        fileName: 'ac-priority.html',
        pageTitle: 'Evidence',
        chunks: [chunk({
          id: 'chunk-ac-priority',
          pageId: 'page-ac-priority',
          staticText: 'requestedacneedle',
        })],
      })],
    }), { requirementIds: ['ac-requested-priority'] }));

    expect(result.matches[0]).toMatchObject({
      canonicalRequirementId: 'story-ac-priority',
      chunkIds: ['chunk-ac-priority'],
    });
    expect(result.truncated).toBe(true);
  });

  it('does not let 256 sibling AC IDs consume the story semantic term budget', () => {
    const acceptanceCriteria = Array.from({ length: MAX_HTML_QUERY_TERMS }, (_, index) => requirement({
      id: `opaque-ac-${String(index).padStart(3, '0')}`,
      parentId: 'story-semantic-priority',
      level: 'ac',
      title: `siblingsemantic${index}`,
      position: index,
    }));
    const requirements = [
      requirement({ id: 'story-semantic-priority', level: 'story', title: 'storysemanticneedle' }),
      ...acceptanceCriteria,
    ];
    const snapshot = makeSnapshot(requirements, ['story-semantic-priority']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-semantic-priority'],
      pages: [page({
        pageId: 'page-semantic-priority',
        fileName: 'semantic.html',
        pageTitle: 'Evidence',
        chunks: [chunk({
          id: 'chunk-semantic-priority',
          pageId: 'page-semantic-priority',
          staticText: 'storysemanticneedle',
        })],
      })],
    }), { requirementIds: ['story-semantic-priority'] }));

    expect(result.matches[0].chunkIds).toEqual(['chunk-semantic-priority']);
    expect(result.truncated).toBe(true);
  });

  it('treats randomId-style requirement IDs as opaque instead of searchable date fragments', () => {
    const opaqueId = 'req-20260821-171800-a1b2c3';
    const queryRequirement = requirement({
      id: opaqueId,
      level: 'story',
      title: 'Completely unrelated behavior',
    });
    const snapshot = makeSnapshot([queryRequirement], [opaqueId]);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: [opaqueId],
      pages: [page({
        pageId: 'page-copyright',
        fileName: 'legal.html',
        pageTitle: 'Legal notice',
        chunks: [chunk({
          id: 'chunk-copyright',
          pageId: 'page-copyright',
          staticText: 'Copyright 20260821 171800 a1b2c3',
        })],
      })],
    }), { requirementIds: [opaqueId] }));

    expect(result.matches[0]).toMatchObject({ confidence: 'none', chunkIds: [] });

    const exactIdentity = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: [opaqueId],
      pages: [page({
        pageId: 'page-exact-id',
        fileName: 'identity.html',
        pageTitle: 'Identity',
        chunks: [chunk({
          id: 'chunk-exact-id',
          pageId: 'page-exact-id',
          elements: [{ tagName: 'output', domPath: '/identity', id: opaqueId }],
        })],
      })],
    }), { requirementIds: [opaqueId] }));
    expect(exactIdentity.matches[0]).toMatchObject({
      confidence: 'high',
      chunkIds: ['chunk-exact-id'],
    });
  });

  it('matches parser-truncated routes by full-path SHA-256 identity', () => {
    const longPath = `/${'long-segment-'.repeat(180)}destination`;
    expect(longPath.length).toBeGreaterThan(2_000);
    const indexed = parseAndIndexHtml({
      pageId: 'page-long-route',
      fileName: 'long-route.html',
      source: decodeAndNormalizeHtml(new TextEncoder().encode(`<!doctype html><html><head>
        <title>Destination</title>
      </head><body><form action="${longPath}"><input name="neutral"></form></body></html>`)),
    }).index;
    expect(indexed.relationCandidates[0]?.target.pathTruncated).toBe(true);
    const queryRequirement = requirement({
      id: 'story-long-path',
      level: 'story',
      title: 'Execute transfer',
      description: `Navigate to ${longPath}.`,
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-long-path']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-long-path'],
      pages: [indexed],
    }), { requirementIds: ['story-long-path'] }));

    expect(result.matches[0]).toMatchObject({ confidence: 'medium' });
    expect(result.matches[0].chunkIds).toHaveLength(1);
    expect(result.chunks[0].matchedTerms).toContain(
      `route-sha256:${indexed.relationCandidates[0]?.target.fullPathSha256}`,
    );
  });

  it('rejects stale and future context/index versions even when they agree', () => {
    const queryRequirement = requirement({ id: 'story-version', level: 'story', title: 'Version' });
    const snapshot = makeSnapshot([queryRequirement], ['story-version']);
    for (const unsupportedVersion of [0, 2]) {
      const versionedPage = {
        ...page({ pageId: `page-v${unsupportedVersion}`, fileName: `v${unsupportedVersion}.html` }),
        version: unsupportedVersion,
      } as unknown as HtmlKnowledgePageIndex;
      expect(() => queryHtmlKnowledge(context({
        snapshot,
        currentBatchRequirementIds: ['story-version'],
        pages: [versionedPage],
        indexVersion: unsupportedVersion,
      }), { requirementIds: ['story-version'] })).toThrow(/index version.*1/i);
    }
  });

  it('scores a max-size chunk set once for sibling AC requests and remains deterministic', () => {
    const acceptanceCriteria = Array.from({ length: 19 }, (_, index) => requirement({
      id: `criterion-${String.fromCharCode(97 + index)}`,
      parentId: 'root-requirement',
      level: 'ac',
      title: 'canonicalneedle',
      position: index,
    }));
    const requirements = [
      requirement({ id: 'root-requirement', level: 'story', title: 'canonicalneedle' }),
      ...acceptanceCriteria,
    ];
    const requestedIds = requirements.map((item) => item.id);
    const snapshot = makeSnapshot(requirements, ['root-requirement']);
    const pages = Array.from({ length: MAX_HTML_PAGES }, (_, pageIndex) => {
      const letter = String.fromCharCode(97 + pageIndex);
      const pageId = `page-${letter}`;
      return page({
        pageId,
        fileName: `document-${letter}.html`,
        pageTitle: `Document ${letter}`,
        chunks: Array.from({ length: MAX_HTML_CHUNKS }, (_, chunkIndex) => chunk({
          id: `chunk-${letter}-${chunkIndex}`,
          pageId,
          domPath: `/section-${chunkIndex}`,
          staticText: 'unrelated',
        })),
      });
    });
    const queryContext = context({
      snapshot,
      currentBatchRequirementIds: ['root-requirement'],
      pages,
    });
    const originalSetHas = Set.prototype.has;
    let canonicalTermChecks = 0;
    let first: string;
    Set.prototype.has = function countedHas(value: unknown): boolean {
      if (value === 'canonicalneedle') canonicalTermChecks += 1;
      return originalSetHas.call(this, value);
    };
    try {
      first = queryHtmlKnowledge(queryContext, {
        requirementIds: [...requestedIds].reverse(),
        maxResults: 1,
      });
    } finally {
      Set.prototype.has = originalSetHas;
    }

    expect(canonicalTermChecks).toBeLessThan(50_000);
    const second = queryHtmlKnowledge({
      ...queryContext,
      pages: [...pages].reverse().map((item) => ({ ...item, chunks: [...item.chunks].reverse() })),
    }, { requirementIds: requestedIds, maxResults: 1 });
    expect(second).toBe(first);
  });

  it('uses one inverted evidence pass for 20 distinct stories across 10,000 chunks', () => {
    const requirements = Array.from({ length: MAX_HTML_PAGES }, (_, index) => requirement({
      id: `distinct-story-${String.fromCharCode(97 + index)}`,
      level: 'story',
      title: `distinctneedle${String.fromCharCode(97 + index)}`,
    }));
    const ids = requirements.map((item) => item.id);
    const snapshot = makeSnapshot(requirements, ids);
    const pages = Array.from({ length: MAX_HTML_PAGES }, (_, pageIndex) => {
      const letter = String.fromCharCode(97 + pageIndex);
      const pageId = `distinct-page-${letter}`;
      return page({
        pageId,
        fileName: `evidence-${letter}.html`,
        pageTitle: `Evidence ${letter}`,
        chunks: Array.from({ length: MAX_HTML_CHUNKS }, (_, chunkIndex) => chunk({
          id: `distinct-chunk-${letter}-${chunkIndex}`,
          pageId,
          domPath: `/section-${chunkIndex}`,
          staticText: 'unrelated',
        })),
      });
    });
    const queryContext = context({ snapshot, currentBatchRequirementIds: ids, pages });
    const originalSetHas = Set.prototype.has;
    let distinctTermChecks = 0;
    let first: string;
    Set.prototype.has = function countedHas(value: unknown): boolean {
      if (typeof value === 'string' && value.startsWith('distinctneedle')) {
        distinctTermChecks += 1;
      }
      return originalSetHas.call(this, value);
    };
    try {
      first = queryHtmlKnowledge(queryContext, { requirementIds: [...ids].reverse(), maxResults: 1 });
    } finally {
      Set.prototype.has = originalSetHas;
    }

    expect(distinctTermChecks).toBeLessThan(100_000);
    expect(parseResult(first).matches).toHaveLength(MAX_HTML_PAGES);
    const second = queryHtmlKnowledge({
      ...queryContext,
      pages: [...pages].reverse().map((item) => ({ ...item, chunks: [...item.chunks].reverse() })),
    }, { requirementIds: ids, maxResults: 1 });
    expect(second).toBe(first);
  });

  it('enforces exact confidence boundaries for each base scoring category', () => {
    const routeEvidence = sanitizeHtmlRoute('/route-target');
    if (!routeEvidence) throw new Error('Expected route evidence to sanitize');
    const cases: Array<{
      id: string;
      title: string;
      expectedConfidence: 'high' | 'medium' | 'low';
      evidence: HtmlKnowledgeChunk;
      pageTitle?: string;
      canonicalRoute?: SanitizedHtmlRoute;
    }> = [
      {
        id: 'identity',
        title: 'identitytoken',
        expectedConfidence: 'high',
        evidence: chunk({
          id: 'chunk-identity-boundary',
          pageId: 'page-boundaries',
          elements: [{ tagName: 'input', domPath: '/identity', id: 'identitytoken' }],
        }),
      },
      {
        id: 'accessibility',
        title: 'accessibletoken',
        expectedConfidence: 'high',
        evidence: chunk({
          id: 'chunk-accessibility-boundary',
          pageId: 'page-boundaries',
          elements: [{
            tagName: 'button',
            domPath: '/accessibility',
            accessibleNameCandidate: 'accessibletoken',
          }],
        }),
      },
      {
        id: 'quoted-label',
        title: '"the"',
        expectedConfidence: 'high',
        evidence: chunk({
          id: 'chunk-quoted-label-boundary',
          pageId: 'page-boundaries',
          elements: [{ tagName: 'output', domPath: '/quoted-label', label: 'the' }],
        }),
      },
      {
        id: 'heading',
        title: 'headingtoken',
        expectedConfidence: 'medium',
        evidence: chunk({ id: 'chunk-heading-boundary', pageId: 'page-boundaries', heading: 'headingtoken' }),
      },
      {
        id: 'form',
        title: 'form',
        expectedConfidence: 'medium',
        evidence: chunk({ id: 'chunk-form-boundary', pageId: 'page-boundaries', sectionType: 'form' }),
      },
      {
        id: 'page-title',
        title: 'pagetoken',
        expectedConfidence: 'medium',
        pageTitle: 'pagetoken',
        evidence: chunk({ id: 'chunk-page-boundary', pageId: 'page-boundaries' }),
      },
      {
        id: 'route',
        title: '/route-target',
        expectedConfidence: 'medium',
        canonicalRoute: routeEvidence,
        evidence: chunk({ id: 'chunk-route-boundary', pageId: 'page-boundaries' }),
      },
      {
        id: 'label-six',
        title: 'labeltoken',
        expectedConfidence: 'medium',
        evidence: chunk({
          id: 'chunk-label-six',
          pageId: 'page-boundaries',
          elements: [{ tagName: 'input', domPath: '/label-six', label: 'labeltoken' }],
        }),
      },
      {
        id: 'validation',
        title: 'validationtoken',
        expectedConfidence: 'medium',
        evidence: chunk({
          id: 'chunk-validation-boundary',
          pageId: 'page-boundaries',
          elements: [{ tagName: 'output', domPath: '/validation', validationText: 'validationtoken' }],
        }),
      },
      {
        id: 'label-twelve',
        title: 'firstlabel secondlabel',
        expectedConfidence: 'high',
        evidence: chunk({
          id: 'chunk-label-twelve',
          pageId: 'page-boundaries',
          elements: [
            { tagName: 'input', domPath: '/label-twelve/one', label: 'firstlabel' },
            { tagName: 'input', domPath: '/label-twelve/two', label: 'secondlabel' },
          ],
        }),
      },
      {
        id: 'constraint',
        title: 'required',
        expectedConfidence: 'medium',
        evidence: chunk({
          id: 'chunk-constraint-boundary',
          pageId: 'page-boundaries',
          elements: [{ tagName: 'output', domPath: '/constraint', required: true }],
        }),
      },
      {
        id: 'body-three',
        title: 'bodyone',
        expectedConfidence: 'low',
        evidence: chunk({ id: 'chunk-body-three', pageId: 'page-boundaries', staticText: 'bodyone' }),
      },
      {
        id: 'body-six',
        title: 'bodyone bodytwo',
        expectedConfidence: 'medium',
        evidence: chunk({ id: 'chunk-body-six', pageId: 'page-boundaries', staticText: 'bodyone bodytwo' }),
      },
      {
        id: 'body-twelve',
        title: 'bodyone bodytwo bodythree bodyfour',
        expectedConfidence: 'high',
        evidence: chunk({
          id: 'chunk-body-twelve',
          pageId: 'page-boundaries',
          staticText: 'bodyone bodytwo bodythree bodyfour',
        }),
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const storyId = `story-case-${index}`;
      const queryRequirement = requirement({ id: storyId, level: 'story', title: testCase.title });
      const snapshot = makeSnapshot([queryRequirement], [storyId]);
      const result = parseResult(queryHtmlKnowledge(context({
        snapshot,
        currentBatchRequirementIds: [storyId],
        pages: [page({
          pageId: 'page-boundaries',
          fileName: 'unrelated.html',
          pageTitle: testCase.pageTitle ?? 'Unrelated page',
          canonicalRoute: testCase.canonicalRoute,
          chunks: [testCase.evidence],
        })],
      }), { requirementIds: [storyId], maxResults: 1 }));

      expect(result.matches[0].confidence, testCase.id).toBe(testCase.expectedConfidence);
    }
  });

  it('ranks min=-1 above min=1 without collapsing the signed boundary', () => {
    const queryRequirement = requirement({
      id: 'story-negative-boundary',
      level: 'story',
      title: 'Minimum -1',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-negative-boundary']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-negative-boundary'],
      pages: [page({
        pageId: 'page-boundary',
        fileName: 'bounds.html',
        pageTitle: 'Bounds',
        chunks: [
          chunk({
            id: 'chunk-positive-one',
            pageId: 'page-boundary',
            domPath: '/a-positive',
            elements: [{ tagName: 'output', domPath: '/a-positive/output', min: '1' }],
          }),
          chunk({
            id: 'chunk-negative-one',
            pageId: 'page-boundary',
            domPath: '/z-negative',
            elements: [{ tagName: 'output', domPath: '/z-negative/output', min: '-1' }],
          }),
        ],
      })],
    }), { requirementIds: ['story-negative-boundary'], maxResults: 2 }));

    expect(result.matches[0].chunkIds).toEqual(['chunk-negative-one', 'chunk-positive-one']);
    expect(result.chunks.find((item) => item.chunkId === 'chunk-negative-one')?.matchedTerms)
      .toContain('-1');
    expect(result.chunks.find((item) => item.chunkId === 'chunk-positive-one')?.matchedTerms)
      .not.toContain('-1');
  });

  it('applies a single +2 relation boost across the medium/high boundary and ranking', () => {
    const queryRequirement = requirement({
      id: 'story-relation-boundary',
      level: 'story',
      title: 'headingterm bodyterm exactterm',
    });
    const snapshot = makeSnapshot([queryRequirement], ['story-relation-boundary']);
    const pageA = page({
      pageId: 'page-a',
      fileName: 'a.html',
      chunks: [chunk({
        id: 'chunk-eleven',
        pageId: 'page-a',
        heading: 'headingterm',
        staticText: 'bodyterm',
      })],
    });
    const pageB = page({
      pageId: 'page-b',
      fileName: 'b.html',
      chunks: [chunk({ id: 'chunk-three', pageId: 'page-b', staticText: 'bodyterm' })],
    });
    const pageC = page({
      pageId: 'page-c',
      fileName: 'c.html',
      chunks: [chunk({
        id: 'chunk-twelve',
        pageId: 'page-c',
        elements: [{ tagName: 'input', domPath: '/exact', id: 'exactterm' }],
      })],
    });
    const queryContext = context({
      snapshot,
      currentBatchRequirementIds: ['story-relation-boundary'],
      pages: [pageA, pageB],
    });

    const withoutRelation = parseResult(queryHtmlKnowledge(queryContext, {
      requirementIds: ['story-relation-boundary'],
      maxResults: 2,
    }));
    const withRelation = parseResult(queryHtmlKnowledge({
      ...queryContext,
      relations: [relation('page-a', 'page-b')],
    }, { requirementIds: ['story-relation-boundary'], maxResults: 2 }));
    const rankingWithoutRelation = parseResult(queryHtmlKnowledge({
      ...queryContext,
      pages: [pageA, pageB, pageC],
    }, { requirementIds: ['story-relation-boundary'], maxResults: 3 }));
    const rankingWithRelation = parseResult(queryHtmlKnowledge({
      ...queryContext,
      pages: [pageA, pageB, pageC],
      relations: [relation('page-a', 'page-b')],
    }, { requirementIds: ['story-relation-boundary'], maxResults: 3 }));

    expect(withoutRelation.matches[0].confidence).toBe('medium');
    expect(withRelation.matches[0].confidence).toBe('high');
    expect(rankingWithoutRelation.matches[0].chunkIds.slice(0, 2)).toEqual(['chunk-twelve', 'chunk-eleven']);
    expect(rankingWithRelation.matches[0].chunkIds.slice(0, 2)).toEqual(['chunk-eleven', 'chunk-twelve']);
  });

  it('accepts a current-batch flow blueprint AC ID without allowing its parent flow implicitly', () => {
    const requirements = [
      requirement({ id: 'epic-checkout', level: 'epic', title: 'Checkout' }),
      requirement({
        id: 'story-checkout-flow',
        parentId: 'epic-checkout',
        level: 'story',
        title: 'Checkout flow',
        isFlow: true,
      }),
      requirement({
        id: 'ac-checkout-happy',
        parentId: 'story-checkout-flow',
        level: 'ac',
        title: 'Complete order',
      }),
    ];
    const snapshot = makeSnapshot(requirements, [], ['story-checkout-flow']);
    const queryContext = context({
      snapshot,
      currentBatchRequirementIds: ['ac-checkout-happy'],
      pages: [page({
        pageId: 'page-checkout',
        fileName: 'checkout.html',
        chunks: [chunk({ id: 'chunk-checkout', pageId: 'page-checkout', heading: 'Complete order' })],
      })],
    });

    const result = parseResult(queryHtmlKnowledge(queryContext, {
      requirementIds: ['ac-checkout-happy'],
    }));

    expect(result.matches[0]).toMatchObject({
      requestedRequirementId: 'ac-checkout-happy',
      canonicalRequirementId: 'story-checkout-flow',
      chunkIds: ['chunk-checkout'],
    });
    expect(() => queryHtmlKnowledge(queryContext, { requirementIds: ['story-checkout-flow'] }))
      .toThrow(/current batch/i);
  });

  it('caps result warnings at 20 and marks additional warnings as truncated', () => {
    const queryRequirement = requirement({ id: 'story-warnings', level: 'story', title: 'warningterm' });
    const snapshot = makeSnapshot([queryRequirement], ['story-warnings']);
    const result = parseResult(queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-warnings'],
      pages: [page({
        pageId: 'page-warnings',
        fileName: 'warnings.html',
        chunks: [chunk({ id: 'chunk-warnings', pageId: 'page-warnings', staticText: 'warningterm' })],
        warnings: Array.from({ length: 25 }, (_, index) => `warning-${String(index).padStart(2, '0')}`),
      })],
    }), { requirementIds: ['story-warnings'] }));

    expect(result.warnings).toHaveLength(20);
    expect(new Set(result.warnings).size).toBe(20);
    expect(result.truncated).toBe(true);
  });

  it('accepts a complete object at exactly 6,000 UTF-16 code units and rejects the next unit atomically', () => {
    const queryRequirement = requirement({ id: 'story-exact-cap', level: 'story', title: 'boundarytoken' });
    const snapshot = makeSnapshot([queryRequirement], ['story-exact-cap']);
    const serializeWithFiller = (fillerLength: number) => queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-exact-cap'],
      pages: [page({
        pageId: 'page-exact-cap',
        fileName: 'exact-cap.html',
        pageTitle: 'Exact cap',
        chunks: [chunk({
          id: 'chunk-exact-cap',
          pageId: 'page-exact-cap',
          staticText: `boundarytoken ${'s'.repeat(1_800)}`,
          elements: [{
            tagName: 'input',
            domPath: '/html/body/input',
            id: 'boundarytoken',
            label: 'l'.repeat(1_800),
            validationText: 'v'.repeat(fillerLength),
          }],
        })],
      })],
    }), { requirementIds: ['story-exact-cap'], maxResults: 1 });

    const base = serializeWithFiller(0);
    const fillerLength = MAX_HTML_TOOL_CHARS - base.length;
    expect(fillerLength).toBeGreaterThan(0);
    expect(fillerLength).toBeLessThanOrEqual(2_000);

    const exact = serializeWithFiller(fillerLength);
    expect(exact).toHaveLength(MAX_HTML_TOOL_CHARS);
    expect(JSON.stringify(JSON.parse(exact))).toBe(exact);
    expect((JSON.parse(exact) as HtmlKnowledgeQueryResult).matches[0].chunkIds)
      .toEqual(['chunk-exact-cap']);

    const over = serializeWithFiller(fillerLength + 1);
    const overResult = parseResult(over);
    expect(overResult.matches[0].chunkIds).toEqual([]);
    expect(overResult.truncated).toBe(true);
  });

  it('is deterministic across normalized query, snapshot, page, chunk, and relation input order', () => {
    const requirements = [
      requirement({ id: 'story-alpha', level: 'story', title: 'shared alpha' }),
      requirement({ id: 'story-beta', level: 'story', title: 'shared beta' }),
    ];
    const snapshot = makeSnapshot(requirements, ['story-alpha', 'story-beta']);
    const pages = [
      page({
        pageId: 'page-z',
        fileName: 'z.html',
        chunks: [chunk({ id: 'chunk-z', pageId: 'page-z', staticText: 'shared beta' })],
      }),
      page({
        pageId: 'page-a',
        fileName: 'a.html',
        chunks: [
          chunk({ id: 'chunk-a2', pageId: 'page-a', domPath: '/b', staticText: 'shared alpha' }),
          chunk({ id: 'chunk-a1', pageId: 'page-a', domPath: '/a', staticText: 'shared alpha' }),
        ],
      }),
    ];
    const relations = [relation('page-z', 'page-a', '/z/a'), relation('page-a', 'page-z', '/a/z')];
    const first = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-alpha', 'story-beta'],
      pages,
      relations,
    }), { requirementIds: ['story-alpha', 'story-beta'], focus: 'all', maxResults: 3 });
    const second = queryHtmlKnowledge(context({
      snapshot: {
        ...snapshot,
        selectedRequirementIds: [...snapshot.selectedRequirementIds].reverse(),
        records: [...snapshot.records].reverse(),
      },
      currentBatchRequirementIds: ['story-beta', 'story-alpha'],
      pages: [...pages].reverse().map((item) => ({ ...item, chunks: [...item.chunks].reverse() })),
      relations: [...relations].reverse(),
    }), { requirementIds: ['story-beta', 'story-alpha'], focus: 'all', maxResults: 3 });

    expect(second).toBe(first);
  });

  it('adds only complete evidence objects and returns compact valid JSON at the exact UTF-16 limit check', () => {
    const queryRequirement = requirement({ id: 'story-cap', level: 'story', title: 'capword' });
    const snapshot = makeSnapshot([queryRequirement], ['story-cap']);
    const capPage = page({
      pageId: 'page-cap',
      fileName: 'cap.html',
      chunks: Array.from({ length: 10 }, (_, index) => chunk({
        id: `chunk-cap-${index}`,
        pageId: 'page-cap',
        domPath: `/html/body/section:nth-of-type(${index + 1})`,
        staticText: `capword ${'😀'.repeat(240)}`,
      })),
    });

    const serialized = queryHtmlKnowledge(context({
      snapshot,
      currentBatchRequirementIds: ['story-cap'],
      pages: [capPage],
    }), { requirementIds: ['story-cap'], maxResults: 10 });
    const result = parseResult(serialized);

    expect(serialized.length).toBeGreaterThan(4_000);
    expect(serialized.length).toBeLessThanOrEqual(6_000);
    expect(JSON.stringify(result)).toBe(serialized);
    expect(result.truncated).toBe(true);
    expect(result.chunks.every((item) => item.staticText?.endsWith('😀'))).toBe(true);
  });
});
