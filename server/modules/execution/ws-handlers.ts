import type { WebSocket } from 'ws';
import { globalEventBus, type WsEventName, type WsEventHandler } from '../../shared/services/eventBus.ts';
import { getActiveRunLogger } from './run-registry.ts';

function handleLogStream(data: any, ws: WebSocket) {
  const { reportId, log } = data;
  const logger = getActiveRunLogger(reportId);
  if (logger && log) {
    logger.log(log);
  }
}

function handleProgressStream(data: any, ws: WebSocket) {
  const { reportId, progress } = data;
  const logger = getActiveRunLogger(reportId);
  if (logger) logger.progress(progress);
}

export function registerExecutionWsHandlers() {
  const handlers: Partial<Record<WsEventName, WsEventHandler>> = {
    LOG_STREAM: handleLogStream,
    PROGRESS_STREAM: handleProgressStream,
  };

  for (const [event, handler] of Object.entries(handlers)) {
    globalEventBus.on(event as WsEventName, handler);
  }
}
