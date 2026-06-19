/**
 * AutoReplay 单元测试
 *
 * 验证：
 *   - 3 次回放 + verdict 判定（pass/flaky/fail）
 *   - 提前终止（连续 2 次 fail）
 *   - 降级支持（replayRuns=1）
 *   - 步骤执行（click/fill/navigate/assert 等）
 *   - 候选选择器容错
 *   - fail-fast 行为
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page, Locator } from 'playwright';
import { autoReplayDraftSuite } from '../auto-replay.ts';
import type { TestSuite, TestStep } from '../../../shared/contracts/index.ts';

// === Mock helpers ===

function makeMockLocator(opts: Partial<{
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  waitFor: ReturnType<typeof vi.fn>;
  textContent: ReturnType<typeof vi.fn>;
  inputValue: ReturnType<typeof vi.fn>;
  isChecked: ReturnType<typeof vi.fn>;
  isEnabled: ReturnType<typeof vi.fn>;
  scrollIntoViewIfNeeded: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  hover: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  uncheck: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  selectOption: ReturnType<typeof vi.fn>;
  dblclick: ReturnType<typeof vi.fn>;
}> = {}): Locator {
  return {
    click: opts.click ?? vi.fn().mockResolvedValue(undefined),
    fill: opts.fill ?? vi.fn().mockResolvedValue(undefined),
    waitFor: opts.waitFor ?? vi.fn().mockResolvedValue(undefined),
    textContent: opts.textContent ?? vi.fn().mockResolvedValue(''),
    inputValue: opts.inputValue ?? vi.fn().mockResolvedValue(''),
    isChecked: opts.isChecked ?? vi.fn().mockResolvedValue(false),
    isEnabled: opts.isEnabled ?? vi.fn().mockResolvedValue(true),
    scrollIntoViewIfNeeded: opts.scrollIntoViewIfNeeded ?? vi.fn().mockResolvedValue(undefined),
    focus: opts.focus ?? vi.fn().mockResolvedValue(undefined),
    hover: opts.hover ?? vi.fn().mockResolvedValue(undefined),
    check: opts.check ?? vi.fn().mockResolvedValue(undefined),
    uncheck: opts.uncheck ?? vi.fn().mockResolvedValue(undefined),
    clear: opts.clear ?? vi.fn().mockResolvedValue(undefined),
    selectOption: opts.selectOption ?? vi.fn().mockResolvedValue(undefined),
    dblclick: opts.dblclick ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as Locator;
}

function makeMockPage(opts: Partial<{
  goto: ReturnType<typeof vi.fn>;
  waitForLoadState: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  keyboard: { press: ReturnType<typeof vi.fn> };
  title: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
  frameLocator: ReturnType<typeof vi.fn>;
}> = {}): Page {
  const defaultLocator = makeMockLocator();
  return {
    goto: opts.goto ?? vi.fn().mockResolvedValue(undefined),
    waitForLoadState: opts.waitForLoadState ?? vi.fn().mockResolvedValue(undefined),
    waitForTimeout: opts.waitForTimeout ?? vi.fn().mockResolvedValue(undefined),
    keyboard: opts.keyboard ?? { press: vi.fn().mockResolvedValue(undefined) },
    title: opts.title ?? vi.fn().mockResolvedValue('Test Page'),
    url: opts.url ?? vi.fn().mockReturnValue('https://example.com/page'),
    evaluate: opts.evaluate ?? vi.fn().mockResolvedValue(undefined),
    locator: opts.locator ?? vi.fn().mockReturnValue(defaultLocator),
    frameLocator: opts.frameLocator ?? vi.fn().mockReturnValue({
      locator: vi.fn().mockReturnValue(defaultLocator),
    }),
  } as unknown as Page;
}

function makeStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    action: 'click',
    target: 'internal:role=button[name="Submit"]',
    data: '',
    description: 'Click Submit',
    enabled: true,
    metadata: {
      recorder: {
        locator: { kind: 'official', selector: 'internal:role=button[name="Submit"]' },
        locatorCandidates: [],
        framePath: [],
        pageUrl: 'https://example.com',
        timestamp: Date.now(),
      },
    },
    ...overrides,
  };
}

function makeSuite(steps: TestStep[]): TestSuite {
  return {
    id: 'suite-1',
    name: 'Test Suite',
    cases: [{ id: 'case-1', name: 'Test Case', steps }],
  };
}

// === Tests ===

describe('autoReplayDraftSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verdict 判定', () => {
    it('3 次全部通过 → verdict=pass', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);
      const page = makeMockPage();

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
      });

      expect(report.runs).toBe(3);
      expect(report.passCount).toBe(3);
      expect(report.failCount).toBe(0);
      expect(report.verdict).toBe('pass');
      expect(report.overallPass).toBe(true);
      expect(report.degraded).toBe(false);
    });

    it('2 次通过 1 次失败 → verdict=flaky', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);

      let callCount = 0;
      const locator = makeMockLocator({
        click: vi.fn().mockImplementation(() => {
          callCount++;
          // 第 2 次回放失败
          if (callCount === 1) throw new Error('flaky failure');
          return undefined;
        }),
      });
      // waitFor 总是成功（元素存在），click 在第 2 次失败
      const clickImpl = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('flaky click failure');
        return Promise.resolve();
      });
      const locator2 = makeMockLocator({ click: clickImpl });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator2) });

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
      });

      // 3 次都跑完（没有连续 2 次 fail）
      expect(report.runs).toBe(3);
      expect(report.verdict).toBe('flaky');
      expect(report.passCount).toBe(2);
      expect(report.failCount).toBe(1);
    });

    it('3 次全部失败 → verdict=fail（提前终止后 runs=2）', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);

      const locator = makeMockLocator({
        click: vi.fn().mockRejectedValue(new Error('always fails')),
      });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
      });

      // 连续 2 次 fail 后提前终止，只跑 2 次
      expect(report.runs).toBe(2);
      expect(report.verdict).toBe('fail');
      expect(report.passCount).toBe(0);
      expect(report.failCount).toBe(2);
      expect(report.degraded).toBe(true);
    });

    it('连续 2 次失败后提前终止，不跑第 3 次', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);

      const locator = makeMockLocator({
        click: vi.fn().mockRejectedValue(new Error('always fails')),
      });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
      });

      // 连续 2 次 fail 后提前终止，只跑 2 次
      expect(report.runs).toBe(2);
      expect(report.verdict).toBe('fail');
      expect(report.degraded).toBe(true);
    });
  });

  describe('降级支持', () => {
    it('replayRuns=1 时只跑 1 次', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);
      const page = makeMockPage();

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
        replayRuns: 1,
      });

      expect(report.runs).toBe(1);
      expect(report.verdict).toBe('pass');
      expect(report.degraded).toBe(false); // 目标就是 1 次，不算降级
    });

    it('replayRuns=1 且失败时 verdict=fail', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);

      const locator = makeMockLocator({
        click: vi.fn().mockRejectedValue(new Error('fail')),
      });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
        replayRuns: 1,
      });

      expect(report.runs).toBe(1);
      expect(report.verdict).toBe('fail');
    });
  });

  describe('步骤执行', () => {
    it('每次回放前重置到 startUrl', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);
      const gotoFn = vi.fn().mockResolvedValue(undefined);
      const page = makeMockPage({ goto: gotoFn });

      await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com/start',
      });

      // 3 次回放 = 3 次 goto
      expect(gotoFn).toHaveBeenCalledTimes(3);
      expect(gotoFn).toHaveBeenCalledWith('https://example.com/start', expect.anything());
    });

    it('click 步骤调用 locator.click()', async () => {
      const clickFn = vi.fn().mockResolvedValue(undefined);
      const locator = makeMockLocator({ click: clickFn });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);

      await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      expect(clickFn).toHaveBeenCalledTimes(3); // 3 次回放
    });

    it('fill 步骤调用 locator.fill(data)', async () => {
      const fillFn = vi.fn().mockResolvedValue(undefined);
      const locator = makeMockLocator({ fill: fillFn });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [makeStep({ action: 'fill', data: 'hello@example.com' })];
      const suite = makeSuite(steps);

      await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      expect(fillFn).toHaveBeenCalledWith('hello@example.com', expect.anything());
    });

    it('navigate 步骤调用 page.goto(target)', async () => {
      const gotoFn = vi.fn().mockResolvedValue(undefined);
      const page = makeMockPage({ goto: gotoFn });

      const steps = [makeStep({ action: 'navigate', target: 'https://example.com/page2' })];
      const suite = makeSuite(steps);

      await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      // 3 次 startUrl reset + 3 次 navigate step = 6 次 goto
      expect(gotoFn).toHaveBeenCalledTimes(6);
    });

    it('press 步骤调用 page.keyboard.press()', async () => {
      const pressFn = vi.fn().mockResolvedValue(undefined);
      const page = makeMockPage({ keyboard: { press: pressFn } });

      const steps = [makeStep({ action: 'press', data: 'Enter' })];
      const suite = makeSuite(steps);

      await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      expect(pressFn).toHaveBeenCalledWith('Enter');
    });

    it('assertText 步骤验证文本内容', async () => {
      const locator = makeMockLocator({
        textContent: vi.fn().mockResolvedValue('Expected Text'),
      });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [makeStep({ action: 'assertText', data: 'Expected Text' })];
      const suite = makeSuite(steps);

      const report = await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      expect(report.verdict).toBe('pass');
    });

    it('assertText 文本不匹配时失败', async () => {
      const locator = makeMockLocator({
        textContent: vi.fn().mockResolvedValue('Wrong Text'),
      });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [makeStep({ action: 'assertText', data: 'Expected Text' })];
      const suite = makeSuite(steps);

      const report = await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      expect(report.verdict).toBe('fail');
    });
  });

  describe('fail-fast', () => {
    it('步骤失败后终止本次回放，后续步骤不执行', async () => {
      const clickFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'));

      const locator = makeMockLocator({ click: clickFn });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [
        makeStep({ id: 'step-1', action: 'click' }),
        makeStep({ id: 'step-2', action: 'click' }),
      ];
      const suite = makeSuite(steps);

      const report = await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      // 每次回放第 1 步就失败，第 2 步不执行
      // 连续 2 次 fail 后提前终止 → 只跑 2 次
      expect(report.runs).toBe(2);
      expect(report.results[0].totalSteps).toBe(2);
      expect(report.results[0].passedSteps).toBe(0);
      expect(report.results[0].failedSteps).toBe(1); // 只有第 1 步失败
      expect(report.results[0].stepResults).toHaveLength(1); // 第 2 步未执行
    });
  });

  describe('候选选择器容错', () => {
    it('主选择器失败时尝试候选选择器', async () => {
      // 主选择器 waitFor 失败，候选选择器成功
      const primaryLocator = makeMockLocator({
        waitFor: vi.fn().mockRejectedValue(new Error('not found')),
      });
      const fallbackLocator = makeMockLocator({
        click: vi.fn().mockResolvedValue(undefined),
      });

      // 根据选择器返回不同的 locator
      const locatorFn = vi.fn().mockImplementation((selector: string) => {
        if (selector.includes('internal:role')) return primaryLocator;
        return fallbackLocator;
      });

      const page = makeMockPage({ locator: locatorFn });

      const steps = [makeStep({
        action: 'click',
        metadata: {
          recorder: {
            locator: { kind: 'official', selector: 'internal:role=button[name="Submit"]' },
            locatorCandidates: [
              { kind: 'css', selector: '#submit-btn' },
            ],
            allLocators: [
              { kind: 'official', selector: 'internal:role=button[name="Submit"]' },
              { kind: 'css', selector: '#submit-btn' },
            ],
            framePath: [],
            pageUrl: 'https://example.com',
            timestamp: Date.now(),
          },
        },
      })];
      const suite = makeSuite(steps);

      const report = await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      // 主选择器失败，候选选择器成功 → pass
      expect(report.verdict).toBe('pass');
    });
  });

  describe('disabled 步骤', () => {
    it('enabled=false 的步骤被跳过且标记为 passed', async () => {
      const clickFn = vi.fn().mockResolvedValue(undefined);
      const locator = makeMockLocator({ click: clickFn });
      const page = makeMockPage({ locator: vi.fn().mockReturnValue(locator) });

      const steps = [
        makeStep({ id: 'disabled-step', action: 'click', enabled: false }),
        makeStep({ id: 'active-step', action: 'click', enabled: true }),
      ];
      const suite = makeSuite(steps);

      const report = await autoReplayDraftSuite(suite, { page, startUrl: 'https://example.com' });

      // disabled 步骤跳过，active 步骤执行
      expect(report.verdict).toBe('pass');
      expect(report.results[0].stepResults[0].passed).toBe(true);
      expect(report.results[0].stepResults[0].action).toBe('click');
    });
  });

  describe('ReplayReport 结构', () => {
    it('返回完整的 report 结构', async () => {
      const steps = [makeStep({ action: 'click' })];
      const suite = makeSuite(steps);
      const page = makeMockPage();

      const report = await autoReplayDraftSuite(suite, {
        page,
        startUrl: 'https://example.com',
      });

      expect(report).toHaveProperty('runs');
      expect(report).toHaveProperty('passCount');
      expect(report).toHaveProperty('failCount');
      expect(report).toHaveProperty('verdict');
      expect(report).toHaveProperty('results');
      expect(report).toHaveProperty('overallPass');
      expect(report).toHaveProperty('totalDurationMs');
      expect(report).toHaveProperty('degraded');

      expect(Array.isArray(report.results)).toBe(true);
      expect(report.results).toHaveLength(3);

      const firstResult = report.results[0];
      expect(firstResult).toHaveProperty('totalSteps');
      expect(firstResult).toHaveProperty('passedSteps');
      expect(firstResult).toHaveProperty('failedSteps');
      expect(firstResult).toHaveProperty('stepResults');
      expect(firstResult).toHaveProperty('durationMs');

      expect(firstResult.stepResults[0]).toHaveProperty('stepIndex');
      expect(firstResult.stepResults[0]).toHaveProperty('action');
      expect(firstResult.stepResults[0]).toHaveProperty('target');
      expect(firstResult.stepResults[0]).toHaveProperty('passed');
    });
  });
});
