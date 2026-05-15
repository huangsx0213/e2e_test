import type { WebSocket } from 'ws';
import { globalEventBus, type WsEventHandler } from '../../shared/services/eventBus.ts';
import { wsService } from '../../shared/services/websocketService.ts';
import { RecordingService } from './service.ts';
import { defaultIngestService } from './default-ingest.ts';
import type { RecordingEnvelope, StepRecordedEvent, ElementRecordedEvent, ApiRecordedEvent } from '../../../shared/recording/protocol.ts';

const recordingService = new RecordingService(defaultIngestService, wsService);

function handleRecordingEvent(data: unknown, ws: WebSocket) {
  const envelope = data as RecordingEnvelope;
  const { event, data: innerData } = envelope || {};
  if (!event) return;

  if (event === 'step-recorded') {
    recordingService.handleStepRecorded((innerData as StepRecordedEvent['data']));
    return;
  }

  if (event === 'element-recorded') {
    recordingService.handleElementRecorded((innerData as ElementRecordedEvent['data']));
    return;
  }

  if (event === 'api-recorded') {
    recordingService.handleApiRecorded((innerData as ApiRecordedEvent['data']));
    return;
  }

  wsService.broadcastToProject((innerData as Record<string, unknown>)?.projectId as string || '', event, innerData);
}

export function registerRecordingWsHandlers() {
  globalEventBus.on('RECORDING_EVENT', handleRecordingEvent);
}