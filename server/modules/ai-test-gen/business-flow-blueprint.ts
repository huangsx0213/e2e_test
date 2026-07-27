import { requirementRepo } from '../requirements/repository.ts';
import type { Requirement, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBlueprintsInput {
  flowStories: Requirement[];
}

export function buildBlueprintsFromFlowStories({ flowStories }: BuildBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  return flowStories.map(story => ({
    id: story.id,
    name: story.title,
    type: 'happy-path',
    steps: requirementRepo.listByProject(story.projectId)
      .filter(r => r.parentId === story.id && r.level === 'ac')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(ac => {
        const requirementIds = ac.relatedRequirementIds ?? [];
        const primaryReqId = requirementIds[0] ?? story.id;
        const primaryReq = primaryReqId ? requirementRepo.get(primaryReqId) : null;
        return {
          sequence: ac.position ?? 0,
          requirementId: primaryReqId,
          requirementIds,
          requirementTitle: primaryReq?.title ?? ac.title,
          requirementLevel: (primaryReq?.level ?? 'story') as any,
          actionSummary: ac.title,
          acceptanceCriteria: [ac.description].filter(Boolean),
        };
      }),
  }));
}
