import type { BusinessFlow, Requirement } from '../../shared/contracts/index.ts';
import { ValidationError } from '../../shared/http/errors.ts';

export function validateBusinessFlowForApproval(flow: BusinessFlow, requirements: Requirement[]): void {
  if (flow.steps.length === 0) {
    throw new ValidationError('Business flow must include at least one step before approval.');
  }

  const sortedSteps = [...flow.steps].sort((left, right) => left.sequence - right.sequence);
  sortedSteps.forEach((step, index) => {
    if (step.sequence !== index + 1) {
      throw new ValidationError('Business flow steps must use contiguous sequence values.');
    }

    if (new Set(step.requirementIds).size !== step.requirementIds.length) {
      throw new ValidationError('Business flow step cannot repeat the same requirement.');
    }
  });

  const requirementMap = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  for (const step of sortedSteps) {
    for (const reqId of step.requirementIds) {
      const requirement = requirementMap.get(reqId);
      if (!requirement || requirement.projectId !== flow.projectId) {
        throw new ValidationError(`Business flow references an unknown requirement: ${reqId}`);
      }

      if (requirement.level !== 'story') {
        throw new ValidationError('Business flow steps must reference story requirements only.');
      }
    }
  }
}
