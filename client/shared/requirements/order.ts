import type { Requirement } from '../../../shared/contracts/index';

export function orderRequirementsLikeTree(requirements: Requirement[]): Requirement[] {
  const childrenByParent = new Map<string | null, Requirement[]>();

  for (const requirement of requirements) {
    const parentId = requirement.parentId || null;
    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(requirement);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
  }

  const ordered: Requirement[] = [];

  const visit = (parentId: string | null) => {
    for (const requirement of childrenByParent.get(parentId) || []) {
      ordered.push(requirement);
      visit(requirement.id);
    }
  };

  visit(null);

  return ordered;
}
