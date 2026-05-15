import type { ExecutionDataLoader } from './data-loader.ts';
import { projectRepository } from '../projects/repository.ts';
import { headerRepository } from '../headers/repository.ts';
import { bodyRepository } from '../bodies/repository.ts';
import { endpointRepository } from '../endpoints/repository.ts';
import { environmentRepository } from '../environments/repository.ts';
import { dynamicVariableRepository } from '../dynamic-variables/repository.ts';
import { settingsRepository } from '../settings/repository.ts';
import { suiteRepository } from '../suites/repository.ts';
import { reportRepository } from '../reports/repository.ts';
import type { Project, HeaderProfile, BodyTemplate, ApiEndpoint, DynamicVariable, TestSuite, ExecutionReport, Settings } from '../../shared/contracts/index.ts';

export const defaultDataLoader: ExecutionDataLoader = {
  getProject: (id) => projectRepository.get(id),
  listHeaders: () => headerRepository.list(),
  listBodies: () => bodyRepository.list(),
  listEndpoints: () => endpointRepository.list(),
  getEnvironmentVariables: (env) => environmentRepository.getVariables(env),
  updateEnvironmentVariables: (env, vars) => environmentRepository.updateVariables(env, vars),
  findDynamicVariables: (projectId) => dynamicVariableRepository.findByProjectId(projectId),
  listSettings: () => settingsRepository.list(),
  listSuites: () => suiteRepository.list(),
  getSuite: (id) => suiteRepository.get(id),
  saveReport: (report) => reportRepository.save(report),
};
