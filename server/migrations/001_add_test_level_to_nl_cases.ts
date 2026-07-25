import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration001AddTestLevelToNlCases: Migration = {
  id: '001_add_test_level_to_nl_cases',
  up: () => {
    // SQLite supports ADD COLUMN; IF NOT EXISTS is not available for ADD COLUMN,
    // so we guard with a pragma check to stay idempotent across re-runs.
    const cols = db.prepare('PRAGMA table_info(natural_language_test_cases)').all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'test_level')) {
      db.exec('ALTER TABLE natural_language_test_cases ADD COLUMN test_level TEXT');
    }
  },
};
