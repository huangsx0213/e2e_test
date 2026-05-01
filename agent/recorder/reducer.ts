import type { RawRecorderEvent, RecorderStepPayload } from './protocol.ts';
import { locatorRefToCandidateStrings, locatorRefToLegacyDef, locatorRefToName } from './locator.ts';

export class RecorderReducer {
  private actions: RecorderStepPayload[] = [];

  consume(event: RawRecorderEvent): RecorderStepPayload | null {
    if (event.type === 'element') {
      return null;
    }

    if (event.type === 'ui' && event.action === 'HOVER') {
      return null;
    }

    // 官方去噪逻辑：只录制第一个进来的 URL (Session 的第一个动作)
    // 如果已经录制过任何动作，则忽略后续的导航事件
    if (event.type === 'navigate' && this.actions.length > 0) {
      return null;
    }

    const action: RecorderStepPayload = event.type === 'navigate'
      ? {
          action: event.action,
          locator: { kind: 'css', selector: `navigation[url="${escapeDoubleQuotes(event.url)}"]` } as const,
          locatorCandidates: [{ kind: 'css', selector: `navigation[url="${escapeDoubleQuotes(event.url)}"]` } as const],
          value: event.url,
          pageUrl: event.url,
          timestamp: event.timestamp,
          metadata: {
            previousUrl: event.previousUrl || null,
            navigation: { url: event.url, action: event.action, previousUrl: event.previousUrl || null },
          },
        }
      : {
          action: event.action,
          locator: event.locator,
          locatorCandidates: [event.locator],
          secondaryLocator: event.secondaryLocator,
          value: event.value,
          pageUrl: event.pageUrl,
          timestamp: event.timestamp,
          metadata: {
            ...event.metadata,
            displayName: locatorRefToName(event.locator),
            legacyLocator: locatorRefToLegacyDef(event.locator),
            candidateStrings: locatorRefToCandidateStrings(event.locator),
          },
        };

    const merged = collapseActions([...this.actions, action]);
    const mergedLast = merged[merged.length - 1];
    const didMerge = merged.length === this.actions.length;
    this.actions = merged;
    return didMerge ? null : mergedLast;
  }
}

export function collapseActions(actions: RecorderStepPayload[]): RecorderStepPayload[] {
  const result: RecorderStepPayload[] = [];
  for (const action of actions) {
    const lastAction = result[result.length - 1];
    const shouldMerge = shouldMergeAction(action, lastAction);
    if (!shouldMerge) {
      result.push(action);
      continue;
    }
    const timestamp = result[result.length - 1].timestamp;
    result[result.length - 1] = action;
    result[result.length - 1].timestamp = timestamp;
  }
  return result;
}

function isSameAction(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return a.action === b.action && a.pageUrl === b.pageUrl;
}

function isSameLocator(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return JSON.stringify(a.locator) === JSON.stringify(b.locator);
}

function getClickCount(action: RecorderStepPayload): number {
  const clickCount = action.metadata?.clickCount;
  return typeof clickCount === 'number' ? clickCount : 0;
}

function shouldMergeAction(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

    switch (action.action) {
      case 'TYPE':
        return isSameAction(action, lastAction) && isSameLocator(action, lastAction);
      case 'SELECT_OPTION':
      case 'CHECK':
      case 'UNCHECK':
      case 'ATTACH_FILE':
        return isSameAction(action, lastAction) && isSameLocator(action, lastAction) && action.value === lastAction.value;
      case 'NAVIGATE':
      case 'PAGE_LOAD':
        return isSameAction(action, lastAction);
      case 'CLICK':
        return isSameAction(action, lastAction)
          && isSameLocator(action, lastAction)
          && isShortlyAfter(action, lastAction, 500)
          && getClickCount(action) > getClickCount(lastAction);
      case 'DOUBLE_CLICK':
      case 'RIGHT_CLICK':
      case 'DRAG_AND_DROP':
      case 'PRESS_KEY':
        return isSameAction(action, lastAction)
          && isSameLocator(action, lastAction)
          && action.value === lastAction.value
          && isShortlyAfter(action, lastAction, 250);
      default:
        return false;
    }
  }

function isShortlyAfter(a: RecorderStepPayload, b: RecorderStepPayload, thresholdMs: number): boolean {
  return a.timestamp - b.timestamp < thresholdMs;
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
