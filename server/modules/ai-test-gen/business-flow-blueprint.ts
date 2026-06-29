import type { Requirement, BusinessFlow, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBusinessFlowBlueprintsInput {
  flows: BusinessFlow[];
  requirementsMap?: Map<string, Requirement>;
}

export function buildBusinessFlowBlueprints({ flows, requirementsMap }: BuildBusinessFlowBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  return flows
    .filter((flow) => flow.status === 'APPROVED')
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      type: flow.type,
      steps: (flow.steps ?? []).map((step) => {
        const reqId = step.requirementIds?.[0] ?? '';
        const req = requirementsMap?.get(reqId);
        return {
          sequence: step.sequence,
          requirementId: reqId,
          requirementTitle: req?.title ?? '',
          requirementLevel: req?.level ?? 'story',
          actionSummary: step.actionSummary,
          acceptanceCriteria: req?.description ? [req.description] : [],
        };
      }),
    }));
}
