import {
  RECORDER_STATE_CHANGED_EVENT,
  STEP_RECORDED_EVENT,
  ELEMENT_RECORDED_EVENT,
  API_RECORDED_EVENT,
} from 'shared/recording/protocol';
import {
  startRecording as recorderV2StartRecording,
  stopRecording as recorderV2StopRecording,
} from './recorder/index.ts';

type SendMsg = (event: string, data: any) => void;
type RecordingLogger = Pick<Console, 'info' | 'error' | 'warn'>;

interface RecordingControlDeps {
  agentId: string;
  logger: RecordingLogger;
  sendMsg: SendMsg;
  emitRecordingEvent: (event: string, data: any) => void;
  resetAfterStop: () => void;
  setAgentStatus: (status: 'idle' | 'busy') => void;
  setIsRecordingActive: (value: boolean) => void;
}

export async function handleRecordingControlMessage(parsed: any, deps: RecordingControlDeps): Promise<boolean> {
  if (parsed.event === 'RECORDING_START') {
    const { targetUrl, projectId, apiFilter, environment, caseId, suiteId, mode } = parsed.data || {};
    deps.logger.info(`[AGENT] Received Recording Start: ${projectId} case=${caseId}`);

    try {
      deps.setIsRecordingActive(true);
      deps.setAgentStatus('busy');
      deps.sendMsg('AGENT_HEARTBEAT', { agentId: deps.agentId, status: 'busy' });
      deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, { status: 'RECEIVED', caseId, suiteId, mode });

      await recorderV2StartRecording(
        targetUrl,
        projectId,
        apiFilter,
        (element: any) => {
          deps.emitRecordingEvent(ELEMENT_RECORDED_EVENT, { projectId, element, caseId, suiteId });
        },
        (stepInfo: { action: string; element: any; dataValue: any }) => {
          deps.emitRecordingEvent(STEP_RECORDED_EVENT, { projectId, stepInfo, type: 'UI', caseId, suiteId });
        },
        (apiInfo: any) => {
          deps.emitRecordingEvent(API_RECORDED_EVENT, { projectId, environment, apiInfo, caseId, suiteId });
        },
        (state) => {
          deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, { state, caseId, suiteId });
          if (state.action === 'STOP') {
            deps.resetAfterStop();
          }
        },
        mode,
      );

      return true;
    } catch (error) {
      deps.logger.error('[AGENT] Failed to start recording:', error);
      deps.setIsRecordingActive(false);
      deps.setAgentStatus('idle');
      deps.sendMsg('AGENT_HEARTBEAT', { agentId: deps.agentId, status: 'idle' });
      deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, {
        status: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        mode,
      });
      return true;
    }
  }

  if (parsed.event === 'RECORDING_STOP') {
    deps.logger.info('[AGENT] Received Recording Stop');

    try {
      await recorderV2StopRecording();
    } finally {
      deps.resetAfterStop();
    }

    return true;
  }

  return false;
}