import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleRecordingControlMessage } from '../recording-control.ts';
import { SessionAbortedError } from '../recorder/ai-recording-session.ts';

vi.mock('../recorder/index.ts', () => ({
  startRecording: vi.fn(async () => {}),
  stopRecording: vi.fn(async () => {}),
}));

// Mock AIRecordingSession（vi.importActual 保留真实模块的 SessionAbortedError，
// 模块与测试共用同一个类，instanceof 判断成立）
const mockStart = vi.fn();
vi.mock('../recorder/ai-recording-session.ts', async () => {
  const actual = await vi.importActual<typeof import('../recorder/ai-recording-session.ts')>(
    '../recorder/ai-recording-session.ts',
  );
  return {
    ...actual,
    AIRecordingSession: vi.fn().mockImplementation(() => ({
      start: mockStart,
    })),
  };
});

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

    expect(await handled).toBe(true);
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

    // fake timers：立即推进 10s 超时，避免真实 sleep
    vi.useFakeTimers();
    try {
      const running = handleRecordingControlMessage(
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

      await vi.advanceTimersByTimeAsync(10_000);
      await running;
    } finally {
      vi.useRealTimers();
    }

    expect(deps.emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_PROVIDER_CONFIG_REQUEST', {
      runId: 'run-1',
      providerConfigId: 'pc-1',
    });
    // 超时以错误终态上报 COMPLETE，不启动 session
    expect(mockStart).not.toHaveBeenCalled();
    expect(deps.emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_COMPLETE', expect.objectContaining({
      runId: 'run-1',
      error: 'Provider config request timeout',
    }));
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

    // 验证发射了 AI_RECORDER_COMPLETE 事件（refinedSteps 为 Server ws-relay 契约字段）
    expect(emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_COMPLETE', expect.objectContaining({
      runId: 'run-1',
      result: {
        refinedSteps: [],
        stepBoundaries: [],
        replayCandidateSuite: {},
        replayReport: { runs: 3, passCount: 3, failCount: 0, verdict: 'pass' as const },
      },
      caseId: 'case-1',
      suiteId: 'suite-1',
    }));
  });

  it('reports refinedSteps (not raw steps) in AI_RECORDER_COMPLETE', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const emitRecordingEvent = vi.fn((event: string, data: any) => {
      emitted.push({ event, data });
    });
    const mockSteps = [{ id: 'refined-1' }];
    const mockBoundaries = [{ nlStepIndex: 0, startStepIdx: 0, endStepIdx: 1 }];
    const mockCandidateSuite = { name: 'candidate-suite' };
    mockStart.mockResolvedValue({
      steps: mockSteps,
      stepBoundaries: mockBoundaries,
      replayCandidateSuite: mockCandidateSuite,
    });

    // 模拟 provider config 响应
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_e: string, h: (d: any) => void) => { capturedHandler = h; }),
      offWsEvent: vi.fn(),
    };
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

    // COMPLETE 的 result 必须携带 refinedSteps（Server ws-relay 只持久化 refinedSteps）
    const complete = emitted.find((e) => e.event === 'AI_RECORDER_COMPLETE');
    expect(complete?.data.result.refinedSteps).toEqual(mockSteps);
    expect(complete?.data.result.stepBoundaries).toEqual(mockBoundaries);
    expect(complete?.data.result.replayCandidateSuite).toEqual(mockCandidateSuite);
    expect(complete?.data.result.steps).toBeUndefined();
  });

  it('AI_RECORDER_START: 将 startUrl 覆盖透传给 session.start', async () => {
    const mockProviderConfig = {
      id: 'pc-1',
      name: 'test-provider',
      type: 'openai-compatible' as const,
      apiKey: 'sk-test',
      model: 'gpt-4',
    };
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_event: string, handler: (data: any) => void) => {
        capturedHandler = handler;
      }),
      offWsEvent: vi.fn(),
    };
    const deps = makeDeps({ wsEvents });

    const handled = handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-su',
          projectId: 'p1',
          nlCase: { id: 'nl-1', title: 'Test', steps: [], testData: [], projectId: 'p1' },
          providerConfigId: 'pc-1',
          caseId: 'c1',
          suiteId: 's1',
          startUrl: 'https://override.com/home',
        },
      },
      deps,
    );

    if (capturedHandler) {
      capturedHandler({ runId: 'run-su', providerConfigId: 'pc-1', providerConfig: mockProviderConfig });
    }
    await handled;

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0][0].startUrl).toBe('https://override.com/home');
  });

  it('AI_RECORDER_START: Azure 下 model 覆盖同步 deployment（否则 UI 选型被无视）', async () => {
    const mockProviderConfig = {
      id: 'pc-1',
      name: 'azure-provider',
      type: 'azure-openai' as const,
      apiKey: 'sk-test',
      deployment: 'gpt-5.4-mini',
      model: 'gpt-5.4-mini',
    };
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_event: string, handler: (data: any) => void) => {
        capturedHandler = handler;
      }),
      offWsEvent: vi.fn(),
    };
    const deps = makeDeps({ wsEvents });

    const handled = handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-azure',
          projectId: 'p1',
          nlCase: { id: 'nl-1', title: 'Test', steps: [], testData: [], projectId: 'p1' },
          providerConfigId: 'pc-1',
          model: 'gpt-5.6-luna',
          caseId: 'c1',
          suiteId: 's1',
        },
      },
      deps,
    );

    if (capturedHandler) {
      capturedHandler({ runId: 'run-azure', providerConfigId: 'pc-1', providerConfig: mockProviderConfig });
    }
    await handled;

    expect(mockStart).toHaveBeenCalledTimes(1);
    const sessionParams = mockStart.mock.calls[0][0];
    expect(sessionParams.providerConfig.model).toBe('gpt-5.6-luna');
    expect(sessionParams.providerConfig.deployment).toBe('gpt-5.6-luna');
  });

  it('AI_RECORDER_START: 将 testData 提取的 secrets 传入 bridge 回调（live 步骤脱敏）', async () => {
    // session 运行中触发一次 consolidated step，让 onConsolidatedStep → bridge 链路被执行
    mockStart.mockImplementation(async (params: any) => {
      params.onConsolidatedStep?.({
        action: 'fill',
        locator: { kind: 'official', selector: 'internal:label="Password"' },
        locatorCandidates: [],
        value: 'pw-secret',
        pageUrl: 'https://app.com/login',
        timestamp: Date.now(),
      });
      return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
    });

    // 模拟 provider config 响应
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_e: string, h: (d: any) => void) => { capturedHandler = h; }),
      offWsEvent: vi.fn(),
    };
    const deps = makeDeps({ wsEvents });

    const promise = handleRecordingControlMessage(
      {
        event: 'AI_RECORDER_START',
        data: {
          runId: 'run-1',
          projectId: 'project-1',
          nlCase: {
            id: 'nl-1',
            title: 'Test',
            steps: [],
            projectId: 'project-1',
            testData: [
              { key: 'username', value: 'admin', description: 'login user' },
              { key: 'password', value: 'pw-secret', description: 'login password' },
            ],
          },
          providerConfigId: 'pc-1',
          options: { headless: true },
          caseId: 'case-1',
          suiteId: 'suite-1',
        },
      },
      deps,
    );

    if (capturedHandler) {
      capturedHandler({
        runId: 'run-1',
        providerConfigId: 'pc-1',
        providerConfig: { id: 'pc-1', name: 'test', type: 'openai-compatible', apiKey: 'k', model: 'm' },
      });
    }

    await promise;

    const { bridgeConsolidatedStep } = await import('../recorder/recording-bridge.ts');
    expect(bridgeConsolidatedStep).toHaveBeenCalled();
    const callbacks = (bridgeConsolidatedStep as any).mock.calls[0][4];
    expect(callbacks.secrets).toEqual(['pw-secret']);
  });

  it('AI_RECORDER_STOP: 仅触发中止与 takeover 回调清理，不复位状态（由 START finally 负责）', async () => {
    const deps = makeDeps();
    const handled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_STOP', data: { runId: 'run-1' } },
      deps,
    );

    expect(handled).toBe(true);
    expect(deps.resetAfterStop).not.toHaveBeenCalled();
  });

  it('reports an aborted COMPLETE and resets state once when STOP arrives mid-run', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const emitRecordingEvent = vi.fn((event: string, data: any) => {
      emitted.push({ event, data });
    });

    let releaseStart!: (reason?: any) => void;
    const sessionStarted = new Promise<void>((resolve) => {
      mockStart.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            releaseStart = reject;
            resolve();
          }),
      );
    });

    // 模拟 provider config 响应
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_e: string, h: (d: any) => void) => { capturedHandler = h; }),
      offWsEvent: vi.fn(),
    };
    const deps = makeDeps({ wsEvents, emitRecordingEvent });
    const resetAfterStop = deps.resetAfterStop;

    const running = handleRecordingControlMessage(
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

    // 触发 provider config 响应，让 START 推进到 session.start
    if (capturedHandler) {
      capturedHandler({
        runId: 'run-1',
        providerConfigId: 'pc-1',
        providerConfig: { id: 'pc-1', name: 'test', type: 'openai-compatible', apiKey: 'k', model: 'm' },
      });
    }
    await sessionStarted;

    // session 运行中收到 STOP：不得复位状态，等待 session 收尾
    const stopHandled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_STOP', data: { runId: 'run-1' } },
      deps,
    );
    expect(stopHandled).toBe(true);
    expect(resetAfterStop).not.toHaveBeenCalled();

    // 真实流程中 session 会因 abort 抛 SessionAbortedError；这里模拟其最终 reject
    releaseStart(new SessionAbortedError());
    await running;

    const complete = emitted.find((e) => e.event === 'AI_RECORDER_COMPLETE');
    expect(complete?.data.runId).toBe('run-1');
    expect(complete?.data.error).toMatch(/abort/i);
    expect(resetAfterStop).toHaveBeenCalledTimes(1); // 仅 START finally 复位一次
  });

  it('AI_RECORDER_STOP 在 provider-config 等待期间到达时中止，不启动 session', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const emitRecordingEvent = vi.fn((event: string, data: any) => {
      emitted.push({ event, data });
    });

    // wsEvents 捕获 handler：provider-config 响应由测试手动释放（deferred），
    // 避免等待真实 10s 超时
    let capturedHandler: ((data: any) => void) | null = null;
    const wsEvents = {
      onWsEvent: vi.fn().mockImplementation((_e: string, h: (d: any) => void) => { capturedHandler = h; }),
      offWsEvent: vi.fn(),
    };

    const deps = makeDeps({ wsEvents, emitRecordingEvent });
    const resetAfterStop = deps.resetAfterStop;

    const running = handleRecordingControlMessage(
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

    // START 现已挂起等待 provider-config 响应（deferred 未释放）
    expect(emitRecordingEvent).toHaveBeenCalledWith('AI_RECORDER_PROVIDER_CONFIG_REQUEST', {
      runId: 'run-1',
      providerConfigId: 'pc-1',
    });

    // provider-config 挂起期间收到 STOP：必须触发 abort（而非被丢弃）
    const stopHandled = await handleRecordingControlMessage(
      { event: 'AI_RECORDER_STOP', data: { runId: 'run-1' } },
      deps,
    );
    expect(stopHandled).toBe(true);

    // 释放 deferred 响应，让 fetch 窗口结束
    capturedHandler!({
      runId: 'run-1',
      providerConfigId: 'pc-1',
      providerConfig: { id: 'pc-1', name: 'test', type: 'openai-compatible', apiKey: 'k', model: 'm' },
    });

    await running;

    const complete = emitted.find((e) => e.event === 'AI_RECORDER_COMPLETE');
    expect(complete?.data.runId).toBe('run-1');
    expect(complete?.data.error).toBe('Recording aborted by user');
    expect(mockStart).not.toHaveBeenCalled();
    expect(resetAfterStop).toHaveBeenCalledTimes(1); // 仅 START finally 复位一次
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