import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { PlaywrightRecorderAdapter } from './adapter.ts';
import { StepConsolidator } from './consolidation.ts';
import { translateAction } from './translator.ts';
import type { ActionInContext, RecorderStepPayload } from './protocol.ts';
import { locatorRefToLegacyDef, locatorRefToName } from './locator.ts';
import type { LocatorRef, RecorderMode, RecorderState } from './protocol.ts';

type OnElementRecorded = (element: any) => void;
type OnStepRecorded = (stepInfo: any) => void;
type OnApiRecorded = (apiInfo: any) => void;
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

let session: RecordingSession | null = null;
let consolidator = new StepConsolidator();

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

  // Reset consolidator for the new session
  consolidator.reset();


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

  const adapter = new PlaywrightRecorderAdapter({
    onActionAdded: (page, actionInContext: ActionInContext) => {
      if (!session) return;
      const step = translateAction(actionInContext);
      if (!step) return;

      // Fill pageUrl from the actual page if translator left it empty
      if (!step.pageUrl) {
        step.pageUrl = page.url();
      }

      for (const consolidated of consolidator.add(step)) {
        emitConsolidatedStep(consolidated);
      }
    },
    onSignalAdded: (_page, _signalInContext) => {
      // Signals are logged for metadata but don't produce steps directly
      // Playwright's recorder already correlates signals with actions
    },
  });

  adapter.start(context);

  session = {
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

  const handleTerminalClose = async (reason: string) => {
    if (!session || session.closing) return;
    session.closing = true;
    session.closeReason = reason;
    console.log(`[RecorderV2] Session closing: ${reason}`);
    flushConsolidatedSteps();
    const stoppedState: RecorderState = { isPaused: true, started: false, mode: session.mode, action: 'STOP' };
    try {
      if (session.onRecorderStateChanged) session.onRecorderStateChanged(stoppedState);
    } catch (error) {
      console.warn('[RecorderV2] Failed to emit stop state:', error);
    }
    try {
      session.adapter.stop();
    } catch {
      // best-effort
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
    flushConsolidatedSteps();
    if (!session.closing && session.onRecorderStateChanged) {
      session.onRecorderStateChanged({ isPaused: true, started: false, mode: session.mode, action: 'STOP' });
    }
    session.closing = true;
    try {
      session.adapter.stop();
    } catch {
      // best-effort stop
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

function flushConsolidatedSteps() {
  for (const step of consolidator.flush()) {
    emitConsolidatedStep(step);
  }
}

function emitConsolidatedStep(cleanStep: RecorderStepPayload) {
  if (!session) return;

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

  if (session.onStepRecorded) {
    session.onStepRecorded({
      action: cleanStep.action,
      element: locator && legacy ? {
        ...legacy,
        name: elementName,
        pageUrl: cleanStep.pageUrl,
        metadata: stepRecord.metadata,
      } : undefined,
      dataValue,
      step: stepRecord,
    });
  }

  if (session.onElementRecorded && locator) {
    session.onElementRecorded({
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
