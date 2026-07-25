import { describe, expect, it } from 'vitest';

import { buildBusinessFlowBlueprints } from '../business-flow-blueprint.ts';

describe('buildBusinessFlowBlueprints', () => {
  it('builds lightweight blueprints from approved business flows', () => {
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
        {
          id: 'flow-2',
          projectId: 'proj-1',
          name: 'Draft flow',
          description: '',
          type: 'alternate',
          status: 'DRAFT',
          steps: [],
        },
      ],
    });

    // Only APPROVED flows; steps retain a summary (requirementIds + actionSummary)
    // so preparation can filter relevant flows and the LLM knows flow scale.
    expect(blueprints).toEqual([
      {
        id: 'flow-1',
        name: 'Checkout',
        type: 'happy-path',
        steps: [
          {
            sequence: 1,
            requirementId: 'story-1',
            requirementIds: ['story-1'],
            requirementTitle: 'User signs in',
            requirementLevel: 'story',
            actionSummary: 'User signs in',
            acceptanceCriteria: [],
          },
        ],
      },
    ]);
  });
});
