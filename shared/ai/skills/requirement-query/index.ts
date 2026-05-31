interface QueryDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface RequirementFilter {
  module?: string;
  priority?: string;
  status?: string;
  searchTerm?: string;
}

export function queryRequirements(filter: RequirementFilter, indexData: any[]): any[] {
  return indexData.filter(item => {
    if (filter.module && item.module !== filter.module) return false;
    if (filter.priority && item.priority !== filter.priority) return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      const title = (item.title ?? '').toLowerCase();
      const desc = (item.description ?? '').toLowerCase();
      if (!title.includes(term) && !desc.includes(term)) return false;
    }
    return true;
  });
}

export function createService(deps: QueryDeps) {
  return {
    queryRequirements: async (filter: RequirementFilter, limit?: number): Promise<unknown[]> => {
      if (deps.db) {
        let sql = 'SELECT * FROM requirements WHERE 1=1';
        const params: unknown[] = [];
        if (filter.module) { sql += ' AND module = ?'; params.push(filter.module); }
        if (filter.priority) { sql += ' AND priority = ?'; params.push(filter.priority); }
        if (filter.status) { sql += ' AND status = ?'; params.push(filter.status); }
        if (filter.searchTerm) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${filter.searchTerm}%`); params.push(`%${filter.searchTerm}%`); }
        if (limit) { sql += ` LIMIT ${limit}`; }
        return deps.db.query(sql, params);
      }
      return [];
    },

    getRequirementById: async (id: string): Promise<unknown | null> => {
      if (deps.db) {
        const results = await deps.db.query('SELECT * FROM requirements WHERE id = ?', [id]);
        return results[0] ?? null;
      }
      return null;
    },
  };
}