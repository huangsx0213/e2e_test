import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

import { agentRegistry } from '../../modules/agent/registry.ts';
import { agentDispatcherEvents } from '../../modules/agent/dispatcher.ts';
import { getActiveRunLogger } from '../../modules/execution/runner.ts';

export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    // console.log('WS Client connected');

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());

        if (parsed.event === 'AGENT_REGISTER') {
          const { agentId, platform } = parsed.data;
          agentRegistry.registerOrUpdate(agentId, platform, 'idle', ws);
        } else if (parsed.event === 'AGENT_HEARTBEAT') {
          const { agentId, status } = parsed.data;
          const existing = agentRegistry.get(agentId);
          if (existing) {
            existing.status = status;
            existing.lastSeen = Date.now();
          }
        } else if (parsed.event === 'LOG_STREAM') {
          const { reportId, log } = parsed.data;
          const logger = getActiveRunLogger(reportId);
          if (logger && log) {
             logger.log(log);
          }
        } else if (parsed.event === 'PROGRESS_STREAM') {
          const { reportId, progress } = parsed.data;
          const logger = getActiveRunLogger(reportId);
          if (logger) logger.progress(progress);
        } else if (parsed.event === 'EXECUTION_COMPLETE') {
          // Fire dispatcher event
          agentDispatcherEvents.emit(`COMPLETE_${parsed.data.runId || parsed.data.reportId}`, parsed.data);
        }
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      agentRegistry.remove(ws);
      // console.log('WS Client disconnected');
    });
  });

  return wss;
}

export function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
