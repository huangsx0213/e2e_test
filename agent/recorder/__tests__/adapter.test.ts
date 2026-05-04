import { describe, it, expect, vi } from 'vitest';
import { PlaywrightRecorderAdapter } from '../adapter';

describe('PlaywrightRecorderAdapter', () => {
  it('isAvailable() returns false when _enableRecorder is missing', () => {
    const ctx: any = {};
    expect(PlaywrightRecorderAdapter.isAvailable(ctx)).toBe(false);
  });

  it('isAvailable() returns true when _enableRecorder exists', () => {
    const ctx: any = { _enableRecorder: vi.fn() };
    expect(PlaywrightRecorderAdapter.isAvailable(ctx)).toBe(true);
  });

  it('start() calls _enableRecorder with correct params', () => {
    const sink: any = { actionAdded: vi.fn() };
    const ctx: any = { _enableRecorder: vi.fn(), _disableRecorder: vi.fn() };
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: vi.fn() });
    // Run
    adapter.start(ctx as any);
    // Verify
    expect(ctx._enableRecorder).toHaveBeenCalled();
    const calledWith = (ctx._enableRecorder as any).mock.calls[0];
    expect(calledWith[0]).toMatchObject({ mode: 'recording', recorderMode: 'api' });
    // Second arg is the eventSink; ensure it has an actionAdded method
    expect(typeof calledWith[1]?.actionAdded).toBe('function');
  });

  it('start() throws if _enableRecorder is not available', () => {
    const ctx: any = { _enableRecorder: undefined };
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: vi.fn() });
    expect(() => adapter.start(ctx as any)).toThrow();
  });

  it('stop() calls _disableRecorder when available', () => {
    const ctx: any = { _enableRecorder: vi.fn(), _disableRecorder: vi.fn() };
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: vi.fn() });
    // Start to set internal context
    adapter.start(ctx as any);
    adapter.stop();
    expect(ctx._disableRecorder).toHaveBeenCalled();
  });

  it('stop() is safe when _disableRecorder is missing', () => {
    const ctx: any = { _enableRecorder: vi.fn() };
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: vi.fn() });
    adapter.start(ctx as any);
    // Should not throw even if _disableRecorder is missing
    expect(() => adapter.stop()).not.toThrow();
  });

  it('actionAdded callback is forwarded when eventSink fires', () => {
    const onActionAdded = vi.fn();
    const fakeActionInContext = {
      frame: { pageGuid: 'g1', pageAlias: 'p1', framePath: [] },
      action: { name: 'click', selector: '#btn', clickCount: 1, button: 'left', modifiers: 0, signals: [] },
      startTime: Date.now(),
    };
    const ctx: any = {
      _enableRecorder: (opts: any, sink: any) => {
        sink.actionAdded?.(null, fakeActionInContext, 'code');
      },
      _disableRecorder: vi.fn(),
    };
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: onActionAdded });
    adapter.start(ctx as any);
    expect(onActionAdded).toHaveBeenCalled();
    const arg = (onActionAdded as any).mock.calls[0][1];
    expect(arg).toBeTruthy();
    expect(arg.action.name).toBe('click');
  });
});
