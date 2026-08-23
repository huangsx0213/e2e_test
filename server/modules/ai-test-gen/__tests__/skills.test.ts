import { describe, expect, it, vi } from 'vitest';
import { hashHtmlRequirementSnapshot } from '../html-knowledge/requirement-snapshot.ts';
import type { HtmlRequirementSnapshot } from '../html-knowledge/types.ts';
import { createHtmlKnowledgeQueryCache } from '../graph/skills/html-knowledge.ts';
import {
  buildAnalystSkills,
  buildDesignerSkills,
  buildQualitySkills,
} from '../graph/skills/skills.ts';

describe('istqb_guide skill', () => {
  it('loads specific guides when techniques are provided as human-readable names', async () => {
    const skills = buildAnalystSkills('test-run', 'test-project');
    const skill = skills.find((entry) => entry.name === 'istqb_guide');
    expect(skill).toBeDefined();

    const result = await skill!.func({
      techniques: ['Decision Table Testing', 'State Transition Testing'],
    });

    const text = String(result);
    expect(text).toContain('Decision Table');
    expect(text).toContain('State Transition');
  });

  it('loads use-case guidance when techniques are passed in snake_case form', async () => {
    const skills = buildAnalystSkills('test-run', 'test-project');
    const skill = skills.find((entry) => entry.name === 'istqb_guide');
    expect(skill).toBeDefined();

    const result = await skill!.func({
      techniques: ['use_case_testing'],
    });

    expect(String(result)).toContain('Use Case');
  });
});

describe('role skill builders', () => {
  const builders = [buildAnalystSkills, buildDesignerSkills, buildQualitySkills];

  it('omits html_knowledge_query for every role when no validated runtime is present', () => {
    for (const buildSkills of builders) {
      expect(buildSkills('run-1', 'project-1').map((skill) => skill.name))
        .not.toContain('html_knowledge_query');
    }
  });

  it('appends html_knowledge_query for every role when a validated runtime is present', () => {
    const snapshot: HtmlRequirementSnapshot = {
      version: 1,
      projectId: 'project-1',
      selectedRequirementIds: ['story-1'],
      selectedFlowIds: [],
      records: [{
        id: 'story-1',
        projectId: 'project-1',
        level: 'story',
        title: 'Story',
        description: '',
        position: 0,
        status: 'APPROVED',
        flowType: null,
        isFlow: false,
        relatedRequirementIds: [],
      }],
    };
    const runtime = {
      projectId: 'project-1',
      snapshot,
      reference: {
        knowledgeSetId: 'set-1',
        pageCount: 0,
        totalBytes: 0,
        pageTitles: [],
        hasLowInformationPages: false,
        requirementSnapshotHash: hashHtmlRequirementSnapshot(snapshot),
      },
      repository: { verifyBoundReference: vi.fn(), loadBoundSetByRun: vi.fn() },
      cache: createHtmlKnowledgeQueryCache(),
      dispose: vi.fn(),
    };

    for (const buildSkills of builders) {
      const names = buildSkills(
        'run-1',
        'project-1',
        [{ id: 'story-1', title: 'Story', level: 'story', parentId: '' }],
        runtime,
      ).map((skill) => skill.name);
      expect(names.filter((name) => name === 'html_knowledge_query')).toHaveLength(1);
    }
  });
});
