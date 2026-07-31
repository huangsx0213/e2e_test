import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration004RequirementsTestScenario: Migration = {
  id: '004_requirements_test_scenario',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;

    if (!reqCols.some((c) => c.name === 'test_scenario')) {
      db.exec("ALTER TABLE requirements ADD COLUMN test_scenario TEXT");
    }

    // Backfill: existing AC rows default to 'happy'
    db.exec("UPDATE requirements SET test_scenario = 'happy' WHERE level = 'ac' AND test_scenario IS NULL");
  },
};
