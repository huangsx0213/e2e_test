import { z } from 'zod';
import { requirementRepo } from '../../../requirements/repository.ts';
import { businessFlowRepo } from '../../../business-flows/repository.ts';
import { pipelineRepo } from '../../repository.ts';
import type { SkillDefinition } from '../nodes/types.ts';
import { Log } from '../../../../shared/services/logger.ts';

// ============================================================
// Query cache — prevents LLM from re-querying same IDs
// ============================================================
const reqDetailCache = new Map<string, unknown>();
const flowDetailCache = new Map<string, unknown>();

export function clearQueryCache(): void {
  reqDetailCache.clear();
  flowDetailCache.clear();
}

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
    const isBatch = ids.length > 1 || Array.isArray(rawId);

    // Dedup: separate cached vs new
    const cached: string[] = [];
    const newIds: string[] = [];
    for (const id of ids) {
      if (reqDetailCache.has(id)) { cached.push(id); } else { newIds.push(id); }
    }
    const rqLog = Log.for('skill:req_detail_query');
    if (cached.length > 0) {
      rqLog.kv('cache', `hit ${cached.length}, new ${newIds.length}`);
    } else if (newIds.length > 0) {
      rqLog.info(newIds.length > 1 ? `Batch querying ${newIds.length} requirements` : `Querying requirement ${newIds[0]}`);
    }

    const queryOne = (id: string) => {
      const req = requirementRepo.get(id);
      if (!req) return { error: `Requirement ${id} not found` };

      const children = requirementRepo
        .listByProject(req.projectId)
        .filter((r) => r.parentId === id);

      const parent = req.parentId ? requirementRepo.get(req.parentId) : null;

      const result = {
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
      reqDetailCache.set(id, result);
      return result;
    };

    // Query only new IDs
    for (const id of newIds) {
      queryOne(id);
    }

    // Build merged results in original order
    const merged: Record<string, unknown> = {};
    let found = 0;
    for (const id of ids) {
      const cachedResult = reqDetailCache.get(id);
      if (cachedResult && !(cachedResult as any).error) {
        merged[id] = cachedResult;
        found++;
      } else if (cachedResult) {
        merged[id] = cachedResult;
      }
    }

    if (newIds.length > 0) {
      rqLog.info(`Found ${found}/${ids.length} requirements (${cached.length} cached)`);
    }

    return isBatch ? merged : merged[ids[0]];
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
    const rrqLog = Log.for('skill:related_req_query');
    const requirementId = args.requirementId as string;
    rrqLog.info(`Querying relations for ${requirementId}`);
    const req = requirementRepo.get(requirementId);
    if (!req) {
      rrqLog.warn(`Requirement ${requirementId} not found`);
      return { error: `Requirement ${requirementId} not found` };
    }

    const allReqs = requirementRepo.listByProject(req.projectId);

    const siblings = req.parentId
      ? allReqs.filter((r) => r.parentId === req.parentId && r.id !== req.id)
      : [];

    const dependencies = (req.dependencies || [])
      .map((depId) => {
        const dep = allReqs.find((r) => r.id === depId);
        return dep
          ? { id: dep.id, title: dep.title, level: dep.level }
          : null;
      })
      .filter(Boolean);

    const dependents = allReqs
      .filter((r) => (r.dependencies || []).includes(requirementId))
      .map((r) => ({ id: r.id, title: r.title, level: r.level }));

    rrqLog.info(`Found: ${siblings.length} siblings, ${dependencies.length} deps, ${dependents.length} dependents`);

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
// requirement_graph_query (expands related requirements + flows)
// ============================================================
export const requirementGraphQuery: SkillDefinition = {
  name: 'requirement_graph_query',
  description:
    'Expand the requirement graph around one or more requirement IDs. Returns parent, children, siblings, dependencies, and associated business flows. Optionally pass flowIds to include user-selected flows in the graph. Pass a single requirementId or an array for batch expansion.',
  schema: z.object({
    requirementId: z.union([z.string(), z.array(z.string())]).describe('A single requirement ID or an array of IDs to expand from'),
    flowId: z.union([z.string(), z.array(z.string())]).optional().describe('Optional: user-selected flow IDs to include in the graph result'),
  }),
  func: async (args) => {
    const rawId = args.requirementId;
    const seedIds: string[] = Array.isArray(rawId) ? rawId : [rawId];
    const rawFlowId = args.flowId;
    const selectedFlowIds: string[] = rawFlowId ? (Array.isArray(rawFlowId) ? rawFlowId : [rawFlowId]) : [];

    const rgqLog = Log.for('skill:req_graph_query');
    rgqLog.info(`Expanding graph from ${seedIds.length} seed(s)${selectedFlowIds.length > 0 ? `, ${selectedFlowIds.length} selected flow(s)` : ''}`);

    let projectId = '';
    for (const id of seedIds) {
      const r = requirementRepo.get(id);
      if (r) { projectId = r.projectId; break; }
    }
    if (!projectId) {
      rgqLog.warn('No valid seed requirements found');
      return { error: 'No valid seed requirements found' };
    }

    const allReqs = requirementRepo.listByProject(projectId);
    const allFlows = businessFlowRepo.listByProject(projectId);

    // === Build graph for each seed ===
    const graphEntries: Record<string, unknown> = {};
    const collectedReqIds = new Set<string>(seedIds);
    const collectedFlowIds = new Set<string>();

    for (const seedId of seedIds) {
      const req = requirementRepo.get(seedId);
      if (!req) continue;

      // Parent
      const parent = req.parentId ? requirementRepo.get(req.parentId) : null;
      if (parent) collectedReqIds.add(parent.id);

      // Children
      const children = allReqs.filter((r) => r.parentId === seedId);
      children.forEach((c) => collectedReqIds.add(c.id));

      // Siblings
      const siblings = req.parentId
        ? allReqs.filter((r) => r.parentId === req.parentId && r.id !== seedId)
        : [];
      siblings.forEach((s) => collectedReqIds.add(s.id));

      // Upstream dependencies
      const deps = (req.dependencies || [])
        .filter((depId) => allReqs.some((r) => r.id === depId));
      deps.forEach((d) => collectedReqIds.add(d));

      // Downstream dependents
      const dependents = allReqs.filter((r) => (r.dependencies || []).includes(seedId));
      dependents.forEach((d) => collectedReqIds.add(d.id));

      // Associated business flows
      const associatedFlows = allFlows.filter((f) =>
        f.steps.some((step) => step.requirementIds.includes(seedId)),
      );
      associatedFlows.forEach((f) => collectedFlowIds.add(f.id));

      graphEntries[seedId] = {
        seed: { id: req.id, title: req.title, level: req.level },
        parent: parent ? { id: parent.id, title: parent.title, level: parent.level } : null,
        children: children.map((c) => ({ id: c.id, title: c.title, level: c.level })),
        siblings: siblings.map((s) => ({ id: s.id, title: s.title, level: s.level })),
        dependencies: deps,
        dependents: dependents.map((d) => ({ id: d.id, title: d.title, level: d.level })),
        associatedFlows: associatedFlows.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          matchedSteps: f.steps
            .filter((s) => s.requirementIds.includes(seedId))
            .map((s) => ({ sequence: s.sequence, actionSummary: s.actionSummary })),
        })),
      };
    }

    // Include user-selected flows that weren't discovered via requirement associations
    const selectedFlowEntries: Record<string, unknown> = {};
    for (const fid of selectedFlowIds) {
      if (collectedFlowIds.has(fid)) continue; // already discovered
      const flow = businessFlowRepo.get(fid);
      if (!flow) continue;
      collectedFlowIds.add(fid);
      selectedFlowEntries[fid] = {
        id: flow.id,
        name: flow.name,
        type: flow.type,
        source: 'user-selected',
        steps: flow.steps.map((s) => ({ sequence: s.sequence, actionSummary: s.actionSummary, requirementIds: s.requirementIds })),
      };
    }

    // Diff: what was introduced by the graph (not in original seed set)
    const introducedReqIds = [...collectedReqIds].filter((id) => !seedIds.includes(id));
    const introducedFlowIds = [...collectedFlowIds].filter((id) => !selectedFlowIds.includes(id));
    const introducedFlowsNames = introducedFlowIds
      .map((id) => allFlows.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => f!.name);

    rgqLog.info(`Graph expanded: +${introducedReqIds.length} related, +${introducedFlowsNames.length} flows, ${selectedFlowIds.length} user-selected`);
    if (introducedReqIds.length > 0) {
      rgqLog.info(`Introduced requirements: ${introducedReqIds.join(', ')}`);
    }
    if (introducedFlowsNames.length > 0) {
      rgqLog.info(`Introduced flows: ${introducedFlowsNames.join(', ')}`);
    }

    return {
      seedRequirementIds: seedIds,
      introducedRequirementIds: introducedReqIds,
      discoveredFlowIds: introducedFlowIds,
      selectedFlowIds,
      allFlowIds: [...collectedFlowIds],
      selectedFlows: selectedFlowEntries,
      graph: graphEntries,
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
    const isBatch = ids.length > 1 || Array.isArray(rawId);

    const fdqLog = Log.for('skill:flow_detail_query');
    const cached: string[] = [];
    const newIds: string[] = [];
    for (const id of ids) {
      if (flowDetailCache.has(id)) { cached.push(id); } else { newIds.push(id); }
    }
    if (cached.length > 0) {
      fdqLog.kv('cache', `hit ${cached.length}, new ${newIds.length}`);
    } else if (newIds.length > 0) {
      fdqLog.info(newIds.length > 1 ? `Batch querying ${newIds.length} flows` : `Querying flow ${newIds[0]}`);
    }

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

      const result = {
        id: flow.id,
        name: flow.name,
        type: flow.type,
        description: flow.description,
        steps: stepsWithDetails,
      };
      flowDetailCache.set(flowId, result);
      return result;
    };

    // Query only new IDs
    for (const id of newIds) {
      queryOne(id);
    }

    // Build merged results
    const merged: Record<string, unknown> = {};
    let found = 0;
    for (const id of ids) {
      const cachedResult = flowDetailCache.get(id);
      if (cachedResult && !(cachedResult as any).error) {
        merged[id] = cachedResult;
        found++;
      } else if (cachedResult) {
        merged[id] = cachedResult;
      }
    }

    if (newIds.length > 0) {
      fdqLog.info(`Found ${found}/${ids.length} flows (${cached.length} cached)`);
    }

    return isBatch ? merged : merged[ids[0]];
  },
};

// ============================================================
// coverage_check_query — query the persistent coverage matrix
// ============================================================
/**
 * Lets the Analyst check which test conditions are already covered in the
 * persistent coverage matrix, so it can avoid re-deriving them (Stage 1/2/3
 * deduplication). Filters by projectId and optionally by requirementId.
 */
export const coverageCheckQuery: SkillDefinition = {
  name: 'coverage_check_query',
  description:
    'Query the persistent coverage matrix to see which test conditions are already covered for this project. Use this in Stage 1 (Requirement Analysis) and Stage 3 (Error-Guessing) to avoid re-deriving already-covered conditions. Pass a requirementId to filter to a single requirement, or omit to get the full project coverage.',
  schema: z.object({
    requirementId: z
      .string()
      .optional()
      .describe('Optional: filter coverage to a single requirement. Omit to get full project coverage.'),
  }),
  func: async (args) => {
    const ccqLog = Log.for('skill:coverage_check_query');
    // projectId is injected via a closure set by the analyst node at runtime
    const projectId = (coverageCheckQuery as any).__projectId as string | undefined;
    if (!projectId) {
      ccqLog.warn('No projectId bound to coverage_check_query — returning empty');
      return { coveredConditions: [], note: 'No projectId bound; cannot query coverage.' };
    }

    const reqId = args.requirementId as string | undefined;
    const rows = reqId
      ? pipelineRepo.getCoverageByRequirement(projectId, reqId)
      : pipelineRepo.getProjectCoverage(projectId);

    const coveredConditions = rows.map((r: any) => ({
      requirementId: r.requirement_id,
      conditionHash: r.condition_hash,
      conditionText: r.condition_text,
      technique: r.technique,
      testCaseIds: r.test_case_ids ?? [],
      coveredAt: r.covered_at,
    }));

    ccqLog.info(`Returned ${coveredConditions.length} covered condition(s)${args.requirementId ? ` for ${args.requirementId}` : ''}`);
    return {
      coveredConditions,
      totalCovered: coveredConditions.length,
      note: coveredConditions.length === 0
        ? 'No prior coverage — fresh start, derive all conditions normally.'
        : `${coveredConditions.length} condition(s) already covered. Avoid re-deriving these; focus on uncovered aspects.`,
    };
  },
};

/**
 * Bind the projectId to the coverage_check_query skill at runtime.
 * Called by the analyst node before invoking the LLM.
 */
export function bindProjectIdToCoverageQuery(projectId: string): void {
  (coverageCheckQuery as any).__projectId = projectId;
}
