/**
 * AIRecordingSession 单元测试
 *
 * 测试编排逻辑：mock Stagehand 和 PlaywrightRecorderAdapter，
 * 验证 NL 步骤迭代、事件发射、lazy observe、takeover、AutoReplay 注入。
 *
 * 不测试真实浏览器交互（那需要 stagehand-recorder-poc.test.ts 风格的集成测试）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NlTestCase, NlTestCaseStep } from '../../../shared/contracts/index.ts';
import type { RecorderStepPayload } from '../protocol.ts';

// === Mock Stagehand ===
// vi.hoisted 确保 mock 对象在 vi.mock 工厂执行时可用
const { mockStagehand, mockPage, mockCdpBrowser, mockCdpContext } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockResolvedValue('https://app.com/home'),
  };
  const mockCdpContext = { _enableRecorder: vi.fn() };
  const mockCdpBrowser = {
    contexts: vi.fn(() => [mockCdpContext]),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockStagehand = {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    context: { pages: () => [mockPage] },
    connectURL: vi.fn().mockReturnValue('ws://localhost:9222'),
    act: vi.fn().mockResolvedValue({ actions: [] }),
    extract: vi.fn().mockResolvedValue({ data: { success: true, assertions: [] } }),
    observe: vi.fn().mockResolvedValue([]),
  };
  return { mockStagehand, mockPage, mockCdpBrowser, mockCdpContext };
});

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn(() => mockStagehand),
}));

vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockResolvedValue(mockCdpBrowser),
    executablePath: vi.fn().mockReturnValue('/path/to/chromium'),
  },
}));

// === Mock PlaywrightRecorderAdapter ===
// 默认 isAvailable=false（测试 fallback 路径），个别测试可覆盖
let capturedOnActionAdded: ((page: any, aic: any) => void) | null = null;

vi.mock('../adapter', () => ({
  PlaywrightRecorderAdapter: vi.fn().mockImplementation((params: any) => {
    capturedOnActionAdded = params.onActionAdded;
    return { start: vi.fn(), stop: vi.fn() };
  }),
}));

// 导入被测模块（在 mock 之后）
import { AIRecordingSession } from '../ai-recording-session.ts';
import { PlaywrightRecorderAdapter } from '../adapter.ts';

// === 测试数据 ===

function makeNlCase(overrides?: Partial<NlTestCase>): NlTestCase {
  return {
    id: 'nl-1',
    projectId: 'proj-1',
    title: 'Login flow',
    preconditions: ['https://app.com/login'],
    testData: [
      { key: 'username', value: 'admin', description: 'Login username' },
      { key: 'password', value: 'secret123', description: 'Login password' },
    ],
    steps: [
      { sequence: 1, action: 'Enter username "admin" in the username field', expected: '' },
      { sequence: 2, action: 'Enter password "secret123" in the password field', expected: '' },
      { sequence: 3, action: 'Click the Submit button', expected: 'User is logged in' },
    ],
    postconditions: [],
    tags: [],
    changeLog: [],
    status: 'APPROVED',
    priority: 'high',
    ...overrides,
  };
}

function makeProviderConfig() {
  return {
    id: 'prov-1',
    name: 'test-provider',
    type: 'openai-compatible' as const,
    endpoint: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    model: 'gpt-4o',
  };
}

function makeMockActionInContext(actionName: string = 'click', selector: string = 'internal:role=button[name="Submit"]') {
  return {
    frame: { pageGuid: 'p1', pageAlias: 'page', framePath: [] },
    action: {
      name: actionName,
      selector,
      clickCount: 1,
      button: 'left',
      modifiers: 0,
      signals: [],
      ariaSnapshot: '<button>Submit</button>',
    },
    startTime: Date.now(),
  };
}



// === 重置 mock ===

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnActionAdded = null;
  mockStagehand.act.mockResolvedValue({ actions: [] });
  mockStagehand.extract.mockResolvedValue({ data: { success: true, assertions: [] } });
  mockStagehand.observe.mockResolvedValue([]);
  mockPage.goto.mockResolvedValue(undefined);
  mockPage.waitForLoadState.mockResolvedValue(undefined);
  // 默认 _enableRecorder 不可用
  (PlaywrightRecorderAdapter as any).isAvailable = vi.fn(() => false);
});

describe('AIRecordingSession', () => {
  describe('start() — 基本编排', () => {
    it('迭代所有 NL 步骤并发射 step:start / step:complete 事件', async () => {
      const nlCase = makeNlCase();
      const onConsolidatedStep = vi.fn();
      const events: Array<{ event: string; data: any }> = [];
      const onEvent = vi.fn((event: string, data: any) => events.push({ event, data }));

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      // 3 个 NL 步骤，每个发射 step:start + step:complete
      const startEvents = events.filter((e) => e.event === 'step:start');
      const completeEvents = events.filter((e) => e.event === 'step:complete');
      expect(startEvents).toHaveLength(3);
      expect(completeEvents).toHaveLength(3);

      // 验证步骤索引
      expect(startEvents.map((e) => e.data.nlStepIndex)).toEqual([0, 1, 2]);

      // act 被调用 3 次（每个 NL 步骤一次）
      expect(mockStagehand.act).toHaveBeenCalledTimes(3);
    });

    it('导航到 preconditions 中的起始 URL', async () => {
      const nlCase = makeNlCase();
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://app.com/login', { waitUntil: 'load' });
    });

    it('preconditions 中的 URL 与说明文字同行时仍能解析', async () => {
      const nlCase = makeNlCase({
        preconditions: ['打开浏览器并访问 https://app.com/login，使用测试账号登录'],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://app.com/login', { waitUntil: 'load' });
    });

    it('preconditions 中 URL 紧跟中文标点时剥离标点后解析', async () => {
      const nlCase = makeNlCase({
        preconditions: ['先访问 https://app.com/login。'],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://app.com/login', { waitUntil: 'load' });
    });

    it('RecordingResult 包含正确的 stepBoundaries', async () => {
      const nlCase = makeNlCase();
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      const session = new AIRecordingSession();
      const result = await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      expect(result.stepBoundaries).toHaveLength(3);
      expect(result.stepBoundaries.map((b) => b.nlStepIndex)).toEqual([0, 1, 2]);
    });

    it('Stagehand 关闭在 finally 中执行（即使出错）', async () => {
      const nlCase = makeNlCase();
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      // 模拟 goto 失败
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      const session = new AIRecordingSession();
      await expect(
        session.start({
          nlCase,
          providerConfig: makeProviderConfig(),
          options: { headless: true },
          onConsolidatedStep,
          onEvent,
        }),
      ).rejects.toThrow('Navigation failed');

      expect(mockStagehand.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('start() — 步骤捕获（_enableRecorder 可用）', () => {
    it('onConsolidatedStep 在 _enableRecorder 捕获步骤时被调用', async () => {
      const nlCase = makeNlCase({ steps: [{ sequence: 1, action: 'Click Submit', expected: '' }] });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      // _enableRecorder 可用
      (PlaywrightRecorderAdapter as any).isAvailable = vi.fn(() => true);

      // act() 模拟 _enableRecorder 捕获行为：调用 capturedOnActionAdded
      mockStagehand.act.mockImplementation(async (_instruction: string, opts: any) => {
        if (capturedOnActionAdded) {
          capturedOnActionAdded(
            opts.page,
            makeMockActionInContext('click', 'internal:role=button[name="Submit"]'),
          );
        }
        return { actions: [] };
      });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      expect(onConsolidatedStep).toHaveBeenCalled();
      const capturedStep = onConsolidatedStep.mock.calls[0][0] as RecorderStepPayload;
      expect(capturedStep.action).toBe('click');
      expect(capturedStep.locator?.selector).toBe('internal:role=button[name="Submit"]');
    });
  });

  describe('executeNlStep() — lazy observe', () => {
    it('act 首次失败后触发一次 observe，第二次重试不再触发 observe', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click non-existent button', expected: '' }],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      // act: 第一次失败，第二次成功
      mockStagehand.act
        .mockRejectedValueOnce(new Error('element not found'))
        .mockResolvedValueOnce({ actions: [] });

      // observe 返回一些元素
      mockStagehand.observe.mockResolvedValue([
        { selector: 'internal:role=button[name="Login"]', description: 'Login button' },
      ]);

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true, maxRetriesPerStep: 2 },
        onConsolidatedStep,
        onEvent,
      });

      // observe 只被调用一次（首次失败后）
      expect(mockStagehand.observe).toHaveBeenCalledTimes(1);

      // act 被调用两次（第一次失败，第二次成功）
      expect(mockStagehand.act).toHaveBeenCalledTimes(2);

      // 第二次 act 的 instruction 包含 observe hint
      const secondCallArgs = mockStagehand.act.mock.calls[1][0] as string;
      expect(secondCallArgs).toContain('Login button');
    });

    it('act 全部失败时发射 step:failed 事件', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click non-existent button', expected: '' }],
      });
      const onConsolidatedStep = vi.fn();
      const events: Array<{ event: string; data: any }> = [];
      const onEvent = vi.fn((event: string, data: any) => events.push({ event, data }));

      mockStagehand.act.mockRejectedValue(new Error('element not found'));
      mockStagehand.observe.mockResolvedValue([]);
      // extract for dirty-state self-heal
      mockStagehand.extract.mockResolvedValue({ data: { needsCleanup: false } });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true, maxRetriesPerStep: 1 },
        onConsolidatedStep,
        onEvent,
      });

      const failedEvents = events.filter((e) => e.event === 'step:failed');
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].data.reason).toContain('act() failed');
    });
  });

  describe('executeNlStep() — takeover', () => {
    it('headless:false 时 act 全部失败后调用 onTakeoverRequest', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click non-existent button', expected: '' }],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();
      const onTakeoverRequest = vi.fn().mockResolvedValue(true);

      mockStagehand.act.mockRejectedValue(new Error('element not found'));
      mockStagehand.observe.mockResolvedValue([]);
      mockStagehand.extract.mockResolvedValue({ data: { needsCleanup: false } });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: false, maxRetriesPerStep: 1 },
        onConsolidatedStep,
        onEvent,
        onTakeoverRequest,
      });

      expect(onTakeoverRequest).toHaveBeenCalledTimes(1);
      expect(onTakeoverRequest.mock.calls[0][0]).toBe(0); // nlStepIndex
      expect(onTakeoverRequest.mock.calls[0][1]).toBe('Click non-existent button');
    });

    it('headless:true 时 act 全部失败后不调用 onTakeoverRequest', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click non-existent button', expected: '' }],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();
      const onTakeoverRequest = vi.fn().mockResolvedValue(true);

      mockStagehand.act.mockRejectedValue(new Error('element not found'));
      mockStagehand.observe.mockResolvedValue([]);
      mockStagehand.extract.mockResolvedValue({ data: { needsCleanup: false } });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true, maxRetriesPerStep: 1 },
        onConsolidatedStep,
        onEvent,
        onTakeoverRequest,
      });

      expect(onTakeoverRequest).not.toHaveBeenCalled();
    });
  });

  describe('executeNlStep() — extract 验证', () => {
    it('act 成功且有 expected 时调用 extract 验证', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click Submit', expected: 'User is logged in' }],
      });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      mockStagehand.act.mockResolvedValue({ actions: [] });
  mockStagehand.extract.mockResolvedValue({ data: { success: true, assertions: [] } });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      // act 调用 1 次 + extract 验证调用 1 次
      // 注意：extract 也用于脏状态自愈，但 act 成功时不会触发自愈
      expect(mockStagehand.act).toHaveBeenCalledTimes(1);
      // extract 至少被调用 1 次（验证）
      const extractCalls = mockStagehand.extract.mock.calls;
      expect(extractCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('extract 验证失败时发射 step:failed', async () => {
      const nlCase = makeNlCase({
        steps: [{ sequence: 1, action: 'Click Submit', expected: 'User is logged in' }],
      });
      const onConsolidatedStep = vi.fn();
      const events: Array<{ event: string; data: any }> = [];
      const onEvent = vi.fn((event: string, data: any) => events.push({ event, data }));

      mockStagehand.act.mockResolvedValue({ actions: [] });
      mockStagehand.extract.mockResolvedValue({ success: false, assertions: [] });

      const session = new AIRecordingSession();
      await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true, maxRetriesPerStep: 1 },
        onConsolidatedStep,
        onEvent,
      });

      const failedEvents = events.filter((e) => e.event === 'step:failed');
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].data.reason).toContain('expected not met');
    });
  });

  describe('start() — Refiner 集成', () => {
    it('RecordingResult.steps 包含精炼后的步骤', async () => {
      const nlCase = makeNlCase({ steps: [{ sequence: 1, action: 'Click Submit', expected: '' }] });
      const onConsolidatedStep = vi.fn();
      const onEvent = vi.fn();

      // _enableRecorder 可用
      (PlaywrightRecorderAdapter as any).isAvailable = vi.fn(() => true);

      // act() 模拟 _enableRecorder 捕获两个相同步骤（测试去重）
      let callCount = 0;
      mockStagehand.act.mockImplementation(async (_instruction: string, opts: any) => {
        callCount++;
        if (capturedOnActionAdded && callCount <= 2) {
          capturedOnActionAdded(
            opts.page,
            makeMockActionInContext('click', 'internal:role=button[name="Submit"]'),
          );
        }
        return { actions: [] };
      });

      const session = new AIRecordingSession();
      const result = await session.start({
        nlCase,
        providerConfig: makeProviderConfig(),
        options: { headless: true },
        onConsolidatedStep,
        onEvent,
      });

      // Refiner 去重后应该只有 1 个步骤
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].action).toBe('click');
      // provenance 标记
      expect((result.steps[0].metadata as any).provenance.source).toBe('ai-recorder');
    });
  });
});
