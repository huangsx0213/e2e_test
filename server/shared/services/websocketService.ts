import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { globalEventBus } from './eventBus.ts';
import { Log } from './logger';

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private clientProjectMap = new WeakMap<WebSocket, string>();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server });
    const AGENT_SECRET = process.env.AGENT_SECRET || '';
    Log.for('ws').info(`Initialized. Agent Security: ${AGENT_SECRET ? 'ENABLED' : 'DISABLED'}`);

    this.wss.on('connection', (ws, req) => {
      const incomingSecret = req.headers['x-agent-secret'];
      if (AGENT_SECRET && incomingSecret && incomingSecret !== AGENT_SECRET) {
        ws.terminate();
        return;
      }

      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.event === 'SUBSCRIBE_PROJECT' && parsed.data?.projectId) {
            this.clientProjectMap.set(ws, parsed.data.projectId);
            return;
          }
          if (parsed.event) {
            globalEventBus.emit(parsed.event, parsed.data, ws);
          }
        } catch (e) {
          Log.for('ws').error(`Error handling WS message: ${e}`);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.clientProjectMap.delete(ws);
        globalEventBus.emit('WS_DISCONNECTED', undefined, ws);
      });
    });

    return this.wss;
  }

  broadcast(event: string, data: unknown) {
    const message = JSON.stringify({ event, data });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastToProject(projectId: string, event: string, data: unknown) {
    if (!projectId) {
      this.broadcast(event, data);
      return;
    }
    const message = JSON.stringify({ event, data });
    this.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const subProject = this.clientProjectMap.get(client);
      if (subProject === projectId) {
        client.send(message);
      }
    });
  }
}

export const wsService = new WebSocketService();
