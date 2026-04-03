import { db } from '../shared/db/client.ts';
import { migration001InitialSchema } from './001_initial_schema.ts';
import { migration002ExecutionRuns } from './002_execution_runs.ts';
import { migration003UiExecution } from './003_ui_execution.ts';
import { migration004StepEnabled } from './004_step_enabled.ts';
import { migration005 } from './005_scenario_iteration_strategy.ts';
import * as migration006TestPlans from './006_test_plans.ts';
import { migration007ViewportSettings } from './007_viewport_settings.ts';
import { migration008ElementRecordingFields } from './008_element_recording_fields.ts';
import type { Migration } from './types.ts';

export const migrations: Migration[] = [
  migration001InitialSchema,
  migration002ExecutionRuns,
  migration003UiExecution,
  migration004StepEnabled,
  migration005,
  { id: '006_test_plans', up: () => migration006TestPlans.up(db) },
  migration007ViewportSettings,
  migration008ElementRecordingFields,
];

function appliedMigrationIds(): Set<string> {
  const rows = db
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all() as Array<{ id: string }>;

  return new Set(rows.map((row) => row.id));
}

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = appliedMigrationIds();
  const markApplied = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)');

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const transaction = db.transaction(() => {
      migration.up();
      markApplied.run(migration.id);
    });

    transaction();
  }
}
