import { describe, expect, it } from 'vitest';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import { ValidationError } from '../../../shared/http/errors.ts';
import {
  validateRequirementFlowType,
  validateRequirementIsFlow,
  validateRelatedRequirementIds,
} from '../validation.ts';

function makeRequirement(overrides: Partial<Requirement> & { id: string; projectId: string; title: string }): Requirement {
  return {
    id: overrides.id,
    projectId: overrides.projectId,
    parentId: null,
    title: overrides.title,
    description: '',
    level: 'story',
    flowType: null,
    status: 'DRAFT',
    position: 0,
    ...overrides,
  } as Requirement;
}

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

  it('passes when isFlow is true, level is story', () => {
    expect(() =>
      validateRequirementIsFlow(
        makeRequirement({ id: 'r1', projectId: 'p1', title: 'T', level: 'story', isFlow: true }),
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
