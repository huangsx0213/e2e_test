// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { HtmlKnowledgeDataError, type BoundHtmlKnowledgeData } from '../html-knowledge/repository.ts';
import { hashHtmlRequirementSnapshot } from '../html-knowledge/requirement-snapshot.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  MAX_HTML_CACHE_ENTRIES,
  MAX_HTML_TOOL_CHARS,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgeReference,
  type HtmlRequirementSnapshot,
} from '../html-knowledge/types.ts';
import {
  HtmlKnowledgeCriticalError,
  createHtmlKnowledgeQueryCache,
  makeHtmlKnowledgeQuery,
  type ResolvedHtmlKnowledgeRuntime,
} from '../graph/skills/html-knowledge.ts';
import type { BatchRequirement } from '../graph/state.ts';

const EVIDENCE_MARKER = 'FULL_EVIDENCE_MARKER';

function makeSnapshot(): HtmlRequirementSnapshot {
  return {
    version: 1,
    projectId: 'project-1',
    selectedRequirementIds: ['story-login', 'story-outside'],
    selectedFlowIds: ['story-flow'],
    records: [
      {
        id: 'epic-auth',
        projectId: 'project-1',
        level: 'epic',
        title: 'Authentication',
        description: '',
        position: 0,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: [],
      },
      {
        id: 'story-login',
        projectId: 'project-1',
        level: 'story',
        parentId: 'epic-auth',
        title: 'Sign in',
        description: `${EVIDENCE_MARKER} email form`,
        position: 1,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: [],
      },
      {
        id: 'ac-login-email',
        projectId: 'project-1',
        level: 'ac',
        parentId: 'story-login',
        title: 'Validate email',
        description: 'Given an invalid email Then show an error',
        position: 1,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: [],
      },
      {
        id: 'ac-login-unselected',
        projectId: 'project-1',
        level: 'ac',
        parentId: 'story-login',
        title: 'Unselected login behavior',
        description: 'This AC is in the snapshot but not nested in the current batch',
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
        title: 'Login navigation flow',
        description: 'Continue to the dashboard',
        position: 2,
        status: 'APPROVED',
        flowType: null,
        isFlow: true,
        relatedRequirementIds: [],
      },
      {
        id: 'ac-flow-dashboard',
        projectId: 'project-1',
        level: 'ac',
        parentId: 'story-flow',
        title: 'Open dashboard',
        description: 'When Continue is selected Then navigate to Dashboard',
        position: 1,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: ['story-login'],
      },
      {
        id: 'story-outside',
        projectId: 'project-1',
        level: 'story',
        parentId: 'epic-auth',
        title: 'Profile',
        description: 'Edit profile details',
        position: 3,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: [],
      },
    ],
  };
}

function makePage(): HtmlKnowledgePageIndex {
  return {
    version: HTML_KNOWLEDGE_INDEX_VERSION,
    pageId: 'page-login',
    fileName: 'login.html',
    fileNameKey: 'login.html',
    pageTitle: 'Sign in',
    contentSha256: 'a'.repeat(64),
    informationLevel: 'NORMAL',
    routeAliases: [],
    chunks: [{
      id: 'chunk-login-form',
      pageId: 'page-login',
      sectionType: 'form',
      heading: 'Account access',
      domPath: '/html/body/main/form',
      staticText: `${EVIDENCE_MARKER} Email address Continue Dashboard`,
      elements: [{
        tagName: 'input',
        domPath: '/html/body/main/form/input',
        id: 'email',
        label: 'Email address',
        required: true,
        validationText: 'Enter a valid email address',
      }],
      searchTerms: [],
    }],
    relationCandidates: [],
    warnings: ['source warning must not be persisted'],
  };
}

function makeBoundData(snapshot = makeSnapshot()): BoundHtmlKnowledgeData {
  const page = makePage();
  const requirementSnapshotHash = hashHtmlRequirementSnapshot(snapshot);
  return {
    set: {
      id: 'set-1',
      project_id: 'project-1',
      run_id: 'run-1',
      status: 'BOUND',
      page_count: 1,
      total_bytes: 123,
      page_graph: '[]',
      index_version: HTML_KNOWLEDGE_INDEX_VERSION,
      requirement_snapshot: JSON.stringify(snapshot),
      requirement_snapshot_hash: requirementSnapshotHash,
      created_at: '2026-08-22 00:00:00',
      updated_at: '2026-08-22 00:00:00',
    },
    pages: [page],
    relations: [],
    requirementSnapshot: snapshot,
  };
}

function makeReference(snapshot = makeSnapshot()): HtmlKnowledgeReference {
  return {
    knowledgeSetId: 'set-1',
    pageCount: 1,
    totalBytes: 123,
    pageTitles: ['Sign in'],
    hasLowInformationPages: false,
    requirementSnapshotHash: hashHtmlRequirementSnapshot(snapshot),
  };
}

function makeRuntime(input: {
  snapshot?: HtmlRequirementSnapshot;
  bound?: BoundHtmlKnowledgeData | undefined;
  load?: () => BoundHtmlKnowledgeData | undefined;
  verify?: () => void;
  cache?: ResolvedHtmlKnowledgeRuntime['cache'];
  reference?: HtmlKnowledgeReference;
} = {}): ResolvedHtmlKnowledgeRuntime & {
  repository: {
    verifyBoundReference: ReturnType<typeof vi.fn>;
    loadBoundSetByRun: ReturnType<typeof vi.fn>;
  };
} {
  const snapshot = input.snapshot ?? makeSnapshot();
  const bound = input.bound === undefined ? makeBoundData(snapshot) : input.bound;
  return {
    projectId: 'project-1',
    reference: input.reference ?? makeReference(snapshot),
    snapshot,
    cache: input.cache ?? createHtmlKnowledgeQueryCache(),
    repository: {
      verifyBoundReference: vi.fn(input.verify ?? (() => undefined)),
      loadBoundSetByRun: vi.fn(input.load ?? (() => bound)),
    },
    dispose: vi.fn(),
  };
}

function makeSkill(
  runtime = makeRuntime(),
  currentBatch: readonly BatchRequirement[] = [{
    id: 'story-login',
    title: 'Sign in',
    level: 'story',
    parentId: 'epic-auth',
    acceptanceCriteria: [{ id: 'ac-login-email', title: 'Validate email' }],
  }],
) {
  return {
    runtime,
    skill: makeHtmlKnowledgeQuery({
      runId: 'run-1',
      currentBatch,
      runtime,
    }),
  };
}

describe('html_knowledge_query skill', () => {
  it('normalizes batched input and lets retrieval canonicalize an AC to its parent story', async () => {
    const { skill } = makeSkill();
    const input = {
      requirementIds: ['story-login', 'ac-login-email', 'story-login'],
    };

    const serialized = await skill.func(input);
    const result = JSON.parse(String(serialized));
    const projection = skill.summarizeForState!(input, serialized, {
      latencyMs: 17,
      resultSize: String(serialized).length,
    });

    expect(String(serialized).length).toBeLessThanOrEqual(MAX_HTML_TOOL_CHARS);
    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestedRequirementId: 'ac-login-email',
        canonicalRequirementId: 'story-login',
      }),
    ]));
    expect(projection.input).toEqual({
      requirementIds: ['ac-login-email', 'story-login'],
      focus: 'all',
      maxResults: 5,
    });
    expect(projection.output).toMatchObject({
      resultChars: String(serialized).length,
      confidence: expect.arrayContaining([
        expect.objectContaining({
          requestedRequirementId: 'ac-login-email',
          canonicalRequirementId: 'story-login',
          confidence: 'high',
        }),
      ]),
      pageIds: ['page-login'],
      chunkIds: ['chunk-login-form'],
      omittedRequirementIds: [],
      truncated: false,
      cacheHit: false,
    });
    const projectedHistory = {
      agent: 'test_analyst',
      skillName: skill.name,
      input: projection.input,
      output: projection.output,
      latencyMs: 17,
      timestamp: 1,
    };
    expect(projectedHistory).toMatchObject({
      agent: 'test_analyst',
      skillName: 'html_knowledge_query',
      input: {
        requirementIds: ['ac-login-email', 'story-login'],
        focus: 'all',
      },
      output: {
        resultChars: String(serialized).length,
        pageIds: ['page-login'],
        chunkIds: ['chunk-login-form'],
      },
      latencyMs: 17,
    });
    const persisted = JSON.stringify(projectedHistory);
    expect(persisted).not.toContain(EVIDENCE_MARKER);
    expect(persisted).not.toMatch(/staticText|elements|relations|warnings|source/);
  });

  it('allows selected flow stories and their ACs from the immutable snapshot', async () => {
    const { skill } = makeSkill(makeRuntime(), [
      {
        id: 'story-login',
        title: 'Sign in',
        level: 'story',
        parentId: 'epic-auth',
        acceptanceCriteria: [{ id: 'ac-login-email', title: 'Validate email' }],
      },
      {
        id: 'story-flow',
        title: 'Login navigation flow',
        level: 'story',
        parentId: 'epic-auth',
        isFlow: true,
        acceptanceCriteria: [{ id: 'ac-flow-dashboard', title: 'Open dashboard' }],
      },
    ]);

    const result = JSON.parse(String(await skill.func({
      requirementIds: ['story-flow', 'ac-flow-dashboard'],
      focus: 'navigation',
    })));

    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestedRequirementId: 'story-flow',
        canonicalRequirementId: 'story-flow',
      }),
      expect.objectContaining({
        requestedRequirementId: 'ac-flow-dashboard',
        canonicalRequirementId: 'story-flow',
      }),
    ]));
  });

  it('rejects a run-selected flow from another batch without loading the repository', async () => {
    const { skill, runtime } = makeSkill();

    const flowStoryResult = JSON.parse(String(await skill.func({
      requirementIds: 'story-flow',
    })));
    const flowAcResult = JSON.parse(String(await skill.func({
      requirementIds: 'ac-flow-dashboard',
    })));

    expect(flowStoryResult).toMatchObject({ error: 'INVALID_HTML_KNOWLEDGE_QUERY' });
    expect(flowAcResult).toMatchObject({ error: 'INVALID_HTML_KNOWLEDGE_QUERY' });
    expect(runtime.repository.loadBoundSetByRun).not.toHaveBeenCalled();
  });

  it('accepts repeated IDs after unique normalization and rejects snapshot ACs omitted from the batch', async () => {
    const { skill, runtime } = makeSkill();

    const repeated = JSON.parse(String(await skill.func({
      requirementIds: Array.from({ length: 21 }, () => 'story-login'),
    })));
    const disallowed = JSON.parse(String(await skill.func({
      requirementIds: 'ac-login-unselected',
    })));

    expect(repeated.matches).toHaveLength(1);
    expect(disallowed).toMatchObject({ error: 'INVALID_HTML_KNOWLEDGE_QUERY' });
    expect(runtime.repository.loadBoundSetByRun).toHaveBeenCalledTimes(1);
  });

  it('returns bounded corrective errors for malformed or disallowed model arguments without loading source', async () => {
    const { skill, runtime } = makeSkill();
    const invalidInputs: unknown[] = [
      null,
      {},
      { requirementIds: [] },
      { requirementIds: Array.from({ length: 21 }, (_, index) => `req-${index}`) },
      { requirementIds: 'story-login', focus: 'scripts' },
      { requirementIds: 'story-login', maxResults: 0 },
      { requirementIds: 'story-login', maxResults: 1.5 },
      '{not-json',
      { requirementIds: 'story-outside' },
    ];

    for (const input of invalidInputs) {
      const serialized = String(await skill.func(input as Record<string, unknown>));
      const result = JSON.parse(serialized);
      expect(serialized.length).toBeLessThanOrEqual(500);
      expect(result).toMatchObject({ error: 'INVALID_HTML_KNOWLEDGE_QUERY' });
      expect(result).not.toHaveProperty('source');
      expect(serialized).not.toContain(EVIDENCE_MARKER);
    }
    expect(runtime.repository.loadBoundSetByRun).not.toHaveBeenCalled();
  });

  it('verifies every call but full-loads one immutable context across cache hits and misses', async () => {
    const { skill, runtime } = makeSkill();

    await skill.func({ requirementIds: 'story-login' });
    await skill.func({ requirementIds: 'story-login' });
    await skill.func({ requirementIds: 'ac-login-email', focus: 'validation' });

    expect(runtime.repository.verifyBoundReference).toHaveBeenCalledTimes(3);
    expect(runtime.repository.verifyBoundReference).toHaveBeenNthCalledWith(
      1,
      'run-1',
      'project-1',
      makeReference(),
    );
    expect(runtime.repository.loadBoundSetByRun).toHaveBeenCalledTimes(1);
    expect(runtime.repository.loadBoundSetByRun).toHaveBeenCalledWith(
      'project-1',
      'run-1',
      'set-1',
    );
  });

  it('treats a lightweight binding verification failure as critical without loading indexes', async () => {
    const runtime = makeRuntime({
      verify: () => {
        throw new HtmlKnowledgeDataError('Bound set is missing or mismatched');
      },
    });
    const { skill } = makeSkill(runtime);

    await expect(skill.func({ requirementIds: 'story-login' }))
      .rejects.toBeInstanceOf(HtmlKnowledgeCriticalError);
    expect(runtime.repository.loadBoundSetByRun).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', () => undefined],
    ['mismatched set', () => ({
      ...makeBoundData(),
      set: { ...makeBoundData().set, id: 'set-other' },
    })],
    ['mismatched run', () => ({
      ...makeBoundData(),
      set: { ...makeBoundData().set, run_id: 'run-other' },
    })],
    ['mismatched index version', () => ({
      ...makeBoundData(),
      set: { ...makeBoundData().set, index_version: 999 },
    })],
    ['mismatched snapshot hash', () => ({
      ...makeBoundData(),
      set: { ...makeBoundData().set, requirement_snapshot_hash: '0'.repeat(64) },
    })],
    ['corrupt repository data', () => {
      throw new HtmlKnowledgeDataError('stored index contains private details');
    }],
  ])('throws a typed critical failure for %s', async (_name, load) => {
    const runtime = makeRuntime({ load: load as () => BoundHtmlKnowledgeData | undefined });
    const { skill } = makeSkill(runtime);

    await expect(skill.func({ requirementIds: 'story-login' }))
      .rejects.toBeInstanceOf(HtmlKnowledgeCriticalError);
  });

  it('keys cache entries by binding, snapshot, sorted IDs, focus, and limit', async () => {
    const backing = createHtmlKnowledgeQueryCache();
    const observedKeys: string[] = [];
    const cache: ResolvedHtmlKnowledgeRuntime['cache'] = {
      get(key) {
        observedKeys.push(key);
        return backing.get(key);
      },
      set: (key, value) => backing.set(key, value),
      getRetrievalContext: (key) => backing.getRetrievalContext(key),
      setRetrievalContext: (key, context) => backing.setRetrievalContext(key, context),
      clear: () => backing.clear(),
      dispose: () => backing.dispose(),
    };
    const { skill } = makeSkill(makeRuntime({ cache }));

    const firstInput = {
      requirementIds: ['story-login', 'ac-login-email'],
      focus: 'validation' as const,
      maxResults: 3,
    };
    const first = await skill.func(firstInput);
    const firstSummary = skill.summarizeForState!(firstInput, first, {
      latencyMs: 1,
      resultSize: String(first).length,
    });
    const reorderedInput = {
      requirementIds: ['ac-login-email', 'story-login'],
      focus: 'validation' as const,
      maxResults: 3,
    };
    const second = await skill.func(reorderedInput);
    const secondSummary = skill.summarizeForState!(reorderedInput, second, {
      latencyMs: 1,
      resultSize: String(second).length,
    });
    await skill.func({ ...firstInput, focus: 'interaction' });
    await skill.func({ ...firstInput, maxResults: 4 });

    expect(second).toBe(first);
    expect(firstSummary.output).toMatchObject({ cacheHit: false });
    expect(secondSummary.output).toMatchObject({ cacheHit: true });
    expect(observedKeys[1]).toBe(observedKeys[0]);
    expect(observedKeys[2]).not.toBe(observedKeys[0]);
    expect(observedKeys[3]).not.toBe(observedKeys[0]);
    expect(observedKeys[0]).toContain('set-1');
    expect(observedKeys[0]).toContain(String(HTML_KNOWLEDGE_INDEX_VERSION));
    expect(observedKeys[0]).toContain(makeReference().requirementSnapshotHash);
  });

  it('uses an isolated 100-entry FIFO cache and exposes clear/dispose', () => {
    const cache = createHtmlKnowledgeQueryCache();
    const otherRunCache = createHtmlKnowledgeQueryCache();

    for (let index = 0; index <= MAX_HTML_CACHE_ENTRIES; index += 1) {
      cache.set(`key-${index}`, `value-${index}`);
    }

    expect(cache.size).toBe(MAX_HTML_CACHE_ENTRIES);
    expect(cache.get('key-0')).toBeUndefined();
    expect(cache.get('key-1')).toBe('value-1');
    expect(otherRunCache.get('key-1')).toBeUndefined();

    cache.clear();
    expect(cache.size).toBe(0);
    cache.set('after-clear', 'value');
    cache.dispose();
    expect(cache.size).toBe(0);
  });

  it('captures an immutable snapshot when the skill is created', async () => {
    const snapshot = makeSnapshot();
    const bound = makeBoundData(makeSnapshot());
    const runtime = makeRuntime({ snapshot, bound });
    const { skill } = makeSkill(runtime);
    (snapshot.records[1] as { description: string }).description = 'MUTATED_AFTER_BINDING';

    const result = String(await skill.func({ requirementIds: 'story-login' }));

    expect(result).toContain(EVIDENCE_MARKER);
    expect(result).not.toContain('MUTATED_AFTER_BINDING');
  });
});
