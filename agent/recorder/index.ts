import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { recorderInit } from './runtime.ts';
import { RecorderReducer } from './reducer.ts';
import { locatorRefFromOfficialSelector, locatorRefToLegacyDef, locatorRefToName } from './locator.ts';
import type { LocatorRef, RecorderMode, RecorderState } from './protocol.ts';

declare const require: NodeJS.Require;
const playwrightCoreDir = require.resolve('playwright-core').replace(/[/\\][^/\\]+$/, '');

type OnElementRecorded = (element: any) => void;
type OnStepRecorded = (stepInfo: any) => void;
type OnApiRecorded = (apiInfo: any) => void;
type OnRecorderStateChanged = (state: RecorderState) => void;

type RecordingSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  reducer: RecorderReducer;
  mode: RecorderMode;
  onElementRecorded: OnElementRecorded;
  onStepRecorded?: OnStepRecorded;
  onApiRecorded?: OnApiRecorded;
  onRecorderStateChanged?: OnRecorderStateChanged;
  cdp?: any;
  closing?: boolean;
  closeReason?: string;
};

let session: RecordingSession | null = null;

const BINDING_NAME = '__qqaRecorderSend';
const { source: injectedScriptSource } = require(`${playwrightCoreDir}/lib/generated/injectedScriptSource.js`);
const OFFICIAL_INJECTED_OPTIONS = {
  isUnderTest: false,
  sdkLanguage: 'javascript',
  testIdAttributeName: 'data-testid',
  stableRafCount: 1,
  browserName: 'chromium',
  shouldPrependErrorPrefix: false,
  isUtilityWorld: false,
  customEngines: [],
};

export async function startRecording(
  targetUrl: string,
  projectId: string,
  apiFilter: string | undefined,
  onElementRecorded: OnElementRecorded,
  onStepRecorded?: OnStepRecorded,
  onApiRecorded?: OnApiRecorded,
  onRecorderStateChanged?: OnRecorderStateChanged,
  mode: RecorderMode = 'all',
) {
  if (session) {
    await stopRecording();
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

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const reducer = new RecorderReducer();

  session = {
    browser,
    context,
    page,
    reducer,
    mode,
    onElementRecorded,
    onStepRecorded,
    onApiRecorded,
    onRecorderStateChanged,
  };

  const cdp = await context.newCDPSession(page);
  session.cdp = cdp;
  await cdp.send('Runtime.enable');
  await cdp.send('Runtime.addBinding', { name: BINDING_NAME });

  await page.addInitScript(({ source, options }) => {
    try {
      const module = { exports: {} as any };
      const fn = new Function('module', 'exports', `${source}\nreturn module.exports;`);
      const exports = fn(module, module.exports);
      const InjectedScript = exports.InjectedScript;
      (window as any).__qqaOfficialInjectedScript = new InjectedScript(window, options);
    } catch (error) {
      console.warn('[RecorderV2] Failed to initialize official injected script', error);
    }
  }, { source: injectedScriptSource, options: OFFICIAL_INJECTED_OPTIONS });

  cdp.on('Runtime.bindingCalled', async (payload: { name: string; payload: string }) => {
    if (payload.name !== BINDING_NAME) return;
    try {
      const event = JSON.parse(payload.payload);
      await handleBrowserEvent(event);
    } catch (error) {
      console.error('[RecorderV2] Failed to handle binding payload:', error);
    }
  });

  await page.addInitScript(recorderInit as any, { bindingName: BINDING_NAME, mode });

  const handleTerminalClose = async (reason: string) => {
    if (!session || session.closing) return;
    session.closing = true;
    session.closeReason = reason;
    console.log(`[RecorderV2] Session closing: ${reason}`);
    const stoppedState: RecorderState = { isPaused: true, started: false, mode: session.mode, action: 'STOP' };
    try {
      if (session.onRecorderStateChanged) session.onRecorderStateChanged(stoppedState);
    } catch (error) {
      console.warn('[RecorderV2] Failed to emit stop state:', error);
    }
    try {
      if (session.cdp) await session.cdp.detach();
    } catch {
      // ignore detach failures during shutdown
    }
    try {
      if (!session.browser.isConnected()) return;
      await session.browser.close();
    } catch {
      // ignore browser close races
    } finally {
      session = null;
    }
  };

  page.on('close', () => { void handleTerminalClose('page_closed'); });
  context.on('close', () => { void handleTerminalClose('context_closed'); });
  browser.on('disconnected', () => { void handleTerminalClose('browser_disconnected'); });
  page.on('crash', () => { void handleTerminalClose('page_crashed'); });
  page.on('pageerror', (error) => console.warn('[RecorderV2] Page error:', error));

  page.on('framenavigated', (frame) => {
    if (!session || frame !== page.mainFrame()) return;
    if (mode !== 'ui' && mode !== 'all') return;
    const raw = {
      type: 'navigate' as const,
      url: frame.url(),
      action: 'NAVIGATE' as const,
      previousUrl: null,
      timestamp: Date.now(),
    };
    void handleBrowserEvent(raw);
  });

  if (mode === 'api' || mode === 'all') {
    page.on('requestfinished', async (req) => {
      if (!session) return;
      try {
        if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
        if (req.method() === 'OPTIONS') return;

        let targetOrigin = '';
        let pageOrigin = '';
        try {
          targetOrigin = new URL(req.url()).origin;
          pageOrigin = new URL(req.frame()?.url() || page.url()).origin;
        } catch {
          // ignore URL parsing issues
        }
        if (targetOrigin && pageOrigin && targetOrigin !== pageOrigin && !apiFilter) return;

        if (apiFilter) {
          const trimmed = apiFilter.trim();
          const regexStr = trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          const regex = new RegExp(regexStr, 'i');
          if (!regex.test(req.url())) return;
        }

        const response = await req.response();
        const status = response ? response.status() : 0;
        if (status === 0) return;

        const headers = await req.allHeaders();
        const postData = req.postData();
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
        console.warn('[RecorderV2] API capture failed:', error);
      }
    });
  }

  await page.goto(targetUrl);
  await page.bringToFront();

  const startedState: RecorderState = { isPaused: false, started: true, mode, action: 'START' };
  if (onRecorderStateChanged) onRecorderStateChanged(startedState);
}

export async function stopRecording() {
  if (!session) return;
  try {
    if (!session.closing && session.onRecorderStateChanged) {
      session.onRecorderStateChanged({ isPaused: true, started: false, mode: session.mode, action: 'STOP' });
    }
    session.closing = true;
    if (session.cdp) {
      try {
        await session.cdp.detach();
      } catch {
        // ignore detach failures
      }
    }
    try {
      await session.browser.close();
    } catch {
      // ignore browser close races
    }
  } finally {
    session = null;
  }
}

async function handleBrowserEvent(event: any) {
  if (!session) return;

  const officialSelector = event?.metadata?.officialSelector;
  if (officialSelector && event.locator) {
    try {
      event = {
        ...event,
        locator: locatorRefFromOfficialSelector(officialSelector),
      };
    } catch (error) {
      console.warn('[RecorderV2] Failed to parse official selector, falling back to manual locator', error);
    }
  }

  if (event.type === 'element') {
    const legacy = locatorRefToLegacyDef(event.locator as LocatorRef);
    const element = {
      id: `el-${Math.random().toString(36).slice(2, 10)}`,
      name: locatorRefToName(event.locator as LocatorRef),
      selectorType: legacy.selectorType,
      value: legacy.value,
      description: event.metadata?.snapshot?.text || locatorRefToName(event.locator as LocatorRef),
      pageUrl: event.pageUrl,
      locators: [legacy],
      metadata: {
        recorder: {
          locator: event.locator,
          snapshot: event.metadata?.snapshot,
          legacyLocator: legacy,
          officialSelector: event.metadata?.officialSelector,
          framePath: event.metadata?.framePath || [],
        },
      },
    };
    session.onElementRecorded(element);
    return;
  }

  const reducer = session.reducer;
  const normalized = reducer.consume(event);
  if (!normalized) return;

  if (event.type === 'navigate' || event.type === 'ui') {
    const locator = normalized.locator;
    const legacy = locatorRefToLegacyDef(locator);
    const secondaryLegacy = normalized.secondaryLocator ? locatorRefToLegacyDef(normalized.secondaryLocator) : null;
    const dataValue = normalized.action === 'DRAG_AND_DROP'
      ? secondaryLegacy?.value || normalized.value || ''
      : normalized.value || '';
    const step = {
      id: `step-${Math.random().toString(36).slice(2, 10)}`,
      action: normalized.action,
      target: `${locatorRefToName(locator)}`,
      data: dataValue,
      description: buildStepDescription(normalized.action, locator, dataValue),
      isVerified: true,
      metadata: {
        recorder: {
          locator: normalized.locator,
          locatorCandidates: normalized.locatorCandidates,
          secondaryLocator: normalized.secondaryLocator,
          legacyLocator: legacy,
          secondaryLegacyLocator: secondaryLegacy,
          officialSelector: event.metadata?.officialSelector,
          framePath: event.metadata?.framePath || [],
          files: event.metadata?.files,
          pageUrl: normalized.pageUrl,
          timestamp: normalized.timestamp,
          raw: event,
        },
      },
    };
    if (session.onStepRecorded) session.onStepRecorded({ action: normalized.action, element: { ...legacy, name: locatorRefToName(locator), pageUrl: normalized.pageUrl, metadata: step.metadata }, dataValue, step });
    return;
  }
}

function buildStepDescription(action: string, locator: LocatorRef, value?: string) {
  const base = action === 'DRAG_AND_DROP'
    ? `DRAG_AND_DROP from ${locatorRefToName(locator)}`
    : `${action} on ${locatorRefToName(locator)}`;
  return value ? `${base}: ${value}` : base;
}
