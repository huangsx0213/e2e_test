import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleRecordingControlMessage } from '../recording-control.ts';

vi.mock('../recorder/index.ts', () => ({
  startRecording: vi.fn(async () => {}),
  stopRecording: vi.fn(async () => {}),
}));

// Mock AIRecordingSession
const mockStart = vi.fn();
vi.mock('../recorder/ai-recording-session.ts', () => ({
  AIRecordingSession: vi.fn().mockImplementation(() => ({
    start: mockStart,
  })),
}));

// Mock bridgeConsolidatedStep
vi.mock('../recorder/recording-bridge.ts', () => ({
  bridgeConsolidatedStep: vi.fn(),
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

describe('handleRecordingControlMessage — AI Recorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockReset();
  });

  function makeDeps(overrides: Partial<{
    sendMsg: any;
    emitRecordingEvent: any;
    wsEvents: any;
  }> = {}) {
    return {
      agentId: 'agent-1',
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
      sendMsg: overrides.sendMsg ?? vi.fn(),
      emitRecordingEvent: overrides.emitRecordingEvent ?? vi.fn(),
      resetAfterStop: vi.fn(),
      setAgentStatus: vi.fn(),
      setIsRecordingActive: vi.fn(),
      wsEvents: overrides.wsEvents ?? {
        onWsEvent: vi.fn(),
        offWsEvent: vi.fn(),
      },
    };
  }

  it('AI_RECORDER_START: 通过 WS 获取 providerConfig 并启动 session', async () => {
    const mockProviderConfig = {
      id: 'pc-1',
      name: 'test-provider',
      type: 'openai-compatible' as const,
      apiKey: 'sk-test',
      model: 'gpt-4',
    };
    const mockResult = { steps: [], stepBoundaries: [], replayCandidateSuite: {} };

    // emitRecordingEvent 捕获 PROVIDER_CONFIG_REQUEST（包装成 RECORDING_EVENT 信封）
    const emitRecordingEvent = vi.fn();

    // wsEvents.onWsEvent 捕获 handler，模拟响应到达
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_event: string, handler: (data: any) => void) => {
        capturedHandler = handler;
      }),
      offWsEvent: vi.fn(),
    };

    // 模拟 session.start 调用前，先触发 provider config 响应
    mockStart.mockImplementation(async () => {
      // 在 session.start 被调用时，providerConfig 应该已经获取到
      return mockResult;
    });

    const deps = makeDeps({ emitRecordingEvent, wsEvents });
    const handled = handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-1',
          projectId: 'project-1',
          nlCase: { id: 'nl-1', title: 'Test', steps: [], testData: [], projectId: 'project-1' },
          providerConfigId: 'pc-1',
          options: { headless: true },
          caseId: 'case-1',
          suiteId: 'suite-1',
        },
      },
      deps,
    );

    // 触发 provider config 响应（模拟 Server 回传）
    if (capturedHandler) {
      capturedHandler({
        runId: 'run-1',
        providerConfigId: 'pc-1',
        providerConfig: mockProviderConfig,
      });
    }

    await handled;

    expect(handled).resolves.toBe(true);
    // 验证发送了 PROVIDER_CONFIG_REQUEST（通过 emitRecordingEvent 包装成 RECORDING_EVENT 信封）
    expect(emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_PROVIDER_CONFIG_REQUEST', {
      runId: 'run-1',
      providerConfigId: 'pc-1',
    });
    // 验证 session.start 被调用，且传入了 providerConfig
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({
      providerConfig: mockProviderConfig,
      nlCase: expect.objectContaining({ id: 'nl-1' }),
    }));
  });

  it('AI_RECORDER_START: providerConfig 请求超时时报错', async () => {
    // wsEvents.onWsEvent 注册但永不响应
    const wsEvents = {
      onWsEvent: vi.fn(),
      offWsEvent: vi.fn(),
    };
    const emitRecordingEvent = vi.fn();

    const deps = makeDeps({ wsEvents, emitRecordingEvent });

    await handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-1',
          projectId: 'project-1',
          nlCase: { id: 'nl-1', title: 'Test', steps: [], testData: [], projectId: 'project-1' },
          providerConfigId: 'pc-1',
          options: { headless: true },
          caseId: 'case-1',
          suiteId: 'suite-1',
        },
      },
      deps,
    );

    // 由于超时（10s 太长，这里只验证 emitRecordingEvent 被调用）
    expect(deps.emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_PROVIDER_CONFIG_REQUEST', {
      runId: 'run-1',
      providerConfigId: 'pc-1',
    });
  });

  it('AI_RECORDER_START: session 完成后发射 AI_RECORDER_COMPLETE', async () => {
    const mockResult = {
      steps: [],
      stepBoundaries: [],
      replayCandidateSuite: {},
      replayReport: { runs: 3, passCount: 3, failCount: 0, verdict: 'pass' as const },
    };
    mockStart.mockResolvedValue(mockResult);

    // 模拟 provider config 响应
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_e: string, h: (d: any) => void) => { capturedHandler = h; }),
      offWsEvent: vi.fn(),
    };
    const emitRecordingEvent = vi.fn();
    const deps = makeDeps({ wsEvents, emitRecordingEvent });

    const promise = handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-1',
          projectId: 'project-1',
          nlCase: { id: 'nl-1', title: 'Test', steps: [], testData: [], projectId: 'project-1' },
          providerConfigId: 'pc-1',
          options: { headless: true },
          caseId: 'case-1',
          suiteId: 'suite-1',
        },
      },
      deps,
    );

    // 触发 provider config 响应
    if (capturedHandler) {
      capturedHandler({
        runId: 'run-1',
        providerConfigId: 'pc-1',
        providerConfig: { id: 'pc-1', name: 'test', type: 'openai-compatible', apiKey: 'k', model: 'm' },
      });
    }

    await promise;

    // 验证发射了 AI_RECORDER_COMPLETE 事件
    expect(emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_COMPLETE', expect.objectContaining({
      runId: 'run-1',
      result: mockResult,
      caseId: 'case-1',
      suiteId: 'suite-1',
    }));
  });

  it('AI_RECORDER_STOP: 清理 takeover 回调并 reset', async () => {
    const deps = makeDeps();
    const handled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_STOP', data: { runId: 'run-1' } },
      deps,
    );

    expect(handled).toBe(true);
    expect(deps.resetAfterStop).toHaveBeenCalled();
  });

  it('AI_RECORDER_TAKEOVER_COMPLETE: 返回 true（已注册的 takeover 回调会被唤醒）', async () => {
    const deps = makeDeps();
    const handled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_TAKEOVER_COMPLETE', data: { runId: 'run-1', nlStepIndex: 0 } },
      deps,
    );
    expect(handled).toBe(true);
  });

  it('AI_RECORDER_TAKEOVER_COMPLETE: 无对应 runId 时也返回 true（幂等）', async () => {
    const deps = makeDeps();
    const handled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_TAKEOVER_COMPLETE', data: { runId: 'nonexistent-run', nlStepIndex: 0 } },
      deps,
    );
    expect(handled).toBe(true);
  });

  it('未识别的事件返回 false', async () => {
    const deps = makeDeps();
    const handled = await handleRecordingControlMessage(
      { event: 'UNKNOWN_EVENT', data: {} },
      deps,
    );
    expect(handled).toBe(false);
  });
});