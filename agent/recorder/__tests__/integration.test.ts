import { describe, it, expect, vi } from 'vitest';

describe('PlaywrightRecorderAdapter integration (real Playwright)', () => {
  it('records real UI actions via the private API when available', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // If not available, skip gracefully
    const { PlaywrightRecorderAdapter } = await import('../adapter');
    if (!PlaywrightRecorderAdapter.isAvailable(context as any)) {
      await browser.close();
      return;
    }

    const onActionAdded = vi.fn();
    const adapter = new PlaywrightRecorderAdapter({ onActionAdded: onActionAdded as any });
    adapter.start(context as any);

    const page = await context.newPage();
    await page.goto('data:text/html,<button id="btn">Submit</button><input id="inp" type="text"/>');

    // Wait for initial navigation/openPage events to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));
    onActionAdded.mockClear();

    // Trigger a click
    await page.click('#btn');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(onActionAdded).toHaveBeenCalled();
    // Find the click action among recorded actions (may include navigate events)
    const clickCall = onActionAdded.mock.calls.find((call: any[]) => call[1]?.action?.name === 'click');
    expect(clickCall).toBeTruthy();
    expect(clickCall![1].action.name).toBe('click');

    // Trigger a fill
    onActionAdded.mockClear();
    await page.fill('#inp', 'hello');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(onActionAdded).toHaveBeenCalled();
    const fillCall = onActionAdded.mock.calls.find((call: any[]) => call[1]?.action?.name === 'fill');
    expect(fillCall).toBeTruthy();
    expect(fillCall![1].action.name).toBe('fill');
    expect(fillCall![1].action.text).toBe('hello');

    await adapter.stop();
    await browser.close();
  }, 60000);
});
