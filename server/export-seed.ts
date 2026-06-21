import { Log } from './shared/services/logger';
import fs from 'node:fs';
import path from 'node:path';

import type {
  ApiEndpoint,
  BodyTemplate,
  DynamicVariable,
  HeaderProfile,
  Project,
  Requirement,
  Settings,
  TestSuite,
} from '../shared/contracts/index.ts';
import { listBodyTemplates } from './modules/bodies/repository.ts';
import { dynamicVariableRepository } from './modules/dynamic-variables/repository.ts';
import { getEnvironmentVariables, listEnvironments } from './modules/environments/repository.ts';
import { listApiEndpoints } from './modules/endpoints/repository.ts';
import { listHeaderProfiles } from './modules/headers/repository.ts';
import { listProjects } from './modules/projects/repository.ts';
import { requirementRepo } from './modules/requirements/repository.ts';
import { listSettings } from './modules/settings/repository.ts';
import { listSuites } from './modules/suites/repository.ts';

interface SeedEnvironment {
  name: string;
  variables: Record<string, string>;
}

export interface BusinessConfigSeed {
  environments: SeedEnvironment[];
  settings: Settings[];
  projects: Project[];
  suites: TestSuite[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  dynamicVariables: Array<Pick<DynamicVariable, 'id' | 'projectId' | 'name' | 'expression' | 'description' | 'evaluationStrategy'>>;
  requirements: Requirement[];
}

const outputFile = path.join(process.cwd(), 'server', 'seed-data', 'business-config.ts');

function orderRequirements(requirements: Requirement[]): Requirement[] {
  const pending = [...requirements];
  const ordered: Requirement[] = [];
  const inserted = new Set<string>();

  while (pending.length > 0) {
    let insertedThisPass = 0;

    for (let index = 0; index < pending.length;) {
      const requirement = pending[index];
      if (requirement.parentId && !inserted.has(requirement.parentId)) {
        index++;
        continue;
      }

      ordered.push(requirement);
      inserted.add(requirement.id);
      pending.splice(index, 1);
      insertedThisPass++;
    }

    if (insertedThisPass === 0) {
      throw new Error(`Unable to order requirements for export: ${pending.map((requirement) => requirement.id).join(', ')}`);
    }
  }

  return ordered;
}

function buildSeed(): BusinessConfigSeed {
  return {
    environments: listEnvironments().map((name) => ({
      name,
      variables: getEnvironmentVariables(name),
    })),
    settings: listSettings(),
    projects: listProjects(),
    suites: listSuites(),
    headers: listHeaderProfiles(),
    bodies: listBodyTemplates(),
    endpoints: listApiEndpoints(),
    dynamicVariables: dynamicVariableRepository.list().map((variable) => ({
      id: variable.id,
      projectId: variable.projectId,
      name: variable.name,
      expression: variable.expression,
      description: variable.description,
      evaluationStrategy: variable.evaluationStrategy,
    })),
    requirements: orderRequirements(requirementRepo.list()),
  };
}

function buildSource(seed: BusinessConfigSeed): string {
  return `import type {
  ApiEndpoint,
  BodyTemplate,
  DynamicVariable,
  HeaderProfile,
  Project,
  Requirement,
  Settings,
  TestSuite,
} from '../../shared/contracts/index.ts';

export interface SeedEnvironment {
  name: string;
  variables: Record<string, string>;
}

export interface BusinessConfigSeed {
  environments: SeedEnvironment[];
  settings: Settings[];
  projects: Project[];
  suites: TestSuite[];
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  dynamicVariables: Array<Pick<DynamicVariable, 'id' | 'projectId' | 'name' | 'expression' | 'description' | 'evaluationStrategy'>>;
  requirements: Requirement[];
}

export const businessConfigSeed: BusinessConfigSeed = ${JSON.stringify(seed, null, 2)};
`;
}

export function exportBusinessConfigSeed(): void {
  const seed = buildSeed();
  const source = buildSource(seed);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, source, 'utf8');

  Log.for('seed').info(`Wrote business config seed to ${outputFile}`);
  Log.for('seed').info(`Projects: ${seed.projects.length}`);
  Log.for('seed').info(`Suites: ${seed.suites.length}`);
  Log.for('seed').info(`Headers: ${seed.headers.length}`);
  Log.for('seed').info(`Bodies: ${seed.bodies.length}`);
  Log.for('seed').info(`Endpoints: ${seed.endpoints.length}`);
  Log.for('seed').info(`Dynamic variables: ${seed.dynamicVariables.length}`);
  Log.for('seed').info(`Requirements: ${seed.requirements.length}`);
}

if (path.basename(process.argv[1] || '') === 'export-seed.ts') {
  import('./migrations/index.ts').then(({ runMigrations }) => {
    runMigrations();
    exportBusinessConfigSeed();
  });
}
