import type { RecorderEvent, RecorderStepPayload } from './protocol.ts';
import { locatorRefToLegacyDef, locatorRefToName } from './locator.ts';

export class RecorderReducer {
  private actions: RecorderStepPayload[] = [];

  consume(event: RecorderEvent): RecorderStepPayload | null {
    if (event.action === 'recordElement') {
      return null;
    }

    if (event.action === 'hover') {
      return null;
    }

    // Only record the first navigation URL to avoid noisy sub-navigations
    if (event.action === 'goto' && this.actions.length > 0) {
      return null;
    }

    const action: RecorderStepPayload = event.action === 'goto'
      ? {
          action: event.action,
          locator: { kind: 'css', selector: `navigation[url="${escapeDoubleQuotes((event.value || event.pageUrl) ?? '')}"]` } as const,
          locatorCandidates: [{ kind: 'css', selector: `navigation[url="${escapeDoubleQuotes((event.value || event.pageUrl) ?? '')}"]` } as const],
          value: event.value || event.pageUrl,
          pageUrl: event.pageUrl,
          timestamp: event.timestamp,
          metadata: {
            previousUrl: event.metadata?.previousUrl || null,
            navigation: { url: event.value || event.pageUrl, action: event.action, previousUrl: event.metadata?.previousUrl || null },
          },
        }
      : {
          action: event.action,
          locator: event.locator!,
          locatorCandidates: [event.locator!],
          secondaryLocator: event.secondaryLocator,
          value: event.value,
          pageUrl: event.pageUrl,
          timestamp: event.timestamp,
          metadata: {
            ...event.metadata,
            displayName: locatorRefToName(event.locator!),
            legacyLocator: locatorRefToLegacyDef(event.locator!),
          },
        };

    const merged = collapseActions([...this.actions, action]);
    const mergedLast = merged[merged.length - 1];
    const didMergeOrDiscard = merged.length <= this.actions.length;
    this.actions = merged;
    return didMergeOrDiscard ? null : mergedLast;
  }
}

export function collapseActions(actions: RecorderStepPayload[]): RecorderStepPayload[] {
  const result: RecorderStepPayload[] = [];
  for (const action of actions) {
    const lastAction = result[result.length - 1];

    // 1. Check if should discard (noise reduction)
    if (shouldDiscard(action, lastAction)) {
      continue;
    }

    // 2. Check if should merge with previous action
    const shouldMerge = shouldMergeAction(action, lastAction);
    if (!shouldMerge) {
      result.push(action);
      continue;
    }

    // Merge: replace last action, preserve its timestamp
    const timestamp = result[result.length - 1].timestamp;
    result[result.length - 1] = action;
    result[result.length - 1].timestamp = timestamp;
  }
  return result;
}

function shouldDiscard(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

  // 1. Filter out sidebar navigation triggered by UI actions within 2s
  if ((action.action === 'goto' || action.action === 'navigate') &&
      (lastAction.action !== 'goto' && lastAction.action !== 'navigate' && lastAction.action !== 'pageLoad')) {
    return (action.timestamp - lastAction.timestamp) < 2000;
  }

  // 2. Filter redundant click after selectOption on same element within 1s
  if (action.action === 'click' && lastAction.action === 'selectOption' && isSameLocator(action, lastAction)) {
    return (action.timestamp - lastAction.timestamp) < 1000;
  }

  return false;
}

function shouldMergeAction(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

  switch (action.action) {
    case 'fill':
      if (lastAction.action === 'click' && isSameLocator(action, lastAction)) return true;
      return isSameAction(action, lastAction) && isSameLocator(action, lastAction);
    case 'selectOption':
      return isSameAction(action, lastAction) && isSameLocator(action, lastAction) && action.value === lastAction.value;
    case 'check':
    case 'uncheck':
    case 'setInputFiles':
      return isSameAction(action, lastAction) && isSameLocator(action, lastAction) && action.value === lastAction.value;
    case 'navigate':
    case 'pageLoad':
      return isSameAction(action, lastAction);
    case 'click':
      return isSameAction(action, lastAction)
        && isSameLocator(action, lastAction)
        && isShortlyAfter(action, lastAction, 500)
        && getClickCount(action) > getClickCount(lastAction);
    case 'dblclick':
    case 'rightClick':
    case 'dragTo':
    case 'press':
      return isSameAction(action, lastAction)
        && isSameLocator(action, lastAction)
        && action.value === lastAction.value
        && isShortlyAfter(action, lastAction, 250);
    default:
      return false;
  }
}

function isSameAction(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return a.action === b.action && a.pageUrl === b.pageUrl;
}

/**
 * Compare two locators by their selector strings directly.
 * LocatorRef now only has official/css, both with a `.selector` field.
 */
function isSameLocator(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return a.locator.selector === b.locator.selector;
}

function isShortlyAfter(a: RecorderStepPayload, b: RecorderStepPayload, thresholdMs: number): boolean {
  return a.timestamp - b.timestamp < thresholdMs;
}

function getClickCount(action: RecorderStepPayload): number {
  const count = action.metadata?.clickCount;
  return typeof count === 'number' ? count : 0;
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}