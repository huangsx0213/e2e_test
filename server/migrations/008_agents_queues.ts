import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration008AgentsQueues: Migration = {
  id: '008_agents_queues',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        os TEXT NOT NULL DEFAULT 'unknown',
        status TEXT NOT NULL DEFAULT 'offline',
        labels TEXT NOT NULL DEFAULT '[]',
        last_seen INTEGER NOT NULL DEFAULT 0
      );

      ALTER TABLE execution_runs ADD COLUMN agent_id TEXT;
    `);
  },
};
