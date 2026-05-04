import type { LocatorRef, RecorderStepPayload } from './protocol.ts';

export class StepConsolidator {
  private pending: RecorderStepPayload | null = null;
  private lastSettled: RecorderStepPayload | null = null;

  add(step: RecorderStepPayload): RecorderStepPayload[] {
    const emitted: RecorderStepPayload[] = [];

    if (this.pending) {
      if (shouldDiscard(step, this.pending)) {
        return emitted;
      }

      if (shouldMergeAction(step, this.pending)) {
        this.pending = mergeSteps(this.pending, step);
        return emitted;
      }

      emitted.push(this.settlePending());
    }

    if (shouldDiscard(step, this.lastSettled ?? undefined)) {
      return emitted;
    }

    if (shouldBuffer(step)) {
      this.pending = step;
      return emitted;
    }

    this.lastSettled = step;
    emitted.push(step);
    return emitted;
  }

  flush(): RecorderStepPayload[] {
    if (!this.pending) {
      return [];
    }
    return [this.settlePending()];
  }

  reset() {
    this.pending = null;
    this.lastSettled = null;
  }

  private settlePending(): RecorderStepPayload {
    const step = this.pending!;
    this.pending = null;
    this.lastSettled = step;
    return step;
  }
}

function shouldBuffer(step: RecorderStepPayload): boolean {
  return step.action === 'click' || step.action === 'fill';
}

function shouldDiscard(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

  if ((action.action === 'goto' || action.action === 'navigate') &&
      (lastAction.action !== 'goto' && lastAction.action !== 'navigate' && lastAction.action !== 'pageLoad')) {
    return (action.timestamp - lastAction.timestamp) < 2000;
  }

  if (action.action === 'press' && action.value === 'Tab') {
    return true;
  }

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
      return lastAction.action === 'click'
        && isSameLocator(action, lastAction)
        && isShortlyAfter(action, lastAction, 500);
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

function mergeSteps(previous: RecorderStepPayload, next: RecorderStepPayload): RecorderStepPayload {
  return {
    ...next,
    timestamp: previous.timestamp,
  };
}

function isSameAction(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return a.action === b.action && a.pageUrl === b.pageUrl;
}

function isSameLocator(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  if (sameSelector(a.locator, b.locator)) {
    return true;
  }

  if (JSON.stringify(a.locator) === JSON.stringify(b.locator)) {
    return true;
  }

  const aStrings = candidateStrings(a);
  const bStrings = candidateStrings(b);
  return aStrings.some((candidate) => bStrings.includes(candidate));
}

function sameSelector(a: LocatorRef, b: LocatorRef): boolean {
  return a.kind === b.kind && a.selector === b.selector;
}

function candidateStrings(step: RecorderStepPayload): string[] {
  const value = step.metadata?.candidateStrings;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isShortlyAfter(a: RecorderStepPayload, b: RecorderStepPayload, thresholdMs: number): boolean {
  return a.timestamp - b.timestamp < thresholdMs;
}

function getClickCount(action: RecorderStepPayload): number {
  const count = action.metadata?.clickCount;
  return typeof count === 'number' ? count : 0;
}
