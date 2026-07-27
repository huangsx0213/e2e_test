import { Log } from './shared/services/logger';
import path from 'node:path';

import { saveBodyTemplate } from './modules/bodies/repository.ts';
import { dynamicVariableRepository } from './modules/dynamic-variables/repository.ts';
import { createEnvironment, updateEnvironmentVariables } from './modules/environments/repository.ts';
import { saveApiEndpoint } from './modules/endpoints/repository.ts';
import { saveHeaderProfile } from './modules/headers/repository.ts';
import { saveProject } from './modules/projects/repository.ts';
import { requirementRepo } from './modules/requirements/repository.ts';
import { saveSettings } from './modules/settings/repository.ts';
import { saveSuite } from './modules/suites/repository.ts';
import { db } from './shared/db/client.ts';
import { businessConfigSeed } from './seed-data/business-config.ts';
import { seedBusinessFlows } from './seed-data/seed-business-flows.ts';

function seedRequirements(): void {
  const pending = [...businessConfigSeed.requirements];
  const inserted = new Set<string>();

  while (pending.length > 0) {
    let insertedThisPass = 0;

    for (let index = pending.length - 1; index >= 0; index--) {
      const requirement = pending[index];
      if (requirement.parentId && !inserted.has(requirement.parentId)) {
        continue;
      }

      requirementRepo.save(requirement);
      inserted.add(requirement.id);
      pending.splice(index, 1);
      insertedThisPass++;
    }

    if (insertedThisPass === 0) {
      const blocked = pending.map((requirement) => `${requirement.id}->${requirement.parentId ?? 'ROOT'}`).join(', ');
      throw new Error(`Unable to seed requirements due to unresolved parent references: ${blocked}`);
    }
  }
}

function clearAllData(): void {
  db.exec(`
    DELETE FROM natural_language_test_cases;
    DELETE FROM test_gen_runs;
    DELETE FROM report_logs;
    DELETE FROM reports;
    DELETE FROM execution_runs;
    DELETE FROM settings;
    DELETE FROM endpoint_parameters;
    DELETE FROM endpoint_base_urls;
    DELETE FROM endpoints;
    DELETE FROM body_default_values;
    DELETE FROM bodies;
    DELETE FROM header_items;
    DELETE FROM headers;
    DELETE FROM case_steps;
    DELETE FROM suite_steps;
    DELETE FROM suite_cases;
    DELETE FROM suite_data_row_values;
    DELETE FROM suite_data_rows;
    DELETE FROM suite_variables;
    DELETE FROM scenario_suite_variable_overrides;
    DELETE FROM scenario_suites;
    DELETE FROM scenario_variables;
    DELETE FROM scenario_data_row_values;
    DELETE FROM scenario_data_rows;
    DELETE FROM scenarios;
    DELETE FROM test_plan_scenarios;
    DELETE FROM test_plans;
    DELETE FROM module_steps;
    DELETE FROM module_params;
    DELETE FROM project_modules;
    DELETE FROM project_elements;
    DELETE FROM project_pages;
    DELETE FROM dynamic_variables;
    DELETE FROM requirements;
    DELETE FROM suites;
    DELETE FROM projects;
    DELETE FROM environments;
  `);
}

function seedBusinessConfig(): void {
  for (const environment of businessConfigSeed.environments) {
    createEnvironment(environment.name);
    updateEnvironmentVariables(environment.name, environment.variables);
  }

  for (const project of businessConfigSeed.projects) {
    saveProject(project);
  }

  for (const suite of businessConfigSeed.suites) {
    saveSuite(suite);
  }

  for (const header of businessConfigSeed.headers) {
    saveHeaderProfile(header);
  }

  for (const body of businessConfigSeed.bodies) {
    saveBodyTemplate(body);
  }

  for (const endpoint of businessConfigSeed.endpoints) {
    saveApiEndpoint(endpoint);
  }

  for (const dynamicVariable of businessConfigSeed.dynamicVariables) {
    dynamicVariableRepository.save(dynamicVariable);
  }

  for (const settings of businessConfigSeed.settings) {
    saveSettings(settings);
  }

  seedRequirements();
  seedBusinessFlows();
}

export function seedDefaults(): void {
  clearAllData();
  seedBusinessConfig();
  Log.for('seed').info('Database reset and business config seed data applied!');
}

if (path.basename(process.argv[1] || '') === 'seed.ts') {
  import('./migrations/index.ts').then(({ runMigrations }) => {
    runMigrations();
    seedDefaults();
  });
}
