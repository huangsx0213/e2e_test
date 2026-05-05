import { describe, expect, it, vi } from 'vitest';
import { handleRecordingControlMessage } from '../recording-control.ts';

vi.mock('../recorder/index.ts', () => ({
  startRecording: vi.fn(async (
    _targetUrl: string,
    _projectId: string,
    _apiFilter: string | undefined,
    onElementRecorded: (element: any) => Promise<void>,
    onStepRecorded: (stepInfo: any) => Promise<void>,
    onApiRecorded: (apiInfo: any) => Promise<void>,
    onRecorderStateChanged: (state: any) => void,
  ) => {
    await onElementRecorded({ id: 'el-1' });
    await onStepRecorded({ action: 'click', element: { name: 'Button' }, dataValue: '' });
    await onApiRecorded({ url: 'https://example.test/api', method: 'GET' });
    onRecorderStateChanged({ isPaused: false, started: true, mode: 'ui', action: 'START' });
  }),
  stopRecording: vi.fn(async () => {}),
}));

describe('agent recording event routing', () => {
  it('emits inner recording event names that server handlers expect', async () => {
    const emitRecordingEvent = vi.fn();
    const resetAfterStop = vi.fn();

    await handleRecordingControlMessage(
      {
        event: 'RECORDING_START',
        data: {
          targetUrl: 'http://localhost:3000/aut/login',
          projectId: 'project-1',
          apiFilter: '*api*',
          environment: 'DEV',
          caseId: 'case-1',
          suiteId: 'suite-1',
          mode: 'ui',
        },
      },
      {
        agentId: 'agent-1',
        logger: console,
        sendMsg: vi.fn(),
        emitRecordingEvent,
        resetAfterStop,
        setAgentStatus: vi.fn(),
        setIsRecordingActive: vi.fn(),
      },
    );

    expect(emitRecordingEvent).toHaveBeenCalledWith('element-recorded', {
      projectId: 'project-1',
      element: { id: 'el-1' },
      caseId: 'case-1',
      suiteId: 'suite-1',
    });
    expect(emitRecordingEvent).toHaveBeenCalledWith('step-recorded', {
      projectId: 'project-1',
      stepInfo: { action: 'click', element: { name: 'Button' }, dataValue: '' },
      type: 'UI',
      caseId: 'case-1',
      suiteId: 'suite-1',
    });
    expect(emitRecordingEvent).toHaveBeenCalledWith('api-recorded', {
      projectId: 'project-1',
      environment: 'DEV',
      apiInfo: { url: 'https://example.test/api', method: 'GET' },
      caseId: 'case-1',
      suiteId: 'suite-1',
    });
    expect(emitRecordingEvent).toHaveBeenCalledWith('recorder-state-changed', {
      state: { isPaused: false, started: true, mode: 'ui', action: 'START' },
      caseId: 'case-1',
      suiteId: 'suite-1',
    });
  });
});