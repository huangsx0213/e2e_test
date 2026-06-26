import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration002CoverageRowType: Migration = {
  id: '002_coverage_row_type',
  up: () => {
    const columns = db.prepare("PRAGMA table_info(test_gen_persistent_coverage)").all() as Array<{ name: string }>;
    const hasRowType = columns.some(c => c.name === 'row_type');
    if (!hasRowType) {
      db.exec("ALTER TABLE test_gen_persistent_coverage ADD COLUMN row_type TEXT NOT NULL DEFAULT 'requirement'");
      db.exec('CREATE INDEX IF NOT EXISTS idx_persistent_coverage_row_type ON test_gen_persistent_coverage(project_id, row_type)');
    }
  },
};
