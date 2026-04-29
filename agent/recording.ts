import { startRecording as engineStartRecording, stopRecording as engineStopRecording } from './engine.ts';

type RecordingEmitter = (event: string, data: any) => void;

export async function startRecording(
  targetUrl: string,
  projectId: string,
  apiFilter: string | undefined,
  environment: string | undefined,
  pageId: string | undefined,
  caseId: string | undefined,
  suiteId: string | undefined,
  emit: RecordingEmitter,
) {
  if (environment) {
    console.log(`[Recorder] Environment: ${environment}`);
  }
  if (pageId) {
    console.log(`[Recorder] Page scope: ${pageId}`);
  }

  await engineStartRecording(
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
  );
}

export async function stopRecording() {
  await engineStopRecording();
}
