import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted mock so the module-under-test picks it up at import time
const mockRequirementRepo = vi.hoisted(() => ({
  listByProject: vi.fn(() => [] as any[]),
  get: vi.fn(),
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

  it('emits one blueprint per AC — each AC is a separate business flow path', () => {
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

    const acChildren: Requirement[] = [
      {
        id: 'ac-1',
        projectId: 'proj-1',
        parentId: 'story-flow-1',
        title: 'Happy path: user signs in and checks out',
        description: 'Given the user is on the login page\nWhen the user signs in\nThen the checkout completes',
        level: 'ac',
        status: 'APPROVED',
        position: 1,
        relatedRequirementIds: ['story-1'],
      },
      {
        id: 'ac-2',
        projectId: 'proj-1',
        parentId: 'story-flow-1',
        title: 'Exception: invalid credentials block checkout',
        description: 'Given the user is on the login page\nWhen the user enters invalid credentials\nThen an error is shown',
        level: 'ac',
        status: 'APPROVED',
        position: 2,
        relatedRequirementIds: [],
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

    // Two ACs → two blueprints (two separate paths)
    expect(blueprints).toHaveLength(2);

    // First AC
    expect(blueprints[0]).toMatchObject({
      id: 'ac-1',
      flowStoryId: 'story-flow-1',
      name: 'Checkout — Happy path: user signs in and checks out',
    });
    expect(blueprints[0].steps).toHaveLength(1);
    expect(blueprints[0].steps[0]).toMatchObject({
      sequence: 1,
      requirementId: 'story-1',
      requirementIds: ['story-1'],
      requirementTitle: 'Sign in story',
      requirementLevel: 'story',
      actionSummary: 'Happy path: user signs in and checks out',
      acceptanceCriteria: ['Given the user is on the login page\nWhen the user signs in\nThen the checkout completes'],
    });

    // Second AC
    expect(blueprints[1]).toMatchObject({
      id: 'ac-2',
      flowStoryId: 'story-flow-1',
      name: 'Checkout — Exception: invalid credentials block checkout',
    });
    expect(blueprints[1].steps).toHaveLength(1);
    expect(blueprints[1].steps[0]).toMatchObject({
      sequence: 1,
      requirementId: 'story-flow-1',
      requirementIds: [],
      requirementTitle: 'Exception: invalid credentials block checkout',
      requirementLevel: 'story',
      actionSummary: 'Exception: invalid credentials block checkout',
    });
  });

  it('returns empty array for flow story with no AC children', () => {
    const story: Requirement = {
      id: 'story-flow-4', projectId: 'proj-1', title: 'Empty flow', description: '',
      level: 'story', status: 'APPROVED', position: 0, isFlow: true,
    };

    mockRequirementRepo.listByProject.mockReturnValue([]);
    mockRequirementRepo.get.mockReturnValue(undefined);

    const blueprints = buildBlueprintsFromFlowStories({ flowStories: [story] });
    // No ACs → no paths → no blueprints
    expect(blueprints).toEqual([]);
  });

  it('emits blueprints for multiple flow stories', () => {
    const story1: Requirement = {
      id: 'story-a', projectId: 'proj-1', title: 'Flow A', description: '',
      level: 'story', status: 'APPROVED', position: 0, isFlow: true,
    };
    const story2: Requirement = {
      id: 'story-b', projectId: 'proj-1', title: 'Flow B', description: '',
      level: 'story', status: 'APPROVED', position: 1, isFlow: true,
    };
    const ac1: Requirement = {
      id: 'ac-a-1', projectId: 'proj-1', parentId: 'story-a',
      title: 'Happy path', description: 'desc-a',
      level: 'ac', status: 'APPROVED', position: 1, relatedRequirementIds: [],
    };
    const ac2: Requirement = {
      id: 'ac-b-1', projectId: 'proj-1', parentId: 'story-b',
      title: 'Error: timeout', description: 'desc-b',
      level: 'ac', status: 'APPROVED', position: 1, relatedRequirementIds: [],
    };

    mockRequirementRepo.listByProject.mockReturnValue([ac1, ac2]);
    mockRequirementRepo.get.mockReturnValue(undefined);

    const blueprints = buildBlueprintsFromFlowStories({ flowStories: [story1, story2] });
    expect(blueprints).toHaveLength(2);
    expect(blueprints[0]).toMatchObject({ id: 'ac-a-1', flowStoryId: 'story-a', name: 'Flow A — Happy path' });
    expect(blueprints[1]).toMatchObject({ id: 'ac-b-1', flowStoryId: 'story-b', name: 'Flow B — Error: timeout' });
  });
});
