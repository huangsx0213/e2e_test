import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration002ExecutionRuns: Migration = {
  id: '002_execution_runs',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_runs (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        suite_id TEXT,
        case_id TEXT,
        scenario_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        started_at INTEGER,
        finished_at INTEGER,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_execution_runs_status ON execution_runs(status);
      CREATE INDEX IF NOT EXISTS idx_execution_runs_report ON execution_runs(report_id);
    `);
  },
};
