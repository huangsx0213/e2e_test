import EventEmitter from 'events';
import type { WebSocket } from 'ws';

export const globalEventBus = new EventEmitter();

export interface WsMessageEvent {
  event: string;
  data: any;
  ws: WebSocket;
}

export type WsEventHandler = (data: any, ws: WebSocket) => void;
