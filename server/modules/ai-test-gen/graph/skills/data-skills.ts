import { z } from 'zod';
import { requirementRepo } from '../../../requirements/repository.ts';
import { businessFlowRepo } from '../../../business-flows/repository.ts';
import type { SkillDefinition } from '../nodes/types.ts';

// ============================================================
// requirement_detail_query (supports single or batch)
// ============================================================
export const requirementDetailQuery: SkillDefinition = {
  name: 'requirement_detail_query',
  description:
    'Query full details of one or more requirements including description, acceptance criteria (AC), child requirements, and dependencies. Pass a single requirementId or an array of requirementIds for batch query.',
  schema: z.object({
    requirementId: z.union([z.string(), z.array(z.string())]).describe('A single requirement ID or an array of IDs for batch query'),
  }),
  func: async (args) => {
    const rawId = args.requirementId;
    const ids: string[] = Array.isArray(rawId) ? rawId : [rawId];
    const isBatch = ids.length > 1;
    console.log(`[skill:requirement_detail_query] ${isBatch ? `Batch querying ${ids.length} requirements` : `Querying requirement ${ids[0]}`}`);

    const queryOne = (id: string) => {
      const req = requirementRepo.get(id);
      if (!req) return { error: `Requirement ${id} not found` };

      const children = requirementRepo
        .listByProject(req.projectId)
        .filter((r) => r.parentId === id);

      const parent = req.parentId ? requirementRepo.get(req.parentId) : null;

      return {
        id: req.id,
        title: req.title,
        description: req.description,
        level: req.level,
        priority: req.priority,
        status: req.status,
        tags: req.tags,
        dependencies: req.dependencies,
        parent: parent
          ? { id: parent.id, title: parent.title, level: parent.level }
          : null,
        children: children.map((c) => ({
          id: c.id,
          title: c.title,
          level: c.level,
          priority: c.priority,
        })),
      };
    };

    if (isBatch) {
      const results: Record<string, unknown> = {};
      let found = 0;
      for (const id of ids) {
        results[id] = queryOne(id);
        if (!(results[id] as any).error) found++;
      }
      console.log(`[skill:requirement_detail_query] Found ${found}/${ids.length} requirements`);
      return results;
    }

    const result = queryOne(ids[0]);
    if (!(result as any).error) {
      console.log(`[skill:requirement_detail_query] Found: "${(result as any).title}", ${(result as any).children?.length ?? 0} children`);
    }
    return result;
  },
};

// ============================================================
// related_requirements_query
// ============================================================
export const relatedRequirementsQuery: SkillDefinition = {
  name: 'related_requirements_query',
  description:
    'Query requirements related to a given requirement: siblings (same parent), dependency chain (upstream/downstream). Use for risk assessment and understanding requirement interconnections.',
  schema: z.object({
    requirementId: z.string().describe('The requirement ID to find relations for'),
  }),
  func: async (args) => {
    const requirementId = args.requirementId as string;
    console.log(`[skill:related_requirements_query] Querying relations for ${requirementId}`);
    const req = requirementRepo.get(requirementId);
    if (!req) {
      console.warn(`[skill:related_requirements_query] Requirement ${requirementId} not found`);
      return { error: `Requirement ${requirementId} not found` };
    }

    const allReqs = requirementRepo.listByProject(req.projectId);

    // Siblings: same parent, different ID
    const siblings = req.parentId
      ? allReqs.filter((r) => r.parentId === req.parentId && r.id !== req.id)
      : [];

    // Upstream dependencies
    const dependencies = (req.dependencies || [])
      .map((depId) => {
        const dep = allReqs.find((r) => r.id === depId);
        return dep
          ? { id: dep.id, title: dep.title, level: dep.level }
          : null;
      })
      .filter(Boolean);

    // Downstream dependents
    const dependents = allReqs
      .filter((r) => (r.dependencies || []).includes(requirementId))
      .map((r) => ({ id: r.id, title: r.title, level: r.level }));

    console.log(`[skill:related_requirements_query] Found: ${siblings.length} siblings, ${dependencies.length} deps, ${dependents.length} dependents`);

    return {
      siblings: siblings.map((s) => ({
        id: s.id,
        title: s.title,
        level: s.level,
        priority: s.priority,
      })),
      dependencies,
      dependents,
    };
  },
};

// ============================================================
// flow_detail_query (supports single or batch)
// ============================================================
export const flowDetailQuery: SkillDefinition = {
  name: 'flow_detail_query',
  description:
    'Query full details of one or more business flows including each step, associated requirements, acceptance criteria, and action summaries. Pass a single flowId or an array of flowIds for batch query.',
  schema: z.object({
    flowId: z.union([z.string(), z.array(z.string())]).describe('A single flow ID or an array of IDs for batch query'),
  }),
  func: async (args) => {
    const rawId = args.flowId;
    const ids: string[] = Array.isArray(rawId) ? rawId : [rawId];
    const isBatch = ids.length > 1;
    console.log(`[skill:flow_detail_query] ${isBatch ? `Batch querying ${ids.length} flows` : `Querying flow ${ids[0]}`}`);

    const queryOne = (flowId: string) => {
      const flow = businessFlowRepo.get(flowId);
      if (!flow) return { error: `Flow ${flowId} not found` };

      const stepsWithDetails = flow.steps.map((step) => ({
        sequence: step.sequence,
        actionSummary: step.actionSummary,
        requirements: step.requirementIds.map((reqId) => {
          const req = requirementRepo.get(reqId);
          if (!req) return { id: reqId, title: 'Unknown' };
          const acs = requirementRepo
            .listByProject(req.projectId)
            .filter((r) => r.parentId === reqId && r.level === 'ac')
            .map((ac) => ac.title);
          return {
            id: req.id,
            title: req.title,
            level: req.level,
            acceptanceCriteria: acs,
          };
        }),
      }));

      return {
        id: flow.id,
        name: flow.name,
        type: flow.type,
        description: flow.description,
        steps: stepsWithDetails,
      };
    };

    if (isBatch) {
      const results: Record<string, unknown> = {};
      let found = 0;
      for (const id of ids) {
        results[id] = queryOne(id);
        if (!(results[id] as any).error) found++;
      }
      console.log(`[skill:flow_detail_query] Found ${found}/${ids.length} flows`);
      return results;
    }

    const result = queryOne(ids[0]);
    if (!(result as any).error) {
      console.log(`[skill:flow_detail_query] Found: "${(result as any).name}", ${(result as any).steps?.length ?? 0} steps`);
    }
    return result;
  },
};
