import type { BusinessFlow, PipelineBusinessFlowBlueprint, Requirement } from '../../shared/contracts/index.ts';

interface BuildBusinessFlowBlueprintsInput {
  flows: BusinessFlow[];
  requirements: Requirement[];
}

export function buildBusinessFlowBlueprints({ flows, requirements }: BuildBusinessFlowBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  const requirementMap = new Map(requirements.map((requirement) => [requirement.id, requirement]));

  return flows
    .filter((flow) => flow.status === 'APPROVED')
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      type: flow.type,
      steps: flow.steps.flatMap((step) => {
        return step.requirementIds.flatMap((reqId) => {
          const requirement = requirementMap.get(reqId);
          if (!requirement) return [];

          return [{
            sequence: step.sequence,
            requirementId: reqId,
            requirementTitle: requirement.title,
            requirementLevel: requirement.level,
            actionSummary: step.actionSummary,
            acceptanceCriteria: requirements
              .filter((candidate) => candidate.parentId === reqId && candidate.level === 'ac')
              .map((candidate) => candidate.title),
          }];
        });
      }),
    }));
}
