import { z } from 'zod';
import { requirementRepo } from '../../../requirements/repository.ts';
import { pipelineRepo } from '../../repository.ts';
import type { SkillDefinition } from '../nodes/types.ts';
import type { BatchRequirement } from '../state.ts';
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
// Factory accepts optional batch context for graceful fallback
// when a requirement is not found in the DB.
// ============================================================

/**
 * Build a requirement_detail_query skill with optional fallback to batch context.
 * When a requirement ID is not found in the DB, the skill falls back to the
 * batch context (currentBatch records) to provide title/description/level.
 */
export function makeRequirementDetailQuery(batchRequirements?: BatchRequirement[]): SkillDefinition {
  // Build a lookup map for O(1) fallback
  const fallbackMap = new Map<string, BatchRequirement>();
  if (batchRequirements) {
    for (const req of batchRequirements) {
      fallbackMap.set(req.id, req);
    }
  }

  return {
    name: 'requirement_detail_query',
    description:
      'Query full details of one or more requirements including description, acceptance criteria (AC), child requirements, and relatedRequirementIds. Use when you need to inspect a requirement OUTSIDE the current batch, or verify details for accurate test data/preconditions. Pass a single requirementId or an array of requirementIds for batch query.',
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
        if (!req) {
          // Graceful fallback: use batch context if available
          const batchReq = fallbackMap.get(id);
          if (batchReq) {
            rqLog.warn(`Requirement ${id} not found in DB — using batch context fallback`);
            const result = {
              id: batchReq.id,
              title: batchReq.title,
              description: batchReq.description ?? '',
              level: batchReq.level,
              status: 'unknown',
              isFlow: batchReq.isFlow ?? false,
              flowType: null,
              relatedRequirementIds: [],
              parent: null,
              children: [],
              _warning: 'Requirement not found in DB; data derived from batch context. Some fields may be incomplete.',
            };
            reqDetailCache.set(id, result);
            return result;
          }
          const result = { error: `Requirement ${id} not found` };
          reqDetailCache.set(id, result);
          return result;
        }

        const children = requirementRepo
          .listByProject(req.projectId)
          .filter((r) => r.parentId === id);

        const parent = req.parentId ? requirementRepo.get(req.parentId) : null;

        const result = {
          id: req.id,
          title: req.title,
          description: req.description,
          level: req.level,
          status: req.status,
          isFlow: req.isFlow ?? false,
          flowType: req.flowType ?? null,
          relatedRequirementIds: req.relatedRequirementIds ?? [],
          parent: parent
            ? { id: parent.id, title: parent.title, level: parent.level }
            : null,
          children: children.map((c) => ({
            id: c.id,
            title: c.title,
            level: c.level,
            flowType: c.flowType ?? null,
            relatedRequirementIds: c.relatedRequirementIds ?? [],
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
}

// Module-level constant for contexts without batch fallback (e.g. Quality, ALL_SKILLS)
export const requirementDetailQuery: SkillDefinition = makeRequirementDetailQuery();

// ============================================================
// requirement_graph_query (expands related requirements + flows)
// ============================================================
export const requirementGraphQuery: SkillDefinition = {
  name: 'requirement_graph_query',
  description:
    'Expand the requirement graph around one or more requirement IDs. Returns parent, children, siblings, relatedRequirementIds references (incoming/outgoing), and associated business flows. Use when you need to discover integration surfaces, cross-requirement dependencies, or associated flows for test planning — relatedRequirementIds and flow associations help identify component vs flow boundaries. Optionally pass flowIds to include user-selected flows in the graph result. Pass a single requirementId or an array for batch expansion.',
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
    const allFlowStories = allReqs.filter(r => r.level === 'story' && r.isFlow && r.status === 'APPROVED');

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

      // Outgoing references: this requirement's AC children's relatedRequirementIds
      const outgoingRefs = new Set<string>();
      for (const ac of allReqs.filter(r => r.parentId === seedId && r.level === 'ac')) {
        for (const refId of ac.relatedRequirementIds ?? []) {
          if (allReqs.some(r => r.id === refId)) outgoingRefs.add(refId);
        }
      }
      outgoingRefs.forEach((d) => collectedReqIds.add(d));

      // Incoming references: other ACs that reference this requirement
      const incomingRefs = new Set<string>();
      for (const other of allReqs) {
        if (other.level !== 'ac') continue;
        if ((other.relatedRequirementIds ?? []).includes(seedId)) {
          if (other.parentId) incomingRefs.add(other.parentId);
        }
      }
      incomingRefs.forEach((d) => collectedReqIds.add(d));

      // Associated business flows
      const associatedFlows = allFlowStories.filter(flowStory => {
        const flowACs = allReqs.filter(r => r.parentId === flowStory.id && r.level === 'ac');
        return flowACs.some(ac => (ac.relatedRequirementIds ?? []).includes(seedId));
      });
      associatedFlows.forEach((f) => collectedFlowIds.add(f.id));

      graphEntries[seedId] = {
        seed: { id: req.id, title: req.title, level: req.level },
        parent: parent ? { id: parent.id, level: parent.level } : null,
        children: children.map((c) => ({ id: c.id, level: c.level })),
        siblings: siblings.map((s) => ({ id: s.id, level: s.level })),
        outgoingReferences: [...outgoingRefs].map((id) => {
          const r = allReqs.find(x => x.id === id);
          return r ? { id: r.id, level: r.level } : null;
        }).filter(Boolean),
        incomingReferences: [...incomingRefs].map((id) => {
          const r = allReqs.find(x => x.id === id);
          return r ? { id: r.id, level: r.level } : null;
        }).filter(Boolean),
        associatedFlows: associatedFlows.map((f) => ({
          id: f.id,
          name: f.title,
          type: 'happy-path',
          matchedSteps: allReqs
            .filter(r => r.parentId === f.id && r.level === 'ac')
            .filter(ac => (ac.relatedRequirementIds ?? []).includes(seedId))
            .map(ac => ({ sequence: ac.position ?? 0, actionSummary: ac.title })),
        })),
      };
    }

    // Include user-selected flows that weren't discovered via requirement associations
    const selectedFlowEntries: Record<string, unknown> = {};
    for (const fid of selectedFlowIds) {
      if (collectedFlowIds.has(fid)) continue; // already discovered
      const flowStory = requirementRepo.get(fid);
      if (!flowStory || !flowStory.isFlow) continue;
      collectedFlowIds.add(fid);
      const flowACs = allReqs
        .filter(r => r.parentId === fid && r.level === 'ac')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      selectedFlowEntries[fid] = {
        id: flowStory.id,
        name: flowStory.title,
        type: 'happy-path',
        source: 'user-selected',
        steps: flowACs.map(ac => ({
          sequence: ac.position ?? 0,
          actionSummary: ac.title,
          requirementIds: ac.relatedRequirementIds ?? [],
        })),
      };
    }

    // Diff: what was introduced by the graph (not in original seed set)
    const introducedReqIds = [...collectedReqIds].filter((id) => !seedIds.includes(id));
    const introducedFlowIds = [...collectedFlowIds].filter((id) => !selectedFlowIds.includes(id));
    const introducedFlowsNames = introducedFlowIds
      .map((id) => allFlowStories.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => f!.title);

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
    'Query full details of one or more business flows including each step, associated requirements, acceptance criteria, and action summaries. Use when the flow context in the user message is incomplete and you need full step-by-step details to derive flow conditions or design integration test cases. Pass a single flowId or an array of flowIds for batch query.',
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
      const flowStory = requirementRepo.get(flowId);
      if (!flowStory || !flowStory.isFlow || flowStory.status !== 'APPROVED') {
        const errResult = { error: `Flow ${flowId} not found` };
        flowDetailCache.set(flowId, errResult);
        return errResult;
      }

      const flowACs = requirementRepo
        .listByProject(flowStory.projectId)
        .filter(r => r.parentId === flowId && r.level === 'ac')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const stepsWithDetails = flowACs.map((ac) => ({
        sequence: ac.position ?? 0,
        actionSummary: ac.title,
        requirements: (ac.relatedRequirementIds ?? []).map((reqId) => {
          const req = requirementRepo.get(reqId);
          if (!req) return { id: reqId, title: 'Unknown' };
          const acs = requirementRepo
            .listByProject(req.projectId)
            .filter(r => r.parentId === reqId && r.level === 'ac')
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
        id: flowStory.id,
        name: flowStory.title,
        type: 'happy-path',
        description: flowStory.description,
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
// cross_epic_impact_query — query cross-epic dependency target details
// Returns only the requirement itself + direct dependencies, without
// recursing into children, to keep context bounded.
// ============================================================
export const crossEpicImpactQuery: SkillDefinition = {
  name: 'cross_epic_impact_query',
  description:
    'Query the full details of a cross-epic reference target listed in the Global Context. Use ONLY when a cross-epic reference\'s title or relationType suggests a real coverage risk (e.g. shared data, shared state). Returns the target requirement\'s description, relatedRequirementIds, and parent — without recursing into its children, to keep context bounded.',
  schema: z.object({
    requirementId: z.string().describe('The cross-epic target requirement ID (from Global Context → Cross-Epic References)'),
  }),
  func: async (args) => {
    const id = String(args.requirementId);
    const log = Log.for('skill:cross_epic_impact_query');
    log.info(`Querying cross-epic target ${id}`);

    const req = requirementRepo.get(id);
    if (!req) {
      log.warn(`Requirement ${id} not found`);
      return { error: `Requirement ${id} not found` };
    }

    const parent = req.parentId ? requirementRepo.get(req.parentId) : null;
    // Do not return children to avoid context bloat; the analyst can call
    // requirement_detail_query separately if it needs them.
    const relatedRequirementIds = req.relatedRequirementIds ?? [];
    const result = {
      id: req.id,
      title: req.title,
      description: req.description,
      level: req.level,
      status: req.status,
      isFlow: req.isFlow ?? false,
      flowType: req.flowType ?? null,
      relatedRequirementIds,
      parent: parent ? { id: parent.id, title: parent.title, level: parent.level } : null,
    };
    log.kv('refs', relatedRequirementIds.length);
    return result;
  },
};

// ============================================================
// previous_batch_conditions_query — query condition titles already
// generated for a given requirement. Call only when duplication is
// suspected, to avoid expanding full text every time.
// Factory function: requires runId to query pipelineRepo.
// ============================================================
export function makePreviousBatchConditionsQuery(runId: string): SkillDefinition {
  // Cache agent logs for the lifetime of this skill instance (one node
  // execution) — LLM may call this for multiple requirements; avoid
  // re-scanning the same logs each time.
  let cachedLogs: any[] | null = null;
  return {
    name: 'previous_batch_conditions_query',
    description:
      'Inspect conditions already generated for a specific requirement in previous batches. Returns a qualified referenceId, condition id, title (truncated), category, and primary technique. Use referenceId when linking a flow to an earlier component condition.',
    schema: z.object({
      requirementId: z.string().describe('The requirement ID to check for existing conditions'),
    }),
    func: async (args) => {
      const id = String(args.requirementId);
      const log = Log.for('skill:prev_batch_conditions_query');
      log.info(`Querying previous-batch conditions for ${id} (runId=${runId})`);

      try {
        if (cachedLogs === null) {
          cachedLogs = pipelineRepo.getAgentLogs(runId, 'test_analyst');
        }
        const logs = cachedLogs;
        const conditions: Array<{ referenceId: string; id: string; title: string; category: string; primaryTechnique: string }> = [];
        for (const logEntry of logs) {
          const tcs: any[] = logEntry.output_data?.testConditions ?? [];
          for (const tc of tcs) {
            if (tc.requirementId === id && tc.conditionType === 'component') {
              conditions.push({
                referenceId: `component:${tc.requirementId}:${tc.id}`,
                id: tc.id,
                title: (tc.condition ?? '').slice(0, 120),
                category: tc.category ?? 'functional',
                primaryTechnique: tc.primaryTechnique ?? 'Unknown',
              });
            }
          }
        }
        log.kv('conditions', conditions.length);
        return { requirementId: id, conditions };
      } catch (e: any) {
        log.warn(`Failed to query previous-batch conditions: ${e?.message ?? e}`);
        return { requirementId: id, conditions: [], error: String(e?.message ?? e) };
      }
    },
  };
}

// ============================================================
// previous_batch_cases_query — query finalTestCase titles already
// generated for a given requirement. Called by the Designer when
// cross-batch case duplication is suspected, to avoid regenerating
// identical cases.
// Factory function: requires runId to query pipelineRepo.
// ============================================================
export function makePreviousBatchCasesQuery(runId: string): SkillDefinition {
  // Cache agent logs for the lifetime of this skill instance (one node
  // execution) — LLM may call this for multiple requirements; avoid
  // re-scanning the same logs each time.
  let cachedLogs: any[] | null = null;
  return {
    name: 'previous_batch_cases_query',
    description:
      'Inspect the test case titles and test levels already generated for a specific requirement in previous batches. Use ONLY when you suspect a new draft case might duplicate an existing one. Returns case title (truncated), testLevel, and conditionId for that requirement.',
    schema: z.object({
      requirementId: z.string().describe('The requirement ID to check for existing cases'),
    }),
    func: async (args) => {
      const id = String(args.requirementId);
      const log = Log.for('skill:prev_batch_cases_query');
      log.info(`Querying previous-batch cases for ${id} (runId=${runId})`);

      try {
        if (cachedLogs === null) {
          cachedLogs = pipelineRepo.getAgentLogs(runId, 'quality_manager');
        }
        const logs = cachedLogs;
        const cases: Array<{ title: string; testLevel: string; conditionId: string }> = [];
        for (const logEntry of logs) {
          const ftc: any[] = logEntry.output_data?.finalTestCases ?? [];
          for (const tc of ftc) {
            if (tc.requirementId === id) {
              cases.push({
                title: (tc.title ?? '').slice(0, 120),
                testLevel: tc.testLevel ?? 'component',
                conditionId: tc.conditionId ?? '',
              });
            }
          }
        }
        log.kv('cases', cases.length);
        return { requirementId: id, cases };
      } catch (e: any) {
        log.warn(`Failed to query previous-batch cases: ${e?.message ?? e}`);
        return { requirementId: id, cases: [], error: String(e?.message ?? e) };
      }
    },
  };
}
