import { describe, expect, it } from 'vitest';

import { buildBusinessFlowBlueprints } from '../business-flow-blueprint.ts';

describe('buildBusinessFlowBlueprints', () => {
  it('expands approved business flows into pipeline blueprints', () => {
    const blueprints = buildBusinessFlowBlueprints({
      flows: [
        {
          id: 'flow-1',
          projectId: 'proj-1',
          name: 'Checkout',
          description: '',
          type: 'happy-path',
          status: 'APPROVED',
          steps: [{ sequence: 1, requirementIds: ['story-1'], actionSummary: 'User signs in' }],
        },
      ],
      requirements: [
        {
          id: 'story-1',
          projectId: 'proj-1',
          parentId: 'feature-1',
          title: 'Sign in',
          description: '',
          dependencies: [],
          level: 'story',
          priority: 'MEDIUM',
          status: 'DRAFT',
          tags: [],
          position: 0,
          metadata: {},
        },
        {
          id: 'ac-1',
          projectId: 'proj-1',
          parentId: 'story-1',
          title: 'Successful sign in',
          description: '',
          dependencies: [],
          level: 'ac',
          priority: 'MEDIUM',
          status: 'DRAFT',
          tags: [],
          position: 0,
          metadata: {},
        },
      ],
    });

    expect(blueprints).toEqual([
      {
        id: 'flow-1',
        name: 'Checkout',
        type: 'happy-path',
        steps: [
          {
            sequence: 1,
            requirementId: 'story-1',
            requirementTitle: 'Sign in',
            requirementLevel: 'story',
            actionSummary: 'User signs in',
            acceptanceCriteria: ['Successful sign in'],
          },
        ],
      },
    ]);
  });
});
