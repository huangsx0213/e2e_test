import { requirementRepo } from '../requirements/repository.ts';
import type { Requirement, PipelineBusinessFlowBlueprint } from '../../shared/contracts/index.ts';

interface BuildBlueprintsInput {
  flowStories: Requirement[];
}

/**
 * Build business-flow blueprints from flow stories.
 *
 * Domain model: each AC of a flow story represents a **separate business-flow
 * path**, NOT a sequential step within one flow. This function emits one
 * blueprint per AC. The path type (happy/exception/alternate) is inferred by
 * the LLM from the AC's given/when/then semantics — not pre-classified.
 */
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

  const blueprints: PipelineBusinessFlowBlueprint[] = [];

  for (const story of flowStories) {
    const acs = (childrenByParent.get(story.id) || [])
      .filter(r => r.level === 'ac')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    for (const ac of acs) {
      const requirementIds = ac.relatedRequirementIds ?? [];
      const primaryReqId = requirementIds[0] ?? story.id;
      const primaryReq = reqMap.get(primaryReqId);

      blueprints.push({
        id: ac.id,
        flowStoryId: story.id,
        name: `${story.title} — ${ac.title}`,
        steps: [{
          sequence: 1,
          requirementId: primaryReqId,
          requirementIds,
          requirementTitle: primaryReq?.title ?? ac.title,
          requirementLevel: primaryReq?.level ?? 'story',
          actionSummary: ac.title,
          acceptanceCriteria: [ac.description].filter(Boolean),
        }],
      });
    }
  }

  return blueprints;
}
