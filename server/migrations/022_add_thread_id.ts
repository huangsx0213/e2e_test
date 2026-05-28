import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration022ThreadId: Migration = {
  id: '022_add_thread_id',
  up: () => {
    db.exec(`
      ALTER TABLE test_gen_runs ADD COLUMN thread_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_test_gen_runs_thread_id ON test_gen_runs(thread_id);
      CREATE INDEX IF NOT EXISTS idx_test_gen_runs_status ON test_gen_runs(status);
    `);
  },
};
