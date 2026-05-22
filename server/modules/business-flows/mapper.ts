import type { BusinessFlow, BusinessFlowStep } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

function normalizeStep(step: unknown): BusinessFlowStep | null {
  if (typeof step !== 'object' || step === null) return null;
  const s = step as Record<string, unknown>;
  if (typeof s.sequence !== 'number') return null;
  if (typeof s.actionSummary !== 'string') return null;

  let requirementIds: string[] = [];
  if (Array.isArray(s.requirementIds)) {
    requirementIds = s.requirementIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } else if (typeof s.requirementId === 'string' && s.requirementId.length > 0) {
    requirementIds = [s.requirementId];
  }
  if (requirementIds.length === 0) return null;

  return { sequence: s.sequence, requirementIds, actionSummary: s.actionSummary };
}

export function normalizeBusinessFlow(input: Partial<BusinessFlow>): BusinessFlow {
  return {
    id: asId(input.id, 'flow'),
    projectId: asText(input.projectId),
    name: asText(input.name, 'New Business Flow'),
    description: asText(input.description),
    type: (input.type || 'happy-path') as BusinessFlow['type'],
    status: (input.status || 'DRAFT') as BusinessFlow['status'],
    steps: Array.isArray(input.steps) ? input.steps.map(normalizeStep).filter((s): s is BusinessFlowStep => s !== null) : [],
  };
}
