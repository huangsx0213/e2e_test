import { describe, expect, it } from 'vitest';

import type { BusinessFlow, Requirement } from '../../../../shared/contracts/index.ts';
import { ValidationError } from '../../../shared/http/errors.ts';
import { validateBusinessFlowForApproval } from '../validation.ts';

function makeRequirement(overrides: Partial<Requirement> & { id: string; title: string }): Requirement {
  return {
    id: overrides.id,
    projectId: 'proj-1',
    parentId: null,
    title: overrides.title,
    description: '',
    dependencies: [],
    level: 'story',
    priority: 'MEDIUM',
    status: 'DRAFT',
    tags: [],
    position: 0,
    metadata: {},
    ...overrides,
  };
}

function makeFlow(overrides: Partial<BusinessFlow> = {}): BusinessFlow {
  return {
    id: 'flow-1',
    projectId: 'proj-1',
    name: 'Checkout',
    description: '',
    type: 'happy-path',
    status: 'DRAFT',
    steps: [{ sequence: 1, requirementIds: ['req-1'], actionSummary: 'User signs in' }],
    ...overrides,
  };
}

describe('validateBusinessFlowForApproval', () => {
  it('rejects non-contiguous sequence values', () => {
    expect(() => validateBusinessFlowForApproval(
      makeFlow({
        steps: [
          { sequence: 1, requirementIds: ['req-1'], actionSummary: 'One' },
          { sequence: 3, requirementIds: ['req-2'], actionSummary: 'Two' },
        ],
      }),
      [makeRequirement({ id: 'req-1', title: 'One' }), makeRequirement({ id: 'req-2', title: 'Two' })],
    )).toThrow('Business flow steps must use contiguous sequence values.');
  });

  it('rejects unknown requirement references', () => {
    expect(() => validateBusinessFlowForApproval(
      makeFlow(),
      [],
    )).toThrowError(ValidationError);
  });

  it('rejects non-story requirement references', () => {
    expect(() => validateBusinessFlowForApproval(
      makeFlow(),
      [makeRequirement({ id: 'req-1', title: 'Feature', level: 'epic' })],
    )).toThrow('Business flow steps must reference story requirements only.');
  });
});
