import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { PlaywrightRecorderAdapter } from './adapter.ts';
import { StepConsolidator } from './consolidation.ts';
import { translateAction } from './translator.ts';
import type { ActionInContext, RecorderStepPayload, RecorderMode, RecorderState, LocatorRef } from './protocol.ts';
import { locatorRefToLegacyDef, locatorRefToName } from './locator.ts';
import type { UIElement } from '../../shared/contracts/index.ts';
import type { StepInfo, ApiRecordedInfo, ApiFilterConfig } from '../../shared/recording/protocol.ts';
import { matchApiFilter, legacyFilterToConfig } from '../../shared/recording/protocol.ts';

type OnElementRecorded = (element: UIElement) => void;
type OnStepRecorded = (stepInfo: StepInfo) => void;
type OnApiRecorded = (apiInfo: ApiRecordedInfo) => void;
type OnRecorderStateChanged = (state: RecorderState) => void;

type RecordingSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  adapter: PlaywrightRecorderAdapter;
  mode: RecorderMode;
  onElementRecorded: OnElementRecorded;
  onStepRecorded?: OnStepRecorded;
  onApiRecorded?: OnApiRecorded;
  onRecorderStateChanged?: OnRecorderStateChanged;
  closing?: boolean;
  closeReason?: string;
};

class RecordingManager {
  private session: RecordingSession | null = null;
  private startingPromise: Promise<void> | null = null;
  private consolidator = new StepConsolidator();

  async start(
    targetUrl: string,
    projectId: string,
    apiFilter: string | ApiFilterConfig | undefined,
    onElementRecorded: OnElementRecorded,
    onStepRecorded?: OnStepRecorded,
    onApiRecorded?: OnApiRecorded,
    onRecorderStateChanged?: OnRecorderStateChanged,
    mode: RecorderMode = 'all',
  ): Promise<void> {
    // Wait for any in-flight start before deciding what to do
    // (but don't silently swallow — this ensures sequential starts)
    if (this.startingPromise) {
      await this.startingPromise;
      if (this.session) {
        throw new Error('Recording session is already active');
      }
      return;
    }

    this.consolidator.reset();

    this.startingPromise = this.doStart(targetUrl, projectId, apiFilter, onElementRecorded, onStepRecorded, onApiRecorded, onRecorderStateChanged, mode);

    try {
      await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  async stop(): Promise<void> {
    // If a start is in-flight, wait for it, then immediately stop
    if (this.startingPromise) {
      try {
        await this.startingPromise;
      } catch {
        // start failed; nothing to stop
        return;
      }
    }
    if (!this.session) return;
    try {
      if (this.session.mode !== 'api') {
        this.consolidator.flush().forEach(step => this.emitConsolidatedStep(step));
      }
      if (!this.session.closing && this.session.onRecorderStateChanged) {
        this.session.onRecorderStateChanged({ isPaused: true, started: false, mode: this.session.mode, action: 'STOP' });
      }
      this.session.closing = true;
      try { this.session.adapter.stop(); } catch {}
      await this.session.browser.close().catch(() => {});
    } finally {
      this.session = null;
    }
  }

  private async doStart(
    targetUrl: string,
    projectId: string,
    apiFilter: string | ApiFilterConfig | undefined,
    onElementRecorded: OnElementRecorded,
    onStepRecorded: OnStepRecorded | undefined,
    onApiRecorded: OnApiRecorded | undefined,
    onRecorderStateChanged: OnRecorderStateChanged | undefined,
    mode: RecorderMode,
  ): Promise<void> {
    // Stop existing session before starting new one
    if (this.session) {
      await this.stop();
    }

    const headless = process.env.HEADLESS === 'true';
    const browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        ...(headless ? [] : ['--start-maximized']),
      ],
    });

    // If stop() was called while we were launching, clean up and abort
    if (!this.startingPromise) {
      await browser.close().catch(() => {});
      return;
    }

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    const adapter = new PlaywrightRecorderAdapter({
      onActionAdded: (page, actionInContext: ActionInContext) => {
        if (!this.session) return;
        if (this.session.mode === 'api') return;
        const step = translateAction(actionInContext);
        if (!step) return;

        if (!step.pageUrl) {
          step.pageUrl = page.url();
        }

        for (const consolidated of this.consolidator.add(step)) {
          this.emitConsolidatedStep(consolidated);
        }
      },
      onSignalAdded: () => {},
    });

    adapter.start(context);

    const session: RecordingSession = {
      browser,
      context,
      page,
      adapter,
      mode,
      onElementRecorded,
      onStepRecorded,
      onApiRecorded,
      onRecorderStateChanged,
    };
    this.session = session;

    // Terminal event handlers reference `session` capture to avoid stale closure
    const handleTerminalClose = async (reason: string) => {
      if (!this.session || this.session.closing) return;
      this.session.closing = true;
      this.session.closeReason = reason;
      if (this.session.mode !== 'api') {
        this.consolidator.flush().forEach(step => this.emitConsolidatedStep(step));
      }
      const stoppedState: RecorderState = { isPaused: true, started: false, mode: this.session.mode, action: 'STOP' };
      try {
        if (this.session.onRecorderStateChanged) this.session.onRecorderStateChanged(stoppedState);
      } catch {}
try { this.session.adapter.stop(); } catch {}
      try {
        if (this.session.browser.isConnected()) {
          await this.session.browser.close();
        }
      } catch {} finally {
        this.session = null;
      }
    };

    page.on('close', () => { void handleTerminalClose('page_closed'); });
    context.on('close', () => { void handleTerminalClose('context_closed'); });
    browser.on('disconnected', () => { void handleTerminalClose('browser_disconnected'); });
    page.on('crash', () => { void handleTerminalClose('page_crashed'); });
    page.on('pageerror', (error) => console.warn('[Recorder] Page error:', error));

    if (mode === 'api' || mode === 'all') {
      const filterConfig: ApiFilterConfig | undefined =
        typeof apiFilter === 'string'
          ? (apiFilter.trim() ? legacyFilterToConfig(apiFilter) : undefined)
          : apiFilter;

      page.on('requestfinished', async (req) => {
        if (!this.session) return;
        try {
          if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
          if (req.method() === 'OPTIONS') return;

          let targetOrigin = '';
          let pageOrigin = '';
          try {
            targetOrigin = new URL(req.url()).origin;
            pageOrigin = new URL(req.frame()?.url() || page.url()).origin;
          } catch {}

          const response = await req.response();
          const status = response ? response.status() : 0;
          if (status === 0) return;

          const reqInfo = { url: req.url(), method: req.method(), status };

          if (filterConfig && filterConfig.rules.length > 0) {
            if (!matchApiFilter(reqInfo, filterConfig)) return;
          } else {
            if (targetOrigin && pageOrigin && targetOrigin !== pageOrigin) return;
          }

          const headers = await req.allHeaders();
          const postData = req.postData();
          console.log(`[Recorder] API captured: ${req.method()} ${new URL(req.url()).pathname} -> ${status}`);
          if (onApiRecorded) {
            onApiRecorded({
              url: req.url(),
              method: req.method(),
              headers,
              postData,
              status,
              projectId,
            });
          }
        } catch (error) {
          console.warn('[Recorder] API capture failed:', error);
        }
      });
    }

    await page.goto(targetUrl, { timeout: 60000 });
    await page.bringToFront();

    const startedState: RecorderState = { isPaused: false, started: true, mode, action: 'START' };
    if (onRecorderStateChanged) onRecorderStateChanged(startedState);
  }

  private emitConsolidatedStep(cleanStep: RecorderStepPayload) {
    const s = this.session;
    if (!s) return;

    const locator = cleanStep.locator;
    const legacy = locator ? locatorRefToLegacyDef(locator) : undefined;
    const elementName = locator ? locatorRefToName(locator) : '';
    const dataValue = cleanStep.value || '';

    const stepRecord = {
      id: `step-${Math.random().toString(36).slice(2, 10)}`,
      action: cleanStep.action,
      target: cleanStep.action === 'goto' ? (cleanStep.value || '') : elementName,
      data: dataValue,
      description: buildStepDescription(cleanStep.action, locator, dataValue),
      isVerified: true,
      metadata: {
        recorder: {
          locator,
          locatorCandidates: cleanStep.locatorCandidates,
          legacyLocator: legacy,
          framePath: cleanStep.metadata?.framePath || [],
          pageUrl: cleanStep.pageUrl,
          timestamp: cleanStep.timestamp,
        },
      },
    };

    if (s.onStepRecorded) {
      s.onStepRecorded({
        action: cleanStep.action,
        element: locator && legacy ? {
          ...legacy,
          id: `el-${Math.random().toString(36).slice(2, 10)}`,
          name: elementName,
          pageUrl: cleanStep.pageUrl,
          metadata: stepRecord.metadata,
        } : undefined,
        dataValue,
        step: stepRecord,
      });
    }

    if (s.onElementRecorded && locator) {
      s.onElementRecorded({
        id: `el-${Math.random().toString(36).slice(2, 10)}`,
        name: elementName,
        selectorType: legacy.selectorType,
        value: legacy.value,
        description: elementName,
        pageUrl: cleanStep.pageUrl,
        locators: [legacy],
        metadata: {
          recorder: {
            locator,
            framePath: cleanStep.metadata?.framePath || [],
          },
        },
      });
    }
  }
}

const manager = new RecordingManager();

export async function startRecording(
  targetUrl: string,
  projectId: string,
  apiFilter: string | ApiFilterConfig | undefined,
  onElementRecorded: OnElementRecorded,
  onStepRecorded?: OnStepRecorded,
  onApiRecorded?: OnApiRecorded,
  onRecorderStateChanged?: OnRecorderStateChanged,
  mode: RecorderMode = 'all',
): Promise<void> {
  return manager.start(targetUrl, projectId, apiFilter, onElementRecorded, onStepRecorded, onApiRecorded, onRecorderStateChanged, mode);
}

export async function stopRecording(): Promise<void> {
  return manager.stop();
}

function buildStepDescription(action: string, locator?: LocatorRef, value?: string) {
  if (action === 'goto') return `Navigate to ${value || 'URL'}`;

  const name = locatorRefToName(locator) || 'unknown element';

  switch (action) {
    case 'click':
      return `Click on ${name}`;
    case 'dblclick':
      return `Double click on ${name}`;
    case 'rightClick':
      return `Right click on ${name}`;
    case 'fill':
      return `Type "${value}" into ${name}`;
    case 'press':
      return `Press ${value} key on ${name}`;
    case 'selectOption':
      return `Select "${value}" in ${name}`;
    case 'check':
      return `Check ${name}`;
    case 'uncheck':
      return `Uncheck ${name}`;
    case 'hover':
      return `Hover over ${name}`;
    case 'dragTo':
      return `Drag ${name} to destination`;
    case 'setInputFiles':
      return `Upload file(s) to ${name}: ${value}`;
    default:
      const base = `${action} on ${name}`;
      return value ? `${base}: ${value}` : base;
  }
}
