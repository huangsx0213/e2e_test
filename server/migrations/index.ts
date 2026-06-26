import { Log } from '../shared/services/logger';
import { db } from '../shared/db/client.ts';
import { migration000InitialSchema } from './000_initial_schema.ts';
import { migration001AgentMemory } from './001_agent_memory.ts';
import { migration002CoverageRowType } from './002_coverage_row_type.ts';
import { migration003ArchitectCache } from './003_architect_cache.ts';
import { seedDefaults } from '../seed.ts';
import type { Migration } from './types.ts';

export const migrations: Migration[] = [
  migration000InitialSchema,
  migration001AgentMemory,
  migration002CoverageRowType,
  migration003ArchitectCache,
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

  const projectCount = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as any).count;

  if (process.env.FORCE_SEED === 'true' || projectCount === 0) {
    if (process.env.FORCE_SEED === 'true') {
      Log.for('migrate').info('FORCE_SEED=true: Resetting database...');
    } else {
      Log.for('migrate').info('Empty database: Auto-seeding...');
    }
    seedDefaults();
  }
}
