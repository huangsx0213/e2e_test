/**
 * POC: Does _enableRecorder capture programmatic Playwright API calls?
 *
 * VERDICT (2026-06-16, Playwright 1.58.2):
 *
 * YES — _enableRecorder DOES capture all CDP-dispatch Playwright API calls
 * (click, fill, press, etc.) and produces internal:role= based selectors
 * with rich ariaSnapshot data.
 *
 * Results:
 *   page.click("#btn")                         → fired ✅  selector: internal:role=button[name="Submit button"i]
 *   page.getByRole("button",{name:"Submit"}).click() → fired ✅  selector: internal:role=button[name="Submit button"i]
 *   page.locator("#btn").click()                → fired ✅  selector: internal:role=button[name="Submit button"i]
 *   keyboard Tab+Enter                          → fired ✅  action: click (not keyboard!)
 *   evaluate(() => btn.click())                 → fired ❌  (pure JS synthetic click, no CDP dispatch)
 *   getByRole("textbox").fill("hello")          → fired ✅  selector: internal:role=textbox[name="Username"i]
 *
 * Key insight: The recorder resolves selectors from the accessibility tree
 * AFTER capturing DOM events.  It does NOT depend on the locator API used.
 *
 * Design implication: Use dual-path approach
 *   Primary: _enableRecorder (rich ariaSnapshot, automatic)
 *   Fallback: buildFakeActionInContext (when recorder unavailable or tool
 *             doesn't trigger DOM events like evaluate/scrollIntoView)
 */
import { describe, it, expect, vi } from 'vitest';

const TEST_HTML = `
<html><body>
  <button id="btn" aria-label="Submit button">Submit</button>
  <input id="inp" type="text" aria-label="Username" />
</body></html>`;

async function testRecorderCapture(
  performAction: (page: any) => Promise<void>,
): Promise<{
  fired: boolean;
  actionName?: string;
  selector?: string;
  actionDetail?: any;
}> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const { PlaywrightRecorderAdapter } = await import('../adapter');
  if (!PlaywrightRecorderAdapter.isAvailable(context as any)) {
    await browser.close();
    return { fired: false };
  }

  const onActionAdded = vi.fn();
  const adapter = new PlaywrightRecorderAdapter({ onActionAdded: onActionAdded as any });
  adapter.start(context as any);

  const page = await context.newPage();
  await page.goto(`data:text/html,${encodeURIComponent(TEST_HTML)}`);

  await new Promise((r) => setTimeout(r, 1500));
  onActionAdded.mockClear();

  await performAction(page);
  await new Promise((r) => setTimeout(r, 2000));

  const fired = onActionAdded.mock.calls.length > 0;
  let actionName: string | undefined;
  let selector: string | undefined;
  let actionDetail: any | undefined;

  if (fired) {
    const call = onActionAdded.mock.calls[onActionAdded.mock.calls.length - 1];
    const aic = call?.[1];
    actionName = aic?.action?.name;
    selector = aic?.action?.selector;
    actionDetail = {
      name: actionName,
      selector,
      ariaSnapshot: aic?.action?.ariaSnapshot?.slice(0, 100),
      clickCount: aic?.action?.clickCount,
    };
  }

  await adapter.stop();
  await browser.close();

  return { fired, actionName, selector, actionDetail };
}

describe('_enableRecorder capture POC', () => {

  it('BASELINE: page.click("#btn")', async () => {
    const r = await testRecorderCapture(async (page) => { await page.click('#btn'); });
    console.log('[BASELINE]        fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
    expect(r.fired).toBe(true);
    expect(r.actionName).toBe('click');
  }, 60000);

  it('QUERY: page.getByRole("button", { name: "Submit" }).click()', async () => {
    const r = await testRecorderCapture(async (page) => {
      await page.getByRole('button', { name: 'Submit' }).click();
    });
    console.log('[GETBYROLE]       fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
    expect(r.fired).toBe(true);
    expect(r.actionName).toBe('click');
  }, 60000);

  it('QUERY: page.locator("#btn").click()', async () => {
    const r = await testRecorderCapture(async (page) => { await page.locator('#btn').click(); });
    console.log('[LOCATOR]         fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
    expect(r.fired).toBe(true);
    expect(r.actionName).toBe('click');
  }, 60000);

  it('KEYBOARD: Tab+Enter', async () => {
    const r = await testRecorderCapture(async (page) => {
      await page.keyboard.press('Tab');
      await new Promise((r) => setTimeout(r, 300));
      await page.keyboard.press('Enter');
    });
    console.log('[KEYBOARD]        fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
    expect(r.fired).toBe(true);
  }, 60000);

  it('NEGATIVE: evaluate(() => btn.click())', async () => {
    const r = await testRecorderCapture(async (page) => {
      await page.evaluate(() => (document.querySelector('#btn') as HTMLButtonElement).click());
    });
    console.log('[EVALUATE]        fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
  }, 60000);

  it('FILL: getByRole("textbox").fill("hello")', async () => {
    const r = await testRecorderCapture(async (page) => {
      await page.getByRole('textbox', { name: 'Username' }).fill('hello');
    });
    console.log('[FILL]            fired:', r.fired, 'action:', r.actionName, 'selector:', r.selector);
    console.log('                  detail:', JSON.stringify(r.actionDetail));
    expect(r.fired).toBe(true);
    expect(r.actionName).toBe('fill');
  }, 60000);
});
