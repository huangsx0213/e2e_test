import { describe, it, expect } from 'vitest';
import { translateAction } from '../translator';
import type { ActionInContext, FrameDescription, LocatorRef, PlaywrightAction } from '../protocol';

// Helpers to build lightweight ActionInContext payloads
function frame(): FrameDescription {
  return {
    pageGuid: 'page-1',
    pageAlias: 'alias-1',
    framePath: ['root','frame'],
  };
}

function actionIn(action: PlaywrightAction, extra?: Partial<ActionInContext>): ActionInContext {
  return {
    frame: frame(),
    action: action,
    startTime: Date.now(),
    ...(extra || {}),
  } as ActionInContext;
}

function loc(sel: string): LocatorRef {
  if (sel.startsWith('internal:')) {
    return { kind: 'official', selector: sel };
  }
  return { kind: 'css', selector: sel };
}

describe('translateAction', () => {
  it('maps click with left button to recorder action', () => {
    const ai = actionIn({ name: 'click', selector: '#btn', clickCount: 1, button: 'left', modifiers: 0, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('click');
  });

  it('maps dblclick on second click to recorder action', () => {
    const ai = actionIn({ name: 'click', selector: '#btn', clickCount: 2, button: 'left', modifiers: 0, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    // Dispatcher should map to dblclick
    expect((out as any).action).toBe('dblclick');
  });

  it('maps right-click to rightClick', () => {
    const ai = actionIn({ name: 'click', selector: '#ctx', clickCount: 1, button: 'right', modifiers: 0, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('rightClick');
  });

  it('maps fill to fill with value', () => {
    const ai = actionIn({ name: 'fill', selector: '#field', text: 'hello', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('fill');
    expect((out as any).value).toBe('hello');
  });

  it('maps navigate to goto with url and no locator', () => {
    const url = 'https://example.test/page';
    const ai = actionIn({ name: 'navigate', url, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('goto');
    expect((out as any).value).toBe(url);
    expect((out as any).locator).toBeUndefined();
    expect((out as any).locatorCandidates).toEqual([]);
  });

  it('maps press to the correct action', () => {
    const ai = actionIn({ name: 'press', selector: '#inp', key: 'Enter', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('press');
    expect((out as any).value).toBe('Enter');
  });

  it('maps select to selectOption with joined values', () => {
    const ai = actionIn({ name: 'select', selector: '#sel', options: ['a', 'b'], signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('selectOption');
    expect((out as any).value).toBe('a, b');
  });

  it('maps check/uncheck/hover appropriately', () => {
    const a1 = actionIn({ name: 'check', selector: '#cb', signals: [] } as PlaywrightAction);
    const o1 = translateAction(a1);
    expect(o1).toBeTruthy();
    expect((o1 as any).action).toBe('check');

    const a2 = actionIn({ name: 'uncheck', selector: '#cb', signals: [] } as PlaywrightAction);
    const o2 = translateAction(a2);
    expect(o2).toBeTruthy();
    expect((o2 as any).action).toBe('uncheck');

    const a3 = actionIn({ name: 'hover', selector: '#div', signals: [] } as PlaywrightAction);
    const o3 = translateAction(a3);
    expect(o3).toBeTruthy();
    expect((o3 as any).action).toBe('hover');
  });

  it('returns null for openPage/closePage', () => {
    const open = actionIn({ name: 'openPage', url: 'https://x', signals: [] } as PlaywrightAction);
    const close = actionIn({ name: 'closePage', signals: [] } as PlaywrightAction);
    expect(translateAction(open)).toBeNull();
    expect(translateAction(close)).toBeNull();
  });

  it('maps setInputFiles to setInputFiles with joined values', () => {
    const ai = actionIn({ name: 'setInputFiles', selector: '#fs', files: ['a.txt', 'b.txt'], signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('setInputFiles');
    expect((out as any).value).toBe('a.txt, b.txt');
  });

  it('maps assertText to assertText with text', () => {
    const ai = actionIn({ name: 'assertText', selector: '#msg', text: 'hello', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('assertText');
    expect((out as any).value).toBe('hello');
  });

  it('maps assertValue to assertValue with value', () => {
    const ai = actionIn({ name: 'assertValue', selector: '#inp', value: '42', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('assertValue');
    expect((out as any).value).toBe('42');
  });

  it('maps assertChecked to assertChecked with stringified boolean', () => {
    const ai = actionIn({ name: 'assertChecked', selector: '#cb', checked: true, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('assertChecked');
    expect((out as any).value).toBe('true');
  });

  it('maps assertVisible to assertVisible', () => {
    const ai = actionIn({ name: 'assertVisible', selector: '#cb', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('assertVisible');
  });

  it('maps assertSnapshot to assertSnapshot with snapshot value', () => {
    const ai = actionIn({ name: 'assertSnapshot', selector: '#img', snapshot: 'snap', signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).action).toBe('assertSnapshot');
    expect((out as any).value).toBe('snap');
  });

  it('locator kind detection for internal: selector yields official kind', () => {
    const ai = actionIn({ name: 'click', selector: 'internal:role=button', clickCount: 1, button: 'left', modifiers: 0, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).locator.kind).toBe('official');
  });

  it('framePath propagation is present in metadata', () => {
    const ai = actionIn({ name: 'click', selector: '#btn', clickCount: 1, button: 'left', modifiers: 0, signals: [] } as PlaywrightAction);
    const out = translateAction(ai);
    expect(out).toBeTruthy();
    expect((out as any).metadata).toBeDefined();
    expect((out as any).metadata?.framePath).toEqual(['root','frame']);
  });
});
