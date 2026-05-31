interface FlowDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface FlowNode {
  id: string;
  type: 'start' | 'process' | 'decision' | 'end';
  label: string;
  requirementIds: string[];
  children: string[];
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: Array<{ from: string; to: string }>;
}

export function parseBlueprint(blueprint: any): FlowGraph {
  const nodes: FlowNode[] = (blueprint.steps ?? []).map((step: any, i: number) => ({
    id: step.id ?? `step-${i}`,
    type: step.type ?? 'process',
    label: step.label ?? `Step ${i + 1}`,
    requirementIds: step.requirementIds ?? [],
    children: [],
  }));
  const edges: Array<{ from: string; to: string }> = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    nodes[i].children.push(nodes[i + 1].id);
  }
  return { nodes, edges };
}

export function validateFlow(flow: FlowGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!flow.nodes || flow.nodes.length === 0) {
    errors.push('Flow must have at least one node');
    return { valid: false, errors };
  }
  const startCount = flow.nodes.filter(n => n.type === 'start').length;
  if (startCount === 0) errors.push('Flow must have a start node');
  if (startCount > 1) errors.push('Flow must have exactly one start node');
  return { valid: errors.length === 0, errors };
}

export function createService(deps: FlowDeps) {
  return {
    buildFlowGraph: async (requirementIds: string[]): Promise<FlowGraph> => {
      if (deps.db) {
        const placeholders = requirementIds.map(() => '?').join(',');
        const rows = await deps.db.query(
          `SELECT * FROM flow_nodes WHERE requirement_id IN (${placeholders}) ORDER BY sequence_order ASC`,
          requirementIds
        );
        const nodes: FlowNode[] = (rows as any[]).map(r => ({
          id: r.id,
          type: r.type,
          label: r.label,
          requirementIds: [r.requirement_id],
          children: [],
        }));
        const edges: FlowGraph['edges'] = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
          nodes[i].children.push(nodes[i + 1].id);
        }
        return { nodes, edges };
      }
      return { nodes: [], edges: [] };
    },

    getFlowForModule: async (module: string): Promise<FlowGraph> => {
      if (deps.db) {
        const reqs = await deps.db.query('SELECT id FROM requirements WHERE module = ?', [module]);
        const ids = (reqs as any[]).map(r => r.id);
        return createService(deps).buildFlowGraph(ids);
      }
      return { nodes: [], edges: [] };
    },
  };
}