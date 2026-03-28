import express from 'express';
import cors from 'cors';

import { runMigrations } from './migrations/index.ts';
import { bodyRoutes } from './modules/bodies/routes.ts';
import { endpointRoutes } from './modules/endpoints/routes.ts';
import { environmentRoutes } from './modules/environments/routes.ts';
import { headerRoutes } from './modules/headers/routes.ts';
import { projectRoutes } from './modules/projects/routes.ts';
import { reportRoutes } from './modules/reports/routes.ts';
import { settingsRoutes } from './modules/settings/routes.ts';
import { suiteRoutes } from './modules/suites/routes.ts';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  runMigrations();

  app.use('/api/projects', projectRoutes);
  app.use('/api/suites', suiteRoutes);
  app.use('/api/headers', headerRoutes);
  app.use('/api/bodies', bodyRoutes);
  app.use('/api/endpoints', endpointRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/environments', environmentRoutes);

  return app;
}
