import { describe, expect, it, vi } from 'vitest';
import { handleRecordingControlMessage } from '../recording-control.ts';

vi.mock('../recorder/index.ts', () => ({
  startRecording: vi.fn(async () => {}),
  stopRecording: vi.fn(async () => {}),
}));

describe('handleRecordingControlMessage', () => {
  it('starts the recording session when recording start arrives', async () => {
    const sendMsg = vi.fn();
    const emitRecordingEvent = vi.fn();
    const setAgentStatus = vi.fn();
    const setIsRecordingActive = vi.fn();
    const { startRecording } = await import('../recorder/index.ts');

    const handled = await handleRecordingControlMessage(
      {
        event: 'RECORDING_START',
        data: {
          targetUrl: 'http://localhost:3000/aut/login',
          projectId: 'project-1',
          apiFilter: '*api*',
          environment: 'dev',
          pageId: 'page-1',
          caseId: 'case-1',
          suiteId: 'suite-1',
          mode: 'ui',
        },
      },
      {
        agentId: 'agent-1',
        logger: console,
        sendMsg,
        emitRecordingEvent,
        resetAfterStop: vi.fn(),
        setAgentStatus,
        setIsRecordingActive,
      },
    );

    expect(handled).toBe(true);
    expect(setIsRecordingActive).toHaveBeenNthCalledWith(1, true);
    expect(setAgentStatus).toHaveBeenCalledWith('busy');
    expect(sendMsg).toHaveBeenCalledWith('AGENT_HEARTBEAT', { agentId: 'agent-1', status: 'busy' });
    expect(startRecording).toHaveBeenCalledWith(
      'http://localhost:3000/aut/login',
      'project-1',
      '*api*',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      'ui',
    );
    expect(sendMsg).not.toHaveBeenCalledWith('AGENT_HEARTBEAT', expect.objectContaining({ status: 'idle' }));
  });
});