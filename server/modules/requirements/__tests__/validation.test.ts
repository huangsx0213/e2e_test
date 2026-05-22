import { describe, expect, it } from 'vitest';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import { ValidationError } from '../../../shared/http/errors.ts';
import { validateRequirementDependencies } from '../validation.ts';

function makeRequirement(overrides: Partial<Requirement> & { id: string; projectId: string; title: string }): Requirement {
  return {
    id: overrides.id,
    projectId: overrides.projectId,
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

describe('validateRequirementDependencies', () => {
  it('rejects self dependencies', () => {
    expect(() => validateRequirementDependencies(
      makeRequirement({ id: 'req-1', projectId: 'proj-1', title: 'Self', dependencies: ['req-1'] }),
      [],
    )).toThrowError(ValidationError);
  });

  it('rejects cycles introduced by an update', () => {
    const existing = [
      makeRequirement({ id: 'req-1', projectId: 'proj-1', title: 'A', dependencies: ['req-2'] }),
      makeRequirement({ id: 'req-2', projectId: 'proj-1', title: 'B', dependencies: [] }),
    ];

    expect(() => validateRequirementDependencies(
      makeRequirement({ id: 'req-2', projectId: 'proj-1', title: 'B', dependencies: ['req-1'] }),
      existing,
    )).toThrow('Requirement dependencies cannot contain cycles.');
  });

  it('rejects dependencies on non-story requirements', () => {
    const existing = [
      makeRequirement({ id: 'story-1', projectId: 'proj-1', title: 'Story A', level: 'story' }),
      makeRequirement({ id: 'ac-1', projectId: 'proj-1', title: 'AC A', level: 'ac' }),
    ];

    expect(() => validateRequirementDependencies(
      makeRequirement({ id: 'story-1', projectId: 'proj-1', title: 'Story A', dependencies: ['ac-1'], level: 'story' }),
      existing,
    )).toThrow('Story dependencies must reference other story requirements.');
  });

  it('rejects dependencies on non-story source requirements', () => {
    expect(() => validateRequirementDependencies(
      makeRequirement({ id: 'feature-1', projectId: 'proj-1', title: 'Feature A', level: 'feature', dependencies: ['story-1'] }),
      [makeRequirement({ id: 'story-1', projectId: 'proj-1', title: 'Story A', level: 'story' })],
    )).toThrow('Only story requirements can declare dependencies.');
  });
});
