import { describe, it, expect } from 'vitest';
import { StepConsolidator } from '../consolidation';
import type { RecorderEvent } from '../protocol';

function makeLocator(sel: string) {
  return { kind: 'css', selector: sel } as const;
}

function event(action: string, locator: any, ts: number, pageUrl = 'https://example.test') : RecorderEvent {
  return {
    action,
    locator,
    locatorCandidates: [locator],
    pageUrl,
    value: undefined,
    timestamp: ts,
    metadata: {},
  } as unknown as RecorderEvent;
}

describe('StepConsolidator regression tests', () => {
  it('suppresses click noise before fill until the final fill is ready to emit', () => {
    const consolidator = new StepConsolidator();
    const loc = makeLocator('#username');

    const click = event('click', loc, 1000) as any;
    const fill = event('fill', loc, 1100) as any;
    fill.value = 'hello';

    expect(consolidator.add(click)).toEqual([]);
    expect(consolidator.add(fill)).toEqual([]);
    expect(consolidator.flush()).toMatchObject([{ action: 'fill', value: 'hello', locator: loc }]);
  });

  it('emits only the final fill after successive per-character updates', () => {
    const consolidator = new StepConsolidator();
    const loc = makeLocator('#username');

    const fill1 = event('fill', loc, 2000) as any;
    fill1.value = 'h';
    const fill2 = event('fill', loc, 2100) as any;
    fill2.value = 'he';
    const fill3 = event('fill', loc, 2200) as any;
    fill3.value = 'hel';

    expect(consolidator.add(fill1)).toEqual([]);
    expect(consolidator.add(fill2)).toEqual([]);
    expect(consolidator.add(fill3)).toEqual([]);
    expect(consolidator.flush()).toMatchObject([{ action: 'fill', value: 'hel', locator: loc }]);
  });

  it('filters tab press after input completion', () => {
    const consolidator = new StepConsolidator();
    const loc = makeLocator('#username');

    const click = event('click', loc, 3000) as any;
    const fill = event('fill', loc, 3100) as any;
    fill.value = 'world';
    const tab = event('press', loc, 3200) as any;
    tab.value = 'Tab';

    expect(consolidator.add(click)).toEqual([]);
    expect(consolidator.add(fill)).toEqual([]);
    expect(consolidator.add(tab)).toEqual([]);
    expect(consolidator.flush()).toMatchObject([{ action: 'fill', value: 'world', locator: loc }]);
  });
});
