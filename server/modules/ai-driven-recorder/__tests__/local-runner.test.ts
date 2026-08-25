import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// === Mocks ===

// Mock AIRecordingSession（vi.importActual 保留真实模块的 SessionAbortedError，
// 模块与被测代码共用同一个类，instanceof 判断成立）
const mockStart = vi.fn();
vi.mock('../../../../agent/recorder/ai-recording-session.ts', async () => {
  const actual = await vi.importActual<typeof import('../../../../agent/recorder/ai-recording-session.ts')>(
    '../../../../agent/recorder/ai-recording-session.ts',
  );
  return {
    ...actual,
    AIRecordingSession: vi.fn().mockImplementation(() => ({
      start: mockStart,
    })),
  };
});

// finalize-run 的持久化依赖不触真实 DB
vi.mock('../../suites/repository.ts', () => ({
  saveSuite: vi.fn(),
}));

vi.mock('../../nl-cases/repository.ts', () => ({
  nlCaseRepo: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('../draft-suite-saver.ts', () => ({
  saveDraftSuite: vi.fn(),
}));

import { LocalRecordingRunner } from '../local-runner.ts';
import { SessionAbortedError } from '../../../../agent/recorder/ai-recording-session.ts';
import { getLocalRunHandle, unregisterLocalRun } from '../run-registry.ts';
import { ConflictError } from '../../../shared/http/errors.ts';

// === Helpers ===

function makeMockRepo() {
  return {
    createRun: vi.fn(() => 'run-mock-id'),
    getRun: vi.fn(),
    getRunsByProject: vi.fn(() => []),
    updateRunStatus: vi.fn(),
    updateRunResult: vi.fn(),
    updateRunProgress: vi.fn(),
    deleteRun: vi.fn(),
    getDecryptedProviderConfig: vi.fn(),
    insertStepLog: vi.fn(),
    getStepLogs: vi.fn(() => []),
  };
}

function makeNlCase() {
  return {
    id: 'nl-1',
    projectId: 'proj-1',
    title: 'Login Test',
    status: 'APPROVED' as const,
    preconditions: [],
    testData: [
      { key: 'username', value: 'admin', description: 'login user' },
      { key: 'password', value: 'pw-secret', description: 'login password' },
    ],
    steps: [{ sequence: 1, action: 'open login page', expected: 'page loaded' }],
    postconditions: [],
    tags: [],
    changeLog: [],
  };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'r1',
    projectId: 'proj-1',
    nlCase: makeNlCase() as any,
    providerConfig: {
      id: 'pc-1',
      name: 'azure',
      type: 'azure-openai' as const,
      apiKey: 'sk-test',
      model: 'gpt-4',
    },
    options: {},
    caseId: 'c1',
    suiteId: 's1',
    ...overrides,
  };
}

function makeFillStep() {
  return {
    action: 'fill',
    locator: { kind: 'official' as const, selector: 'internal:label="Password"' },
    locatorCandidates: [],
    value: 'pw-secret',
    pageUrl: 'https://app.com/login',
    timestamp: Date.now(),
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    sseGateway: { emit: vi.fn() },
    repository: makeMockRepo(),
    recordingBridge: {
      handleStepRecorded: vi.fn(),
      handleElementRecorded: vi.fn(),
    },
    ...overrides,
  };
}

/** 等待 run 收尾（registry 句柄被注销 = execute finally 已执行） */
async function waitSettled(runId: string) {
  await vi.waitFor(() => expect(getLocalRunHandle(runId)).toBeUndefined());
}

describe('LocalRecordingRunner', () => {
  let deps: ReturnType<typeof makeDeps>;
  let runner: LocalRecordingRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockReset();
    deps = makeDeps();
    runner = new LocalRecordingRunner(deps as any);
  });

  afterEach(() => {
    // 防御：用例失败遗留的注册句柄不影响后续用例
    unregisterLocalRun('r1');
    unregisterLocalRun('r2');
    delete process.env.AI_RECORDER_MAX_LOCAL_RUNS;
  });

  describe('capacity', () => {
    it('单槽位：start 占用期间再次 start 抛 ConflictError，session 结束后释放槽位', async () => {
      let release!: (value: unknown) => void;
      mockStart.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );

      runner.start(makeParams());
      // 注册句柄已就位，槽位被占用
      expect(getLocalRunHandle('r1')).toBeDefined();

      expect(() => runner.start(makeParams({ runId: 'r2' }))).toThrow(ConflictError);
      expect(() => runner.start(makeParams({ runId: 'r2' }))).toThrow(
        'Local recorder is busy: concurrent local run limit reached',
      );

      release({ steps: [], stepBoundaries: [], replayCandidateSuite: {} });
      await waitSettled('r1');

      // 槽位已释放：新 run 可以启动
      mockStart.mockResolvedValue({ steps: [], stepBoundaries: [], replayCandidateSuite: {} });
      expect(() => runner.start(makeParams({ runId: 'r2' }))).not.toThrow();
      await waitSettled('r2');
    });

    it('env AI_RECORDER_MAX_LOCAL_RUNS 覆盖构造参数；非法值回退；结果 clamp >= 1', () => {
      const prev = process.env.AI_RECORDER_MAX_LOCAL_RUNS;
      try {
        const minimal = { sseGateway: {} as any, repository: {} as any };

        process.env.AI_RECORDER_MAX_LOCAL_RUNS = '3';
        expect(new LocalRecordingRunner({ ...minimal, maxConcurrentRuns: 1 }).capacity()).toBe(3);

        process.env.AI_RECORDER_MAX_LOCAL_RUNS = '0';
        expect(new LocalRecordingRunner({ ...minimal, maxConcurrentRuns: 5 }).capacity()).toBe(1);

        process.env.AI_RECORDER_MAX_LOCAL_RUNS = 'garbage';
        expect(new LocalRecordingRunner({ ...minimal, maxConcurrentRuns: 2 }).capacity()).toBe(2);

        delete process.env.AI_RECORDER_MAX_LOCAL_RUNS;
        expect(new LocalRecordingRunner({ ...minimal, maxConcurrentRuns: 2 }).capacity()).toBe(2);
        expect(new LocalRecordingRunner(minimal).capacity()).toBe(1);
      } finally {
        if (prev === undefined) delete process.env.AI_RECORDER_MAX_LOCAL_RUNS;
        else process.env.AI_RECORDER_MAX_LOCAL_RUNS = prev;
      }
    });
  });

  describe('execute — 事件桥接', () => {
    it('onEvent 注入 runId/caseId/suiteId；onConsolidatedStep 经 bridge 到 recordingBridge.handleStepRecorded', async () => {
      let captured: any;
      mockStart.mockImplementation(async (params: any) => {
        captured = params;
        params.onEvent('step:start', { nlStepIndex: 0 });
        params.onConsolidatedStep(makeFillStep());
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });

      runner.start(makeParams());
      await waitSettled('r1');

      // 进度事件附带 ids（与 agent 路径 onEvent 行为一致）
      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'step:start', {
        nlStepIndex: 0,
        runId: 'r1',
        caseId: 'c1',
        suiteId: 's1',
      });

      // live step 经真实 bridgeConsolidatedStep → RecordingService 同构 payload
      expect(deps.recordingBridge.handleStepRecorded).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          type: 'UI',
          caseId: 'c1',
          suiteId: 's1',
        }),
      );
      // session 收到 AbortSignal（abort 经 registry 句柄路由到该 signal）
      expect(captured.signal).toBeInstanceOf(AbortSignal);
    });

    it('startUrl 覆盖透传到 session.start', async () => {
      let captured: any;
      mockStart.mockImplementation(async (params: any) => {
        captured = params;
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });

      runner.start(makeParams({ startUrl: 'https://override.com/home' }));
      await waitSettled('r1');

      expect(captured.startUrl).toBe('https://override.com/home');
    });

    it('未提供 recordingBridge 时回退到 sseGateway 发射 step-recorded / element-recorded', async () => {
      deps = makeDeps({ recordingBridge: undefined });
      runner = new LocalRecordingRunner(deps as any);

      mockStart.mockImplementation(async (params: any) => {
        params.onConsolidatedStep(makeFillStep());
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });

      runner.start(makeParams());
      await waitSettled('r1');

      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'step-recorded', expect.anything());
      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'element-recorded', expect.anything());
    });
  });

  describe('completion / failure 终态', () => {
    it('成功：finalizeRunCompletion 标记 completed 并广播 run:complete', async () => {
      deps.repository.getRun.mockReturnValue({
        id: 'r1',
        project_id: 'proj-1',
        nl_case_id: 'nl-1',
        status: 'running',
        execution_mode: 'local',
        started_at: new Date().toISOString(),
        result_suite_id: null,
        result_case_id: null,
      });

      mockStart.mockResolvedValue({
        steps: [{ id: 'refined' }],
        stepBoundaries: [],
        replayCandidateSuite: {},
      });

      runner.start(makeParams());
      await waitSettled('r1');

      expect(deps.repository.updateRunStatus).toHaveBeenCalledWith('r1', 'completed');
      expect(deps.sseGateway.emit).toHaveBeenCalledWith(
        'r1',
        'run:complete',
        expect.objectContaining({ runId: 'r1', suiteId: 's1', caseId: 'c1' }),
      );
    });

    it('SessionAbortedError：标记 failed("Recording aborted by user") + run:error，无错误日志', async () => {
      deps.repository.getRun.mockReturnValue({ id: 'r1', project_id: 'proj-1', status: 'running' });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockStart.mockRejectedValue(new SessionAbortedError());

      runner.start(makeParams());
      await waitSettled('r1');
      errorSpy.mockRestore();

      expect(deps.repository.updateRunStatus).toHaveBeenCalledWith(
        'r1',
        'failed',
        'Recording aborted by user',
      );
      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'run:error', {
        runId: 'r1',
        error: 'Recording aborted by user',
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('普通错误：以 message 终态化并广播 run:error', async () => {
      deps.repository.getRun.mockReturnValue({ id: 'r1', project_id: 'proj-1', status: 'running' });
      mockStart.mockRejectedValue(new Error('stagehand init failed'));

      runner.start(makeParams());
      await waitSettled('r1');

      expect(deps.repository.updateRunStatus).toHaveBeenCalledWith(
        'r1',
        'failed',
        'stagehand init failed',
      );
      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'run:error', {
        runId: 'r1',
        error: 'stagehand init failed',
      });
    });

    it('已删除的 run：收尾时零写入零广播', async () => {
      deps.repository.getRun.mockReturnValue(undefined); // finalize 时 run 已被删除

      mockStart.mockResolvedValue({
        steps: [{ id: 'refined' }],
        stepBoundaries: [],
        replayCandidateSuite: {},
      });

      runner.start(makeParams());
      await waitSettled('r1');

      expect(deps.repository.updateRunStatus).not.toHaveBeenCalled();
      expect(deps.repository.updateRunResult).not.toHaveBeenCalled();
      expect(deps.sseGateway.emit).not.toHaveBeenCalled();
    });

    it('畸形 testData 使 extractSecretValues 抛错：槽位与注册句柄仍释放，run 标记 failed', async () => {
      deps.repository.getRun.mockReturnValue({ id: 'r1', project_id: 'proj-1', status: 'running' });
      const malformed = { ...makeNlCase(), testData: [null] } as any;

      expect(() => runner.start(makeParams({ nlCase: malformed }))).not.toThrow();
      await waitSettled('r1');

      // 失败发生在 session 启动之前（secrets 提取处）
      expect(mockStart).not.toHaveBeenCalled();
      // 注册句柄已注销
      expect(getLocalRunHandle('r1')).toBeUndefined();
      // finalizeRunFailure 标记 failed + run:error
      expect(deps.repository.updateRunStatus).toHaveBeenCalledWith(
        'r1',
        'failed',
        expect.any(String),
      );
      expect(deps.sseGateway.emit).toHaveBeenCalledWith('r1', 'run:error', {
        runId: 'r1',
        error: expect.any(String),
      });

      // 槽位未泄漏：后续 start 正常占用并完成
      mockStart.mockResolvedValue({ steps: [], stepBoundaries: [], replayCandidateSuite: {} });
      expect(() => runner.start(makeParams({ runId: 'r2' }))).not.toThrow();
      await waitSettled('r2');
    });
  });

  describe('execute — headless 兜底（spec §6）', () => {
    it('调用方省略 headless 时 session 收到 true；显式 false/true 原样透传', async () => {
      const capturedOptions: any[] = [];
      mockStart.mockImplementation(async (params: any) => {
        capturedOptions.push(params.options);
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });

      runner.start(makeParams()); // options = {}
      await waitSettled('r1');

      runner.start(makeParams({ runId: 'r1', options: { headless: false } }));
      await waitSettled('r1');

      runner.start(makeParams({ runId: 'r1', options: { headless: true } }));
      await waitSettled('r1');

      expect(capturedOptions).toEqual([
        { headless: true },
        { headless: false },
        { headless: true },
      ]);
    });
  });

  describe('takeover', () => {
    it('注册句柄 resolveTakeover(true) 唤醒等待；超时（takeoverTimeoutMs）解析 false', async () => {
      let captured: any;
      let releaseSession!: () => void;
      const sessionDone = new Promise<void>((resolve) => {
        releaseSession = resolve;
      });
      mockStart.mockImplementation(async (params: any) => {
        captured = params;
        await sessionDone;
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });

      runner.start(makeParams());

      // 路径 A：TAKEOVER_COMPLETE 经 registry 句柄解析 true
      const takeoverA = captured.onTakeoverRequest(0, 'please take over');
      getLocalRunHandle('r1')!.resolveTakeover(true);
      await expect(takeoverA).resolves.toBe(true);

      // 路径 B：无人接管时按 takeoverTimeoutMs 快速超时为 false
      const timed = new LocalRecordingRunner({
        sseGateway: { emit: vi.fn() },
        repository: makeMockRepo(),
        recordingBridge: { handleStepRecorded: vi.fn(), handleElementRecorded: vi.fn() },
        takeoverTimeoutMs: 20,
      } as any);
      let capturedTimed: any;
      mockStart.mockImplementation(async (params: any) => {
        capturedTimed = params;
        await new Promise((r) => setTimeout(r, 50));
        return { steps: [], stepBoundaries: [], replayCandidateSuite: {} };
      });
      timed.start(makeParams({ runId: 'r2' }));
      const takeoverB = capturedTimed.onTakeoverRequest(1, 'please take over');
      await expect(takeoverB).resolves.toBe(false);

      releaseSession();
      await waitSettled('r1');
      await waitSettled('r2');
    });

    it('abort()：挂起的 takeover 等待立即解析 false（delete-during-takeover 不再阻塞到超时）', async () => {
      let captured: any;
      let releaseSession!: () => void;
      const sessionDone = new Promise<void>((resolve) => {
        releaseSession = resolve;
      });
      deps.repository.getRun.mockReturnValue({ id: 'r1', project_id: 'proj-1', status: 'running' });
      mockStart.mockImplementation(async (params: any) => {
        captured = params;
        await sessionDone;
        throw new SessionAbortedError();
      });

      runner.start(makeParams());
      const takeoverPromise = captured.onTakeoverRequest(0, 'please take over');

      // deleteRun 路径：registry 句柄 abort
      getLocalRunHandle('r1')!.abort();
      await expect(takeoverPromise).resolves.toBe(false);

      // 会话随后按 aborted 终态收尾，槽位/句柄正常释放
      releaseSession();
      await waitSettled('r1');
      expect(deps.repository.updateRunStatus).toHaveBeenCalledWith(
        'r1',
        'failed',
        'Recording aborted by user',
      );
    });
  });
});
