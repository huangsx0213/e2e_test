import type { ActionInContext, PlaywrightAction, RecorderStepPayload, LocatorRef } from './protocol.ts';

// Escape helper to prepare URLs for CSS-like selectors
function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Translate a Playwright ActionInContext into the RecorderStepPayload shape.
 * Returns null for actions that should not be recorded (openPage/closePage).
 */
export function translateAction(actionInContext: ActionInContext): RecorderStepPayload | null {
  const { action, frame, startTime } = actionInContext;

  // Actions that should not be recorded
  if (action.name === 'openPage' || action.name === 'closePage') {
    return null;
  }

  // Basic shape fields
  const timestamp = startTime;
  const pageUrl = action.name === 'navigate' ? action.url : '';

  // Locator determination - for navigation (goto), locator is not applicable
  let locator: LocatorRef | undefined;
  if (action.name === 'navigate') {
    // Navigation doesn't need a locator - the URL is stored in the value field
    locator = undefined;
  } else {
    const sel = action.selector;
    if (sel) {
      locator = sel.startsWith('internal:')
        ? { kind: 'official', selector: sel }
        : { kind: 'css', selector: sel };
    } else {
      // Fallback to empty selector if somehow missing (shouldn't happen for non-navigate)
      locator = { kind: 'css', selector: '' };
    }
  }

  // Locator candidates – single candidate from Playwright (empty for navigate which has no locator)
  const locatorCandidates: LocatorRef[] = action.name === 'navigate' ? [] : [locator!];
  const secondaryLocator: LocatorRef | undefined = undefined;

  // Determine Recorder action name (as string) and compute value when needed
  let recorderAction: string | null = null;
  let value: string | undefined = undefined;

  switch (action.name) {
  case 'click': {
    if (action.clickCount === 2) recorderAction = 'dblclick';
    else if (action.button === 'right') recorderAction = 'rightClick';
    else recorderAction = 'click';
    break;
  }
  case 'fill':
    recorderAction = 'fill';
    value = action.text;
    break;
  case 'navigate':
    recorderAction = 'goto';
    value = action.url;
    break;
  case 'press':
    recorderAction = 'press';
    value = action.key;
    break;
  case 'select':
    recorderAction = 'selectOption';
    value = action.options.join(', ');
    break;
  case 'check':
    recorderAction = 'check';
    break;
  case 'uncheck':
    recorderAction = 'uncheck';
    break;
  case 'hover':
    recorderAction = 'hover';
    break;
  case 'setInputFiles':
    recorderAction = 'setInputFiles';
    value = action.files.join(', ');
    break;
  case 'assertText':
    recorderAction = 'assertText';
    value = action.text;
    break;
  case 'assertValue':
    recorderAction = 'assertValue';
    value = action.value;
    break;
  case 'assertChecked':
    recorderAction = 'assertChecked';
    value = String(action.checked);
    break;
  case 'assertVisible':
    recorderAction = 'assertVisible';
    break;
  case 'assertSnapshot':
    recorderAction = 'assertSnapshot';
    value = action.snapshot;
    break;
  default:
    // Unknown/unmappable action
    return null;
  }

  // Build metadata
  const metadata: Record<string, unknown> = {};
  metadata.framePath = frame.framePath;
  metadata.pageAlias = frame.pageAlias;
  if (action.ariaSnapshot !== undefined) {
    metadata.ariaSnapshot = action.ariaSnapshot;
  }
  if (action.signals !== undefined) {
    metadata.signals = action.signals;
  }
  if (action.name === 'click') {
    metadata.clickCount = action.clickCount;
    metadata.button = action.button;
    metadata.modifiers = action.modifiers;
  }

  const result: RecorderStepPayload = {
    action: recorderAction!,
    locator,
    locatorCandidates,
    secondaryLocator,
    value,
    pageUrl,
    timestamp,
    metadata,
  };

  return result;
}
