import { Log } from '../shared/services/logger';
import { db } from '../shared/db/client.ts';
import { migration000InitialSchema } from './000_initial_schema.ts';
import { migration001AddTestLevelToNlCases } from './001_add_test_level_to_nl_cases.ts';
import { migration002RequirementsHumanIdAndFlowType } from './002_requirements_human_id_and_flow_type.ts';
import { migration003RemoveFeatureLevel } from './003_remove_feature_level.ts';
import { migration004RequirementsTestScenario } from './004_requirements_test_scenario.ts';
import { migration005DropPriorityAndTagsAndInProgress } from './005_drop_priority_and_tags_and_in_progress.ts';
import { migration006DropMetadataAndTestScenario } from './006_drop_metadata_and_test_scenario.ts';
import { migration007AddIsFlowAndRelatedRequirements } from './007_add_is_flow_and_related_requirements.ts';
import { seedDefaults } from '../seed.ts';
import type { Migration } from './types.ts';

export const migrations: Migration[] = [
  migration000InitialSchema,
  migration001AddTestLevelToNlCases,
  migration002RequirementsHumanIdAndFlowType,
  migration003RemoveFeatureLevel,
  migration004RequirementsTestScenario,
  migration005DropPriorityAndTagsAndInProgress,
  migration006DropMetadataAndTestScenario,
  migration007AddIsFlowAndRelatedRequirements,
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
