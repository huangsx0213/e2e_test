import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { globalEventBus } from './eventBus.ts';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();
const clientProjectMap = new WeakMap<WebSocket, string>();

export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server });
  const AGENT_SECRET = process.env.AGENT_SECRET || '';
  console.log(`[WS_SERVER] Initialized. Agent Security: ${AGENT_SECRET ? 'ENABLED' : 'DISABLED'}`);

  wss.on('connection', (ws, req) => {
    const incomingSecret = req.headers['x-agent-secret'];
    if (AGENT_SECRET && incomingSecret && incomingSecret !== AGENT_SECRET) {
      ws.terminate();
      return;
    }

    clients.add(ws);

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.event === 'SUBSCRIBE_PROJECT' && parsed.data?.projectId) {
          clientProjectMap.set(ws, parsed.data.projectId);
          return;
        }
        if (parsed.event) {
          globalEventBus.emit(parsed.event, parsed.data, ws);
        }
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      clientProjectMap.delete(ws);
      globalEventBus.emit('WS_DISCONNECTED', undefined, ws);
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

export function broadcastToProject(projectId: string, event: string, data: any) {
  if (!projectId) {
    broadcast(event, data);
    return;
  }
  const message = JSON.stringify({ event, data });
  clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const subProject = clientProjectMap.get(client);
    if (subProject === projectId) {
      client.send(message);
    }
  });
}
