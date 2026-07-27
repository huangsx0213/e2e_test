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
    status: (input.status || 'DRAFT') as Requirement['status'],
    type: ((input.type || 'functional') as Requirement['type']),
    position: typeof input.position === 'number' ? input.position : 0,
    isFlow: level === 'story' ? Boolean(input.isFlow) : false,
    relatedRequirementIds: level === 'ac'
      ? (Array.isArray(input.relatedRequirementIds)
        ? input.relatedRequirementIds.filter((value): value is string => typeof value === 'string')
        : [])
      : [],
  };
}
