import type { Express } from 'express';

import { bodiesModule } from '../modules/bodies/index.ts';
import { endpointsModule } from '../modules/endpoints/index.ts';
import { environmentsModule } from '../modules/environments/index.ts';
import { headersModule } from '../modules/headers/index.ts';
import { projectsModule } from '../modules/projects/index.ts';
import { reportsModule } from '../modules/reports/index.ts';
import { settingsModule } from '../modules/settings/index.ts';
import { suitesModule } from '../modules/suites/index.ts';
import { executionModule } from '../modules/execution/index.ts';
import { recordingModule } from '../modules/recording/index.ts';
import { dynamicVariablesModule } from '../modules/dynamic-variables/index.ts';

import { agentsModule } from '../modules/agent/index.ts';
import { demoRouter as autRouter } from '../../aut/server/routes';

export function registerRoutes(app: Express) {
  const modules = [
    projectsModule,
    suitesModule,
    headersModule,
    bodiesModule,
    endpointsModule,
    reportsModule,
    settingsModule,
    environmentsModule,
    executionModule,
    recordingModule,
    dynamicVariablesModule,
    agentsModule,
  ];

  for (const module of modules) {
    app.use(module.basePath, module.router);
  }

  app.use('/aut-api', autRouter);
}
