import express from 'express';
import path from 'path';
import { createApp } from './createApp.ts';
import { initializeWebSocket } from '../shared/services/websocketService.ts';
import { registerAgentWsHandlers } from '../modules/agent/ws-handlers.ts';
import { registerExecutionWsHandlers } from '../modules/execution/ws-handlers.ts';
import { registerRecordingWsHandlers } from '../modules/recording/ws-handlers.ts';
import { runMigrations } from '../migrations/index.ts';

import { getInternalIp } from '../modules/agent/index.ts';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export async function startServer() {
  // Ensure database is initialized before starting
  runMigrations();

  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);
    
    app.use(/^\/aut/, async (req, res, next) => {
      try {
        let template = await import('fs').then(m => m.readFileSync(path.resolve(process.cwd(), 'aut/aut.html'), 'utf-8'));
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    app.use(async (req, res, next) => {
      try {
        let template = await import('fs').then(m => m.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8'));
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^\/aut/, (req, res) => {
      res.sendFile(path.join(distPath, 'aut.html'));
    });
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const internalIp = getInternalIp();
    console.log(`Server running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://${internalIp}:${PORT}`);
  });

  initializeWebSocket(server);

  registerAgentWsHandlers();
  registerExecutionWsHandlers();
  registerRecordingWsHandlers();
}
