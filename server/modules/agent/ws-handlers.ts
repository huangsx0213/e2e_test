import type { WebSocket } from 'ws';
import { globalEventBus, type WsEventName, type WsEventHandler } from '../../shared/services/eventBus.ts';
import { agentRegistry } from './registry.ts';
import { agentDispatcherEvents, checkQueue } from './dispatcher.ts';
import { abortRemoteRun } from './dispatcher.ts';
import { agentLogBuffer } from './log-buffer.ts';
import { setRemoteAbortHandler } from '../execution/run-registry.ts';

function handleAgentRegister(data: any, ws: WebSocket) {
  const { agentId, platform, version } = data;
  agentRegistry.registerOrUpdate(agentId, platform, version, 'idle', ws);
  checkQueue();
}

function handleAgentHeartbeat(data: any, ws: WebSocket) {
  const { agentId, status } = data;
  const existing = agentRegistry.get(agentId);
  if (existing) {
    if (existing.status !== status && status === 'idle') {
      agentRegistry.markIdle(agentId);
      checkQueue();
    } else if (status === 'busy') {
      agentRegistry.markBusy(agentId, existing.currentReportId || '');
    }
  }
}

function handleExecutionComplete(data: any, ws: WebSocket) {
  agentDispatcherEvents.emit(`COMPLETE_${data.runId || data.reportId}`, data);
}

function handleTaskRejected(data: any, ws: WebSocket) {
  agentDispatcherEvents.emit(`REJECTED_${data.reportId}`, data);
}

function handleAgentLog(data: any, ws: WebSocket) {
  const { agentId, timestamp, level, message } = data;
  if (agentId && message) {
    agentLogBuffer.push(agentId, { timestamp, level, message });
  }
}

function handleWsDisconnected(_data: any, ws: WebSocket) {
  agentRegistry.remove(ws);
}

export function registerAgentWsHandlers() {
  const handlers: Partial<Record<WsEventName, WsEventHandler>> = {
    AGENT_REGISTER: handleAgentRegister,
    AGENT_HEARTBEAT: handleAgentHeartbeat,
    EXECUTION_COMPLETE: handleExecutionComplete,
    TASK_REJECTED: handleTaskRejected,
    AGENT_LOG: handleAgentLog,
    WS_DISCONNECTED: handleWsDisconnected,
  };

  for (const [event, handler] of Object.entries(handlers)) {
    globalEventBus.on(event as WsEventName, handler);
  }

  setRemoteAbortHandler(abortRemoteRun);
}
