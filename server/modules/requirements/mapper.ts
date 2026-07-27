import type { Requirement } from '../../shared/contracts/index.ts';
import { asId, asText, nullableText } from '../../shared/utils/index.ts';

export function normalizeRequirement(input: Partial<Requirement>): Requirement {
  const level = (input.level || 'story') as Requirement['level'];
  const flowType = input.flowType ?? null;
  return {
    id: asId(input.id, 'req'),
    projectId: asText(input.projectId),
    parentId: nullableText(input.parentId) || undefined,
    humanId: nullableText(input.humanId) || null,
    title: asText(input.title, 'New Requirement'),
    description: asText(input.description),
    dependencies: Array.isArray(input.dependencies)
      ? input.dependencies.filter((value): value is string => typeof value === 'string')
      : [],
    level,
    flowType: level === 'ac' ? (flowType as Requirement['flowType']) : null,
    priority: (input.priority || 'MEDIUM') as Requirement['priority'],
    status: (input.status || 'DRAFT') as Requirement['status'],
    tags: Array.isArray(input.tags) ? input.tags : [],
    position: typeof input.position === 'number' ? input.position : 0,
    metadata:
      typeof input.metadata === 'object' && input.metadata !== null
        ? (input.metadata as Record<string, unknown>)
        : {},
  };
}
