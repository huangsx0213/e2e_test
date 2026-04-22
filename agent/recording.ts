import { startRecording as engineStartRecording, stopRecording as engineStopRecording } from '../server/modules/recording/engine.ts';

type RecordingEmitter = (event: string, data: any) => void;

export async function startRecording(
  targetUrl: string,
  projectId: string,
  apiFilter: string | undefined,
  environment: string | undefined,
  pageId: string | undefined,
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
      emit('element-recorded', { projectId, pageId, element });
    },
    async (stepInfo: { action: string; element: any; dataValue: any }) => {
      emit('step-recorded', { projectId, stepInfo, type: 'UI' });
    },
    async (apiInfo: any) => {
      emit('api-recorded', { projectId, environment, pageId, apiInfo });
    },
    (state) => {
      emit('recorder-state-changed', { state });
    },
  );
}

export async function stopRecording() {
  await engineStopRecording();
}
