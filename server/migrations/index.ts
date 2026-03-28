import { db } from '../shared/db/client.ts';
import { migration001InitialSchema } from './001_initial_schema.ts';
import type { Migration } from './types.ts';

const migrations: Migration[] = [
  migration001InitialSchema,
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
