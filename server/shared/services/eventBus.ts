import EventEmitter from 'events';
import type { WebSocket } from 'ws';

export type WsEventName =
  | 'AGENT_REGISTER' | 'AGENT_HEARTBEAT'
  | 'EXECUTION_COMPLETE' | 'TASK_REJECTED'
  | 'AGENT_LOG' | 'WS_DISCONNECTED'
  | 'RECORDING_EVENT'
  | 'LOG_STREAM' | 'PROGRESS_STREAM'
  | 'SUBSCRIBE_PROJECT';

export type WsEventHandler = (data: any, ws: WebSocket) => void;

class GlobalEventBus {
  private emitter = new EventEmitter();

  on(event: WsEventName, handler: WsEventHandler): void {
    this.emitter.on(event, handler);
  }

  emit(event: string, data: unknown, ws: WebSocket): void {
    this.emitter.emit(event, data, ws);
  }
}

export const globalEventBus = new GlobalEventBus();
