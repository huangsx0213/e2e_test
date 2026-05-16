import { db } from '../shared/db/client.ts';
import { migration001InitialSchema } from './001_initial_schema.ts';
import { migration002EnvironmentVariables } from './002_environment_variables.ts';
import { migration003StepExtractors } from './003_step_extractors.ts';
import { migration004DynamicVariables } from './004_dynamic_variables.ts';
import { migration005StructuredLogs } from './005_structured_logs.ts';
import { migration006StepAssertions } from './006_step_assertions.ts';
import { migration007SettingsRecordVideo } from './007_settings_record_video.ts';
import type { Migration } from './types.ts';

import { migration008AgentsQueues } from './008_agents_queues.ts';
import { migration009AgentsVersion } from './009_agents_version.ts';
import { migration010ProjectElementMetadata } from './010_project_element_metadata.ts';
import { migration011StepMetadata } from './011_step_metadata.ts';
import { migration012RequirementsSchema } from './012_requirements_schema.ts';

import { seedDefaults } from '../seed.ts';

export { seedDefaults };

export const migrations: Migration[] = [
  migration001InitialSchema,
  migration002EnvironmentVariables,
  migration003StepExtractors,
  migration004DynamicVariables,
  migration005StructuredLogs,
  migration006StepAssertions,
  migration007SettingsRecordVideo,
  migration008AgentsQueues,
  migration009AgentsVersion,
  migration010ProjectElementMetadata,
  migration011StepMetadata,
  migration012RequirementsSchema,
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
      console.log('🔄 FORCE_SEED=true: Resetting database...');
    } else {
      console.log('🌱 Empty database: Auto-seeding...');
    }
    seedDefaults();
  }
}
