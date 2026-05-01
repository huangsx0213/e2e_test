import { startRecording as recorderV2StartRecording, stopRecording as recorderV2StopRecording } from './recorder/index.ts';
import type { RecorderMode } from './recorder/protocol.ts';

type RecordingEmitter = (event: string, data: any) => void;

export async function startRecording(
  targetUrl: string,
  projectId: string,
  apiFilter: string | undefined,
  environment: string | undefined,
  pageId: string | undefined,
  caseId: string | undefined,
  suiteId: string | undefined,
  mode: RecorderMode | undefined,
  emit: RecordingEmitter,
) {
  if (environment) {
    console.log(`[Recorder] Environment: ${environment}`);
  }
  if (pageId) {
    console.log(`[Recorder] Page scope: ${pageId}`);
  }

  await recorderV2StartRecording(
    targetUrl,
    projectId,
    apiFilter,
    async (element: any) => {
      emit('element-recorded', { projectId, pageId, element, caseId, suiteId });
    },
    async (stepInfo: { action: string; element: any; dataValue: any }) => {
      emit('step-recorded', { projectId, stepInfo, type: 'UI', caseId, suiteId });
    },
    async (apiInfo: any) => {
      emit('api-recorded', { projectId, environment, pageId, apiInfo, caseId, suiteId });
    },
    (state) => {
      emit('recorder-state-changed', { state, caseId, suiteId });
    },
    mode,
  );
}

export async function stopRecording() {
  await recorderV2StopRecording();
}
