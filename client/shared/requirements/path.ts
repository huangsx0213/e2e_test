import type { Requirement } from '../../../shared/contracts/index';

export function buildRequirementPath(requirementId: string, requirements: Requirement[]): string {
  const requirementMap = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const segments: string[] = [];
  let current = requirementMap.get(requirementId);
  let guard = 0;

  while (current && guard < 10) {
    segments.unshift(current.title);
    current = current.parentId ? requirementMap.get(current.parentId) : undefined;
    guard += 1;
  }

  return segments.join(' > ');
}
