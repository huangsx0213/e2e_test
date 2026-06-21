import { Log } from '../shared/services/logger';
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
import { migration013AiTestGenSchema } from './013_ai_test_gen_schema.ts';
import { migration014DynamicVariableEvaluationStrategy } from './014_dynamic_variable_evaluation_strategy.ts';
import { migration015RequirementLevel } from './015_requirement_level.ts';
import { migration016RequirementTags } from './016_requirement_tags.ts';
import { migration017SuitePosition } from './017_suite_position.ts';
import { migration018RequirementDependenciesAndBusinessFlows } from './018_requirement_dependencies_and_business_flows.ts';
import { migration021ProviderConfigFix } from './021_provider_config_fix.ts';
import { migration022ThreadId } from './022_add_thread_id.ts';
import { migration023DropCheckpointData } from './023_drop_checkpoint_data.ts';
import { migration024DropRedundantTables } from './024_drop_redundant_tables.ts';
import { migration025AddAgentErrorColumns } from './025_add_agent_error_columns.ts';
import { migration026AddToolHistoryColumn } from './026_add_tool_history_column.ts';
import { migration027ProviderModels } from './027_provider_models.ts';
import { migration028ThinkingData } from './028_thinking_data.ts';
import { migration029PromptOverrides } from './029_prompt_overrides.ts';
import { migration030AiDrivenRecorderSchema } from './030_ai_driven_recorder_schema.ts';

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
  migration013AiTestGenSchema,
  migration014DynamicVariableEvaluationStrategy,
  migration015RequirementLevel,
  migration016RequirementTags,
  migration017SuitePosition,
migration018RequirementDependenciesAndBusinessFlows,
migration021ProviderConfigFix,
  migration022ThreadId,
  migration023DropCheckpointData,
  migration024DropRedundantTables,
  migration025AddAgentErrorColumns,
  migration026AddToolHistoryColumn,
  migration027ProviderModels,
  migration028ThinkingData,
  migration029PromptOverrides,
  migration030AiDrivenRecorderSchema,
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
