// COMPATIBILITY: _enableRecorder is a private Playwright API. Tested with Playwright v1.58.2. Breaking changes may occur on major/minor upgrades.

import type { BrowserContext, Page } from 'playwright';
import type { ActionInContext, SignalInContext } from './protocol.ts';

interface RecorderEventSink {
  actionAdded?(page: Page, actionInContext: ActionInContext, code: string): void;
  actionUpdated?(page: Page, actionInContext: ActionInContext, code: string): void;
  signalAdded?(page: Page, signalInContext: SignalInContext): void;
}

// The adapter wraps the private BrowserContext._enableRecorder API to provide a safe,
// feature-detecting facade with a tiny surface compatible with our surrounding code.
export class PlaywrightRecorderAdapter {
  private _context: BrowserContext | null = null;

  private _onActionAdded: (page: Page, actionInContext: ActionInContext) => void;
  private _onSignalAdded?: (page: Page, signalInContext: SignalInContext) => void;

  private _eventSink: RecorderEventSink = {
    actionAdded: (page, actionInContext, _code) => {
      this._onActionAdded(page, actionInContext);
    },
    actionUpdated: (page, actionInContext, _code) => {
      this._onActionAdded(page, actionInContext);
    },
    signalAdded: (page, signalInContext) => {
      if (this._onSignalAdded) {
        this._onSignalAdded(page, signalInContext);
      }
    },
  };

  constructor(params: {
    onActionAdded: (page: Page, actionInContext: ActionInContext) => void;
    onSignalAdded?: (page: Page, signalInContext: SignalInContext) => void;
  }) {
    this._onActionAdded = params.onActionAdded;
    this._onSignalAdded = params.onSignalAdded;
  }

  // Static feature check: is _enableRecorder available on this context?
  static isAvailable(context: BrowserContext): boolean {
    try {
      return typeof (context as any)._enableRecorder === 'function';
    } catch {
      return false;
    }
  }

  // Start recording by invoking the private API if available.
  start(context: BrowserContext): void {
    const anyCtx = context as any;
    if (!PlaywrightRecorderAdapter.isAvailable(context)) {
      console.warn('[RecorderAdapter] _enableRecorder not available. Playwright version does not support programmatic recording.');
      throw new Error('Playwright programmatic recorder not supported in this Playwright version.');
    }
  this._context = context;
    try {
      anyCtx._enableRecorder({ mode: 'recording', recorderMode: 'api' }, this._eventSink);
    } catch (err) {
      console.warn('[RecorderAdapter] _enableRecorder not available. Playwright version does not support programmatic recording.');
      throw err;
    }
  }

  // Stop recording gracefully if supported by the context.
  stop(): void {
    try {
      const ctx = this._context as any;
      if (ctx && typeof ctx._disableRecorder === 'function') {
        ctx._disableRecorder();
      }
    } catch {
      // best-effort stop; ignore errors here
  }
  this._context = null;
  }
}

// Note: The private API contract used by this adapter is intentionally narrow and
// guarded by feature detection. This adapter is a thin shim to expose programmatic
// recording hooks when available and fail gracefully otherwise.
