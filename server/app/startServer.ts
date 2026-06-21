import { Log } from '../shared/services/logger';
import '../shared/services/fileLogger.ts';

import express from 'express';
import path from 'path';
import { createApp } from './createApp.ts';
import { wsService } from '../shared/services/websocketService.ts';
import { registerAgentWsHandlers } from '../modules/agent/ws-handlers.ts';
import { registerExecutionWsHandlers } from '../modules/execution/ws-handlers.ts';
import { registerRecordingWsHandlers } from '../modules/recording/ws-handlers.ts';

import { getInternalIp } from '../modules/agent/index.ts';
import { recoverInterruptedTestGenRuns } from '../modules/ai-test-gen/index.ts';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export async function startServer() {
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
      res.sendFile(path.join(distPath, 'aut', 'aut.html'));
    });
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const internalIp = getInternalIp();
    Log.for('server').info(`Server running on:\n  - Local:   http://localhost:${PORT}\n  - Network: http://${internalIp}:${PORT}`);
  });

  wsService.initialize(server);

  registerAgentWsHandlers();
  registerExecutionWsHandlers();
  registerRecordingWsHandlers();

  // Recover any HITL runs that were waiting before restart
  recoverInterruptedTestGenRuns().catch(err => {
    Log.for('server').error(`Failed to recover interrupted test gen runs: ${err}`);
  });
}
