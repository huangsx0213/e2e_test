import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration017SuitePosition: Migration = {
  id: '017_suite_position',
  up: () => {
    db.exec(`
      ALTER TABLE suites ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_suites_position ON suites(project_id, position);
    `);

    const rows = db.prepare('SELECT id FROM suites ORDER BY rowid').all() as Array<{ id: string }>;
    const updateStmt = db.prepare('UPDATE suites SET position = ? WHERE id = ?');
    for (const [index, row] of rows.entries()) {
      updateStmt.run(index, row.id);
    }
  },
};
