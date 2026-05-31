interface IndexDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface RequirementSummary {
  id: string;
  title: string;
  module: string;
  priority: string;
  status: string;
  version: string;
  parentId?: string;
  tags?: string[];
  description?: string;
}

export function getChildren(index: RequirementSummary[], parentId: string): RequirementSummary[] {
  return index.filter(item => item.parentId === parentId);
}

export function searchByTag(index: RequirementSummary[], tag: string): RequirementSummary[] {
  return index.filter(item => (item.tags ?? []).includes(tag));
}

export function createService(deps: IndexDeps) {
  return {
    getIndexSummary: async (): Promise<{ total: number; modules: string[]; priorities: string[] }> => {
      if (deps.db) {
        const counts = await deps.db.query('SELECT module, priority, COUNT(*) as cnt FROM requirements GROUP BY module, priority');
        const totalRes = await deps.db.query('SELECT COUNT(*) as total FROM requirements');
        const modules = [...new Set((counts as any[]).map(r => r.module))];
        const priorities = [...new Set((counts as any[]).map(r => r.priority))];
        return { total: (totalRes as any[])[0]?.total ?? 0, modules, priorities };
      }
      return { total: 0, modules: [], priorities: [] };
    },

    listRequirements: async (page?: number, pageSize?: number): Promise<RequirementSummary[]> => {
      if (deps.db) {
        const offset = ((page ?? 1) - 1) * (pageSize ?? 50);
        const rows = await deps.db.query(
          'SELECT id, title, module, priority, status, version FROM requirements ORDER BY priority DESC, module ASC LIMIT ? OFFSET ?',
          [pageSize ?? 50, offset]
        );
        return rows as RequirementSummary[];
      }
      return [];
    },
  };
}