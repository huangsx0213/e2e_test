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
