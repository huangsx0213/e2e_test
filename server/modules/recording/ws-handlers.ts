import type { WebSocket } from 'ws';
import { globalEventBus, type WsEventHandler } from '../../shared/services/eventBus.ts';
import { broadcastToProject } from '../../shared/services/websocketService.ts';
import { handleStepRecorded, handleElementRecorded, handleApiRecorded } from './service.ts';
import type { RecordingEnvelope, StepRecordedEvent, ElementRecordedEvent, ApiRecordedEvent, RecorderStateChangedEvent } from '../../../shared/recording/protocol.ts';

function handleRecordingEvent(data: unknown, ws: WebSocket) {
  const envelope = data as RecordingEnvelope;
  const { event, data: innerData } = envelope || {};
  if (!event) return;

  if (event === 'step-recorded') {
    handleStepRecorded((innerData as StepRecordedEvent['data']));
    return;
  }

  if (event === 'element-recorded') {
    handleElementRecorded((innerData as ElementRecordedEvent['data']));
    return;
  }

  if (event === 'api-recorded') {
    handleApiRecorded((innerData as ApiRecordedEvent['data']));
    return;
  }

  broadcastToProject((innerData as Record<string, unknown>)?.projectId as string || '', event, innerData);
}

export function registerRecordingWsHandlers() {
  globalEventBus.on('RECORDING_EVENT', handleRecordingEvent);
}