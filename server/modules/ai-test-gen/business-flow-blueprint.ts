import type { BusinessFlow, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBusinessFlowBlueprintsInput {
  flows: BusinessFlow[];
}

export function buildBusinessFlowBlueprints({ flows }: BuildBusinessFlowBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  return flows
    .filter((flow) => flow.status === 'APPROVED')
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      type: flow.type,
      steps: (flow.steps ?? []).map((step, idx) => ({
        sequence: step.sequence ?? idx + 1,
        requirementId: (step.requirementIds ?? [])[0] ?? '',
        requirementTitle: '',
        requirementLevel: 'story' as const,
        actionSummary: step.actionSummary ?? '',
        acceptanceCriteria: [],
      })),
    }));
}
