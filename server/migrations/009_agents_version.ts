import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration009AgentsVersion: Migration = {
  id: '009_agents_version',
  up: () => {
    const columns = db.prepare(`PRAGMA table_info(agents)`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'version')) {
      db.exec(`
        ALTER TABLE agents ADD COLUMN version TEXT NOT NULL DEFAULT 'unknown';
      `);
    }
  },
};
