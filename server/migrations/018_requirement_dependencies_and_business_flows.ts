import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration018RequirementDependenciesAndBusinessFlows: Migration = {
  id: '018_requirement_dependencies_and_business_flows',
  up: () => {
    db.exec(`
      ALTER TABLE requirements ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS business_flows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'happy-path',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        steps TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
