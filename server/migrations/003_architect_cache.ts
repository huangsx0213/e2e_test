import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration003ArchitectCache: Migration = {
  id: '003_architect_cache',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_gen_architect_cache (
        project_id TEXT NOT NULL,
        requirement_hash TEXT NOT NULL,
        blueprint TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, requirement_hash)
      );
    `);
  },
};
