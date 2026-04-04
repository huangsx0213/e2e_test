import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration004DynamicVariables: Migration = {
  id: '004_dynamic_variables',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dynamic_variables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        expression TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE INDEX IF NOT EXISTS dynamic_variables_project_id_idx ON dynamic_variables(project_id);
    `);
  },
};
