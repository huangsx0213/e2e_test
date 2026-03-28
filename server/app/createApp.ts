import express from 'express';
import cors from 'cors';

import { runMigrations } from '../migrations/index.ts';
import { registerRoutes } from './registerRoutes.ts';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  runMigrations();

  registerRoutes(app);

  return app;
}
