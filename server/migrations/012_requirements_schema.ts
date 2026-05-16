import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration012RequirementsSchema: Migration = {
  id: '012_requirements_schema',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirements (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
        type TEXT NOT NULL DEFAULT 'functional',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        position INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE settings ADD COLUMN ai_provider_configs TEXT NOT NULL DEFAULT '{}';
    `);
  },
};