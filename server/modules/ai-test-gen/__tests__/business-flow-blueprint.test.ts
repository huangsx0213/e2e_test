import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted mock so the module-under-test picks it up at import time
const mockRequirementRepo = vi.hoisted(() => ({
  listByProject: vi.fn(() => [] as any[]),
  get: vi.fn(() => undefined),
}));

vi.mock('../../requirements/repository.ts', () => ({
  requirementRepo: mockRequirementRepo,
}));

import { buildBlueprintsFromFlowStories } from '../business-flow-blueprint.ts';
import type { Requirement } from '../../../shared/contracts/index.ts';

describe('buildBlueprintsFromFlowStories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds blueprints from flow stories using AC children as steps', () => {
    const story: Requirement = {
      id: 'story-flow-1',
      projectId: 'proj-1',
      title: 'Checkout',
      description: '',
      level: 'story',
      status: 'APPROVED',
      position: 0,
      isFlow: true,
    };

    // AC children of the flow story, in unsorted order to verify sort
    const acChildren: Requirement[] = [
      {
        id: 'ac-2',
        projectId: 'proj-1',
        parentId: 'story-flow-1',
        title: 'User views cart',
        description: '',
        level: 'ac',
        status: 'APPROVED',
        position: 2,
        relatedRequirementIds: [],
      },
      {
        id: 'ac-1',
        projectId: 'proj-1',
        parentId: 'story-flow-1',
        title: 'User signs in',
        description: 'Given the user is on the login page',
        level: 'ac',
        status: 'APPROVED',
        position: 1,
        relatedRequirementIds: ['story-1'],
      },
    ];

    const primaryReq: Requirement = {
      id: 'story-1',
      projectId: 'proj-1',
      title: 'Sign in story',
      description: '',
      level: 'story',
      status: 'APPROVED',
      position: 0,
    };

    mockRequirementRepo.listByProject.mockReturnValue([...acChildren, primaryReq]);
    mockRequirementRepo.get.mockImplementation((id: string) =>
      id === 'story-1' ? primaryReq : undefined,
    );

    const blueprints = buildBlueprintsFromFlowStories({ flowStories: [story] });

    // Steps come from AC children (sorted by position); requirementIds from
    // ac.relatedRequirementIds; primaryReqId falls back to story.id when empty;
    // requirementTitle falls back to ac.title when primary req not found;
    // acceptanceCriteria = [ac.description].filter(Boolean)
    expect(blueprints).toEqual([
      {
        id: 'story-flow-1',
        name: 'Checkout',
        type: 'happy-path',
        steps: [
          {
            sequence: 1,
            requirementId: 'story-1',
            requirementIds: ['story-1'],
            requirementTitle: 'Sign in story',
            requirementLevel: 'story',
            actionSummary: 'User signs in',
            acceptanceCriteria: ['Given the user is on the login page'],
          },
          {
            sequence: 2,
            requirementId: 'story-flow-1',
            requirementIds: [],
            requirementTitle: 'User views cart',
            requirementLevel: 'story',
            actionSummary: 'User views cart',
            acceptanceCriteria: [],
          },
        ],
      },
    ]);
  });

  it('returns empty steps array for flow story with no AC children', () => {
    const story: Requirement = {
      id: 'story-flow-2',
      projectId: 'proj-1',
      title: 'Empty flow',
      description: '',
      level: 'story',
      status: 'APPROVED',
      position: 0,
      isFlow: true,
    };

    mockRequirementRepo.listByProject.mockReturnValue([]);
    mockRequirementRepo.get.mockReturnValue(undefined);

    const blueprints = buildBlueprintsFromFlowStories({ flowStories: [story] });

    expect(blueprints).toEqual([
      {
        id: 'story-flow-2',
        name: 'Empty flow',
        type: 'happy-path',
        steps: [],
      },
    ]);
  });
});
