import { db } from '../shared/db/client.ts';
import { migration001InitialSchema } from './001_initial_schema.ts';
import { migration002EnvironmentVariables } from './002_environment_variables.ts';
import { migration003StepExtractors } from './003_step_extractors.ts';
import { migration004DynamicVariables } from './004_dynamic_variables.ts';
import { migration005StructuredLogs } from './005_structured_logs.ts';
import type { Migration } from './types.ts';

import { runSeed } from './seed.ts';

export const migrations: Migration[] = [
  migration001InitialSchema,
  migration002EnvironmentVariables,
  migration003StepExtractors,
  migration004DynamicVariables,
  migration005StructuredLogs,
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

  // Auto-seed if database is empty
  const projectCount = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as any).count;
  if (projectCount === 0) {
    runSeed();
  }
}
