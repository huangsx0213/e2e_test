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

    // 官方去噪逻辑：只录制第一个进来的 URL
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
    const didMergeOrDiscard = merged.length <= this.actions.length;
    this.actions = merged;
    return didMergeOrDiscard ? null : mergedLast;
  }
}

export function collapseActions(actions: RecorderStepPayload[]): RecorderStepPayload[] {
  const result: RecorderStepPayload[] = [];
  for (const action of actions) {
    const lastAction = result[result.length - 1];
    
    // 1. 检查是否应该直接丢弃（去噪）
    if (shouldDiscard(action, lastAction)) {
      continue;
    }

    // 2. 检查是否应该合并到上一个动作
    const shouldMerge = shouldMergeAction(action, lastAction);
    if (!shouldMerge) {
      result.push(action);
      continue;
    }

    // 执行合并（如果是替换模式，保留旧的时间戳）
    const timestamp = result[result.length - 1].timestamp;
    result[result.length - 1] = action;
    result[result.length - 1].timestamp = timestamp;
  }
  return result;
}

function shouldDiscard(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

  // 1. 过滤 UI 动作触发的侧边效应导航
  if ((action.action === 'OPEN' || action.action === 'NAVIGATE') && 
      (lastAction.action !== 'OPEN' && lastAction.action !== 'NAVIGATE' && lastAction.action !== 'PAGE_LOAD')) {
    return (action.timestamp - lastAction.timestamp) < 2000;
  }
  
  // 2. 过滤 SELECT_OPTION 后的冗余点击
  if (action.action === 'CLICK' && lastAction.action === 'SELECT_OPTION' && isSameLocator(action, lastAction)) {
    return (action.timestamp - lastAction.timestamp) < 1000;
  }
  
  return false;
}

function shouldMergeAction(action: RecorderStepPayload, lastAction?: RecorderStepPayload): boolean {
  if (!lastAction) return false;

  switch (action.action) {
    case 'TYPE':
      if (lastAction.action === 'CLICK' && isSameLocator(action, lastAction)) return true;
      return isSameAction(action, lastAction) && isSameLocator(action, lastAction);
    case 'SELECT_OPTION':
      return isSameAction(action, lastAction) && isSameLocator(action, lastAction) && action.value === lastAction.value;
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

function isSameAction(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  return a.action === b.action && a.pageUrl === b.pageUrl;
}

function isSameLocator(a: RecorderStepPayload, b: RecorderStepPayload): boolean {
  // 1. 严格匹配 (使用 JSON 序列化避开 Union Type 的属性访问限制)
  if (JSON.stringify(a.locator) === JSON.stringify(b.locator)) return true;
  
  // 2. 模糊匹配（交叉对比候选定位器）
  const aStrings = a.metadata?.candidateStrings || [];
  const bStrings = b.metadata?.candidateStrings || [];
  
  if (Array.isArray(aStrings) && Array.isArray(bStrings) && aStrings.length && bStrings.length) {
    for (const sa of aStrings) {
      if (bStrings.includes(sa)) return true;
    }
  }

  return false;
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
