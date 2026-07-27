import { describe, expect, it } from 'vitest';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import { ValidationError } from '../../../shared/http/errors.ts';
import {
  validateRequirementDependencies,
  validateRequirementHumanId,
  validateRequirementFlowType,
  validateRequirementIsFlow,
  validateRelatedRequirementIds,
} from '../validation.ts';

function makeRequirement(overrides: Partial<Requirement> & { id: string; projectId: string; title: string }): Requirement {
  return {
    id: overrides.id,
    projectId: overrides.projectId,
    parentId: null,
    humanId: null,
    title: overrides.title,
    description: '',
    dependencies: [],
    level: 'story',
    flowType: null,
    status: 'DRAFT',
    position: 0,
    ...overrides,
  } as Requirement;
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
      makeRequirement({ id: 'feature-1', projectId: 'proj-1', title: 'Feature A', level: 'epic', dependencies: ['story-1'] }),
      [makeRequirement({ id: 'story-1', projectId: 'proj-1', title: 'Story A', level: 'story' })],
    )).toThrow('Only story requirements can declare dependencies.');
  });
});

describe('validateRequirementHumanId', () => {
  it('accepts undefined humanId', () => {
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', humanId: undefined }),
        [],
      ),
    ).not.toThrow();
  });

  it('accepts null humanId', () => {
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', humanId: null }),
        [],
      ),
    ).not.toThrow();
  });

  it('rejects humanId with invalid characters', () => {
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', humanId: 'auth 007' }),
        [],
      ),
    ).toThrow(ValidationError);
  });

  it('rejects humanId not starting with uppercase letter', () => {
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', humanId: '1AUTH' }),
        [],
      ),
    ).toThrow(ValidationError);
  });

  it('rejects humanId duplicate within same project', () => {
    const existing = [
      makeRequirement({ id: 'r1', projectId: 'p1', title: 'A', humanId: 'AUTH-007' }),
    ];
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r2', projectId: 'p1', title: 'B', humanId: 'AUTH-007' }),
        existing,
      ),
    ).toThrow(ValidationError);
  });

  it('accepts same humanId for same row (self-allowed)', () => {
    const existing = [
      makeRequirement({ id: 'r1', projectId: 'p1', title: 'A', humanId: 'AUTH-007' }),
    ];
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'A', humanId: 'AUTH-007' }),
        existing,
      ),
    ).not.toThrow();
  });

  it('accepts same humanId in different projects', () => {
    const existing = [
      makeRequirement({ id: 'r1', projectId: 'p1', title: 'A', humanId: 'AUTH-007' }),
    ];
    expect(() =>
      validateRequirementHumanId(
        makeRequirement({ id: 'r2', projectId: 'p2', title: 'B', humanId: 'AUTH-007' }),
        existing,
      ),
    ).not.toThrow();
  });
});

describe('validateRequirementFlowType', () => {
  it('accepts flowType on AC level', () => {
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', flowType: 'atomic' }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', flowType: 'flow' }),
      ),
    ).not.toThrow();
  });

  it('accepts null flowType on AC level', () => {
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', flowType: null }),
      ),
    ).not.toThrow();
  });

  it('rejects flowType on story level', () => {
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', flowType: 'atomic' }),
      ),
    ).toThrow(ValidationError);
  });

  it('rejects flowType on epic level', () => {
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'epic', flowType: 'flow' }),
      ),
    ).toThrow(ValidationError);
  });

  it('accepts undefined/null flowType on non-AC level', () => {
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', flowType: null }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRequirementFlowType(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', flowType: undefined }),
      ),
    ).not.toThrow();
  });
});

describe('validateRequirementIsFlow', () => {
  it('passes when isFlow is undefined', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story' }),
      ),
    ).not.toThrow();
  });

  it('passes when isFlow is false', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', isFlow: false }),
      ),
    ).not.toThrow();
  });

  it('throws when isFlow is true but level is not story', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'epic', isFlow: true }),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', isFlow: true }),
      ),
    ).toThrow('isFlow may only be set on story-level requirements');
  });

  it('throws when isFlow is true and dependencies is non-empty', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', isFlow: true, dependencies: ['r2'] }),
      ),
    ).toThrow('Flow stories cannot declare dependencies');
  });

  it('passes when isFlow is true, level is story, and no dependencies', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', isFlow: true, dependencies: [] }),
      ),
    ).not.toThrow();
  });
});

describe('validateRelatedRequirementIds', () => {
  it('passes when relatedRequirementIds is undefined', () => {
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac' }),
        [],
      ),
    ).not.toThrow();
  });

  it('passes when relatedRequirementIds is empty', () => {
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', relatedRequirementIds: [] }),
        [],
      ),
    ).not.toThrow();
  });

  it('throws when set on non-AC level requirements', () => {
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', relatedRequirementIds: ['r2'] }),
        [makeRequirement({ id: 'r2', projectId: 'p1', title: 'Other', level: 'story' })],
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'epic', relatedRequirementIds: ['r2'] }),
        [makeRequirement({ id: 'r2', projectId: 'p1', title: 'Other', level: 'story' })],
      ),
    ).toThrow('relatedRequirementIds may only be set on AC-level requirements');
  });

  it('throws when referencing unknown requirement ID', () => {
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', relatedRequirementIds: ['missing'] }),
        [makeRequirement({ id: 'r2', projectId: 'p1', title: 'Other', level: 'story' })],
      ),
    ).toThrow('relatedRequirementIds references unknown requirement: missing');
  });

  it('throws when referencing itself', () => {
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac', relatedRequirementIds: ['r1'] }),
        [makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'ac' })],
      ),
    ).toThrow('relatedRequirementIds cannot reference itself');
  });

  it('passes when all IDs exist and level is ac', () => {
    const existing = [
      makeRequirement({ id: 'r1', projectId: 'p1', title: 'AC', level: 'ac' }),
      makeRequirement({ id: 'r2', projectId: 'p1', title: 'Story', level: 'story' }),
    ];
    expect(() =>
      validateRelatedRequirementIds(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'AC', level: 'ac', relatedRequirementIds: ['r2'] }),
        existing,
      ),
    ).not.toThrow();
  });
});
