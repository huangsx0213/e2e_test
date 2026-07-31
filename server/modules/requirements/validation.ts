import type { Requirement } from '../../shared/contracts/index.ts';
import { ValidationError } from '../../shared/http/errors.ts';

export function validateRequirementFlowType(requirement: Requirement): void {
  if (requirement.flowType === undefined || requirement.flowType === null) {
    return;
  }

  if (requirement.level !== 'ac') {
    throw new ValidationError(
      `flowType may only be set on AC-level requirements (got level="${requirement.level}").`,
    );
  }

  if (requirement.flowType !== 'atomic' && requirement.flowType !== 'flow') {
    throw new ValidationError(
      `flowType must be "atomic" or "flow" (got "${requirement.flowType}").`,
    );
  }
}

export function validateRequirementIsFlow(
  requirement: Requirement,
): void {
  if (!requirement.isFlow) return;
  if (requirement.level !== 'story') {
    throw new ValidationError(`isFlow may only be set on story-level requirements (got level="${requirement.level}").`);
  }
}

export function validateRelatedRequirementIds(
  requirement: Requirement,
  existingRequirements: Requirement[],
): void {
  const ids = requirement.relatedRequirementIds;
  if (!ids || ids.length === 0) return;
  if (requirement.level !== 'ac') {
    throw new ValidationError(`relatedRequirementIds may only be set on AC-level requirements (got level="${requirement.level}").`);
  }
  const requirementIds = new Set(existingRequirements.map((r) => r.id));
  for (const refId of ids) {
    if (!requirementIds.has(refId)) {
      throw new ValidationError(`relatedRequirementIds references unknown requirement: ${refId}`);
    }
    if (refId === requirement.id) {
      throw new ValidationError('relatedRequirementIds cannot reference itself.');
    }
  }
}
