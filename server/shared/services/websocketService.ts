import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    // console.log('WS Client connected');

    ws.on('close', () => {
      clients.delete(ws);
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
