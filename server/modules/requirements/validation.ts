import type { Requirement } from '../../shared/contracts/index.ts';
import { ValidationError } from '../../shared/http/errors.ts';

export function validateRequirementDependencies(requirement: Requirement, existingRequirements: Requirement[]): void {
  const dependencies = requirement.dependencies || [];

  if (dependencies.length > 0 && requirement.level !== 'story') {
    throw new ValidationError('Only story requirements can declare dependencies.');
  }

  if (dependencies.includes(requirement.id)) {
    throw new ValidationError('Requirement cannot depend on itself.');
  }

  const requirements = existingRequirements
    .filter((candidate) => candidate.id !== requirement.id)
    .concat(requirement);
  const requirementIds = new Set(requirements.map((candidate) => candidate.id));

  const requirementMap = new Map(requirements.map((candidate) => [candidate.id, candidate]));

  for (const dependencyId of dependencies) {
    if (!requirementIds.has(dependencyId)) {
      throw new ValidationError(`Unknown requirement dependency: ${dependencyId}`);
    }

    const dependency = requirementMap.get(dependencyId);
    if (!dependency || dependency.level !== 'story') {
      throw new ValidationError('Story dependencies must reference other story requirements.');
    }
  }

  const adjacency = new Map(requirements.map((candidate) => [candidate.id, candidate.dependencies || []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }

    if (visiting.has(id)) {
      throw new ValidationError('Requirement dependencies cannot contain cycles.');
    }

    visiting.add(id);
    for (const dependencyId of adjacency.get(id) || []) {
      visit(dependencyId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const candidate of requirements) {
    visit(candidate.id);
  }
}

const HUMAN_ID_PATTERN = /^[A-Z][A-Z0-9_-]*$/;

export function validateRequirementHumanId(
  requirement: Requirement,
  existingRequirements: Requirement[],
): void {
  if (requirement.humanId === undefined || requirement.humanId === null || requirement.humanId === '') {
    return;
  }

  if (!HUMAN_ID_PATTERN.test(requirement.humanId)) {
    throw new ValidationError(
      `humanId must match pattern ${HUMAN_ID_PATTERN.source} (uppercase letter followed by uppercase letters, digits, hyphens, or underscores). Got: "${requirement.humanId}"`,
    );
  }

  const collision = existingRequirements.find(
    (candidate) =>
      candidate.id !== requirement.id &&
      candidate.projectId === requirement.projectId &&
      candidate.humanId === requirement.humanId,
  );
  if (collision) {
    throw new ValidationError(
      `humanId "${requirement.humanId}" is already used by another requirement (${collision.id}) in the same project.`,
    );
  }
}

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
  if (requirement.dependencies && requirement.dependencies.length > 0) {
    throw new ValidationError('Flow stories cannot declare dependencies. Use AC-level relatedRequirementIds instead.');
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
