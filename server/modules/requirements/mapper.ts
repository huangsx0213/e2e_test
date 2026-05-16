import type { Requirement } from '../../shared/contracts/index.ts';
import { asId, asText, nullableText } from '../../shared/utils/index.ts';

export function normalizeRequirement(input: Partial<Requirement>): Requirement {
  return {
    id: asId(input.id, 'req'),
    projectId: asText(input.projectId),
    parentId: nullableText(input.parentId),
    title: asText(input.title, 'New Requirement'),
    description: asText(input.description),
    priority: (input.priority || 'MEDIUM') as Requirement['priority'],
    riskLevel: (input.riskLevel || 'MEDIUM') as Requirement['riskLevel'],
    type: (input.type || 'functional') as Requirement['type'],
    status: (input.status || 'DRAFT') as Requirement['status'],
    position: typeof input.position === 'number' ? input.position : 0,
    metadata: typeof input.metadata === 'object' && input.metadata !== null ? input.metadata as Record<string, unknown> : {},
  };
}