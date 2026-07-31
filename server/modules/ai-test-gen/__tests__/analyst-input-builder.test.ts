import { describe, expect, it } from 'vitest';
import {
  buildAnalystInput,
  type AnalystInputContext,
} from '../analyst-input-builder.ts';

describe('buildAnalystInput', () => {
  const epic = { id: 'epic-auth', title: 'Authentication System', description: 'Auth epic' };

  const flowStory = {
    id: 'story-auth-session',
    title: 'Login Session Flow',
    level: 'story',
    parentId: 'epic-auth',
    description: 'End-to-end auth journey',
    isFlow: true,
    acceptanceCriteria: [
      {
        id: 'ac-auth-session-1',
        title: 'User submits valid credentials',
        description: 'Given valid creds\nWhen the user submits\nThen the auth API returns 200',
        flowType: 'flow',
        relatedRequirementIds: ['story-auth-login-ui', 'story-auth-login-validation'],
      },
    ],
  };

  const componentStory = {
    id: 'story-auth-login-ui',
    title: 'Login UI',
    level: 'story',
    parentId: 'epic-auth',
    description: 'Login form display',
    isFlow: false,
    acceptanceCriteria: [
      {
        id: 'ac-auth-login-ui-form',
        title: 'Form display',
        description: 'Given on login page\nWhen loaded\nThen form renders',
        flowType: 'atomic',
        relatedRequirementIds: [],
      },
    ],
  };

  // Simulate the orchestrator's per-flow-keyed map with duplicate component
  // stories (same component referenced by multiple flows).
  const flowReferencedComponentContext = {
    'story-auth-session': [
      {
        id: 'story-auth-login-ui',
        title: 'Login UI',
        description: 'Login form display',
        epicId: 'epic-auth',
        epicTitle: 'Authentication System',
        isFlow: false,
        acceptanceCriteria: [
          { id: 'ac-auth-login-ui-form', title: 'Form display', description: 'Given on login page\nWhen loaded\nThen form renders', flowType: 'atomic' },
        ],
      },
    ],
    'story-auth-login-reports-flow': [
      {
        id: 'story-auth-login-ui',
        title: 'Login UI',
        description: 'Login form display',
        epicId: 'epic-auth',
        epicTitle: 'Authentication System',
        isFlow: false,
        acceptanceCriteria: [
          { id: 'ac-auth-login-ui-form', title: 'Form display', description: 'Given on login page\nWhen loaded\nThen form renders', flowType: 'atomic' },
        ],
      },
      {
        id: 'story-auth-reports',
        title: 'Reports Dashboard',
        description: 'Reports page',
        epicId: 'epic-reports',
        epicTitle: 'Reports & Analytics',
        isFlow: false,
        acceptanceCriteria: [
          { id: 'ac-reports-cards', title: 'Summary cards', description: 'Given on reports page', flowType: 'atomic' },
        ],
      },
    ],
  };

  // ── Flow mode: NO businessFlows ──

  it('does NOT include businessFlows in the output', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [flowStory],
      flowReferencedComponentContext,
      generationMode: 'flow',
    });

    expect(out.businessFlows).toBeUndefined();
  });

  // ── Flow mode: referencedComponentContext as lookup for relatedRequirementIds ──

  it('provides referencedComponentContext as a flat deduplicated lookup for relatedRequirementIds', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [flowStory],
      flowReferencedComponentContext,
      generationMode: 'flow',
    });

    expect(out.referencedComponentContext).toBeDefined();
    expect(Array.isArray(out.referencedComponentContext)).toBe(true);
    // story-auth-login-ui appears in both flows but deduplicated to 1
    expect(out.referencedComponentContext).toHaveLength(2);

    const ctxArr = out.referencedComponentContext as { id: string; title: string; acs: { id: string; title: string }[]; description?: string; epicId?: string }[];
    const loginUi = ctxArr.find((c) => c.id === 'story-auth-login-ui');
    expect(loginUi).toEqual({
      id: 'story-auth-login-ui',
      title: 'Login UI',
      acs: [{ id: 'ac-auth-login-ui-form', title: 'Form display' }],
    });
    // No verbose fields
    expect(loginUi?.description).toBeUndefined();
    expect(loginUi?.epicId).toBeUndefined();

    const reports = ctxArr.find((c) => c.id === 'story-auth-reports');
    expect(reports).toEqual({
      id: 'story-auth-reports',
      title: 'Reports Dashboard',
      acs: [{ id: 'ac-reports-cards', title: 'Summary cards' }],
    });
  });

  // ── Component mode: no flow fields ──

  it('does NOT include businessFlows or referencedComponentContext in component mode', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [componentStory],
      flowReferencedComponentContext,
      generationMode: 'component',
    });

    expect(out.businessFlows).toBeUndefined();
    expect(out.referencedComponentContext).toBeUndefined();
    expect(out.stories).toHaveLength(1);
    expect(out.stories[0]).toMatchObject({ id: 'story-auth-login-ui' });
  });

  // ── AC dedup in stories[] ──

  it('deduplicates AC-level items from stories[] — ACs appear only nested under their parent story', () => {
    const acAsTopLevel = {
      id: 'ac-auth-login-ui-form',
      title: 'Form display',
      level: 'ac',
      parentId: 'story-auth-login-ui',
      description: 'Given on login page\nWhen loaded\nThen form renders',
      isFlow: false,
      acceptanceCriteria: [],
    };

    const out = buildAnalystInput({
      epic,
      currentBatch: [componentStory, acAsTopLevel],
      generationMode: 'component',
    });

    expect(out.stories).toHaveLength(1);
    expect(out.stories[0]).toMatchObject({ id: 'story-auth-login-ui' });
    expect(out.stories[0].acs).toHaveLength(1);
    expect(out.stories[0].acs[0]).toMatchObject({ id: 'ac-auth-login-ui-form' });
  });

  // ── Flow stories still carry full AC detail ──

  it('still serializes flow story ACs with given/when/then and relatedRequirementIds', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [flowStory],
      flowReferencedComponentContext,
      generationMode: 'flow',
    });

    expect(out.stories).toHaveLength(1);
    expect(out.stories[0]).toMatchObject({
      id: 'story-auth-session',
      title: 'Login Session Flow',
      description: 'End-to-end auth journey',
    });
    expect(out.stories[0].acs).toHaveLength(1);
    expect(out.stories[0].acs[0]).toMatchObject({
      id: 'ac-auth-session-1',
      title: 'User submits valid credentials',
      relatedRequirementIds: ['story-auth-login-ui', 'story-auth-login-validation'],
    });
    // No pathType — LLM infers path type from AC semantics
    expect(out.stories[0].acs[0].pathType).toBeUndefined();
  });

  // ── Mixed mode: component + flow stories in one batch ──

  it('includes BOTH component and flow stories in mixed mode', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [componentStory, flowStory],
      flowReferencedComponentContext,
      generationMode: 'mixed',
    });

    // Both stories are retained (no isFlow filtering in mixed mode)
    expect(out.stories).toHaveLength(2);
    const storyIds = (out.stories as { id: string }[]).map(s => s.id);
    expect(storyIds).toContain('story-auth-login-ui');
    expect(storyIds).toContain('story-auth-session');

    // referencedComponentContext is present so the Analyst can cross-reference
    // component conditions for flow dependencies within the SAME batch.
    expect(out.referencedComponentContext).toBeDefined();
    expect(Array.isArray(out.referencedComponentContext)).toBe(true);
  });

  it('includes referencedComponentContext in mixed mode even with a single flow', () => {
    const out = buildAnalystInput({
      epic,
      currentBatch: [componentStory, flowStory],
      flowReferencedComponentContext: {
        'story-auth-session': [
          {
            id: 'story-auth-login-ui',
            title: 'Login UI',
            isFlow: false,
            acceptanceCriteria: [{ id: 'ac-auth-login-ui-form', title: 'Form display' }],
          },
        ],
      },
      generationMode: 'mixed',
    });

    const ctxArr = out.referencedComponentContext as { id: string; title: string; acs: { id: string; title: string }[] }[];
    expect(ctxArr).toHaveLength(1);
    expect(ctxArr[0]).toEqual({
      id: 'story-auth-login-ui',
      title: 'Login UI',
      acs: [{ id: 'ac-auth-login-ui-form', title: 'Form display' }],
    });
  });
});
