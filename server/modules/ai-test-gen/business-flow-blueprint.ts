import { requirementRepo } from '../requirements/repository.ts';
import type { Requirement, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBlueprintsInput {
  flowStories: Requirement[];
}

export function buildBlueprintsFromFlowStories({ flowStories }: BuildBlueprintsInput): PipelineBusinessFlowBlueprint[] {
  if (flowStories.length === 0) return [];

  const projectId = flowStories[0].projectId;
  const allReqs = requirementRepo.listByProject(projectId);
  const reqMap = new Map(allReqs.map(r => [r.id, r]));
  const childrenByParent = new Map<string, Requirement[]>();
  for (const r of allReqs) {
    if (r.parentId) {
      const list = childrenByParent.get(r.parentId);
      if (list) list.push(r);
      else childrenByParent.set(r.parentId, [r]);
    }
  }

  return flowStories.map(story => ({
    id: story.id,
    name: story.title,
    type: 'happy-path',
    steps: (childrenByParent.get(story.id) || [])
      .filter(r => r.level === 'ac')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(ac => {
        const requirementIds = ac.relatedRequirementIds ?? [];
        const primaryReqId = requirementIds[0] ?? story.id;
        const primaryReq = reqMap.get(primaryReqId);
        return {
          sequence: ac.position ?? 0,
          requirementId: primaryReqId,
          requirementIds,
          requirementTitle: primaryReq?.title ?? ac.title,
          requirementLevel: primaryReq?.level ?? 'story',
          actionSummary: ac.title,
          acceptanceCriteria: [ac.description].filter(Boolean),
        };
      }),
  }));
}
