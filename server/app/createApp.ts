import express from 'express';
import cors from 'cors';

import { runMigrations } from '../migrations/index.ts';
import { registerRoutes } from './registerRoutes.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', true);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  runMigrations();

  registerRoutes(app);

  return app;
}
