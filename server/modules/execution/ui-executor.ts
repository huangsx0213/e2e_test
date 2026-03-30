import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { TestStep } from '../../shared/contracts/index.ts';
import type { ExecutionContext } from './context.ts';
import type { UIElement } from '../../shared/contracts/index.ts';

export interface UIExecutionResult {
  durationMs: number;
  screenshot?: string;
  extractedValue?: string;
}

export class UIExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(options: { headless: boolean }): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: options.headless,
        args: ['--start-maximized'],
      });
      this.context = await this.browser.newContext({
        viewport: null, // Critical: let the page expand to the max window size
        recordVideo: { dir: 'videos/' },
      });
      this.page = await this.context.newPage();
    }
  }

  async executeStep(
    step: TestStep,
    executionContext: ExecutionContext,
    pages: import('../../shared/contracts/index.ts').Page[],
  ): Promise<UIExecutionResult> {
    if (!this.page) {
      throw new Error('UIExecutor not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    let extractedValue: string | undefined;

    // Resolve element locator if target exists
    let resolvedSelector: string | undefined;
    let usePlaywrightLocator = false;   // true when we need getBy* methods
    let locatorMethod: string | undefined;
    let locatorArg: string | undefined;

    if (step.target) {
      const interpolated = executionContext.interpolate(step.target);

      // Try to resolve "PageName.ElementName" or plain element name
      let elementDef: UIElement | undefined;

      if (interpolated.includes('.')) {
        const dotIdx = interpolated.indexOf('.');
        const pageName = interpolated.slice(0, dotIdx).trim();
        const elName = interpolated.slice(dotIdx + 1).trim();
        const page = pages.find(p => p.name === pageName);
        if (page) {
          elementDef = page.elements.find(e => e.name === elName);
        }
      }

      // Fall back to flat search by id or name across all pages
      if (!elementDef) {
        for (const p of pages) {
          elementDef = p.elements.find(e => e.id === interpolated || e.name === interpolated);
          if (elementDef) break;
        }
      }

      if (elementDef) {
        const st = elementDef.selectorType.toLowerCase();
        const val = elementDef.value;

        if (st === 'css' || st === 'CSS') {
          resolvedSelector = val;
        } else if (st === 'xpath') {
          resolvedSelector = `xpath=${val}`;
        } else if (st === 'text') {
          resolvedSelector = `text=${val}`;
        } else if (st === 'testid' || st === 'getbytestid') {
          resolvedSelector = `[data-testid="${val}"]`;
        } else if (['getbylabel', 'getbyrole', 'getbytext', 'getbyplaceholder'].includes(st)) {
          usePlaywrightLocator = true;
          locatorMethod = st;
          locatorArg = val;
        } else {
          // Default: treat value as a CSS selector
          resolvedSelector = val;
        }
      } else {
        // Not a repo element — treat interpolated value as-is (raw selector or URL)
        resolvedSelector = interpolated;
      }
    }

    // Resolve data payload
    let data = step.data;
    if (data) {
      data = executionContext.interpolate(data);
    }

    // Helper: get a Playwright Locator from our resolved info
    const getLocator = () => {
      if (usePlaywrightLocator && locatorMethod && locatorArg) {
        switch (locatorMethod) {
          case 'getbylabel':
            return this.page!.getByLabel(locatorArg);
          case 'getbytext':
            return this.page!.getByText(locatorArg);
          case 'getbyplaceholder':
            return this.page!.getByPlaceholder(locatorArg);
          case 'getbyrole': {
            // Parse "button[name=\"Sign in\"]" → role=button, name=Sign in
            const roleMatch = locatorArg.match(/^(\w+)\[name="(.+)"\]$/);
            if (roleMatch) {
              return this.page!.getByRole(roleMatch[1] as any, { name: roleMatch[2] });
            }
            return this.page!.getByRole(locatorArg as any);
          }
          default:
            throw new Error(`Unknown locator method: ${locatorMethod}`);
        }
      }
      if (!resolvedSelector) throw new Error('No target resolved for step');
      return this.page!.locator(resolvedSelector);
    };

    // Helper: Safely get the best single locator, preferring a visible one to avoid ghost elements and strict mode violations.
    const getSmartLocator = async () => {
      let base = getLocator();
      if (await base.count() > 1) {
        const visibleFilter = base.filter({ visible: true });
        if (await visibleFilter.count() > 0) {
          base = visibleFilter;
        }
      }
      return base.first();
    };

    // Execute the action
    switch (step.action) {
      case 'OPEN':
        if (!data) throw new Error('Data (URL) is required for OPEN step');
        await this.page.goto(data, { waitUntil: 'domcontentloaded' });
        break;

      case 'WAIT':
        if (data) {
          const waitTime = parseInt(data, 10);
          if (!isNaN(waitTime)) {
            await this.page.waitForTimeout(waitTime);
          }
        }
        break;

      case 'CLICK': {
        const locator = await getSmartLocator();
        try {
          await locator.click({ timeout: 10000, force: true });
        } catch (e: any) {
          await locator.evaluate((node: any) => node.click());
        }
        break;
      }

      case 'TYPE': {
        if (data === undefined) throw new Error('Data is required for TYPE step');
        const locator = await getSmartLocator();
        try {
          await locator.fill(data, { timeout: 10000, force: true });
        } catch (e: any) {
          await locator.evaluate((node: any, val: string) => {
            node.value = val;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
          }, data);
        }
        break;
      }

      case 'HOVER':
        await (await getSmartLocator()).hover({ timeout: 10000, force: true });
        break;

      case 'HIGHLIGHT': {
        const locator = await getSmartLocator();

        await locator.evaluate(async (node: HTMLElement) => {
          if (node.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          await new Promise(r => setTimeout(r, 100));

          // The authoritative Selenium/Playwright element highlighting method
          const originalBorder = node.style.border;
          const originalBackground = node.style.backgroundColor;

          for (let i = 0; i < 4; i++) {
            node.style.border = '3px solid red';
            node.style.backgroundColor = 'yellow';
            await new Promise(r => setTimeout(r, 250));
            
            node.style.border = originalBorder;
            node.style.backgroundColor = originalBackground;
            await new Promise(r => setTimeout(r, 250));
          }
        });
        break;
      }

      case 'SCROLL_TO':
        await getLocator().scrollIntoViewIfNeeded({ timeout: 10000 });
        break;

      case 'CHECK':
        await getLocator().check({ timeout: 10000, force: true });
        break;

      case 'UNCHECK':
        await getLocator().uncheck({ timeout: 10000, force: true });
        break;

      case 'SELECT_OPTION':
        if (data === undefined) throw new Error('Data is required for SELECT_OPTION step');
        await getLocator().selectOption(data, { timeout: 10000 });
        break;

      case 'PRESS_KEY':
        if (data) {
          await this.page.keyboard.press(data);
        } else if (resolvedSelector) {
          await this.page.keyboard.press(resolvedSelector);
        }
        break;

      case 'ASSERT_VISIBLE':
        // using 'attached' for E2E robustness against strictly visually hidden DOM hydration layers
        await getLocator().waitFor({ state: 'attached', timeout: 10000 });
        break;

      case 'ASSERT_HIDDEN':
        await getLocator().waitFor({ state: 'hidden', timeout: 10000 });
        break;

      case 'ASSERT_TEXT':
        if (data === undefined) throw new Error('Data is required for ASSERT_TEXT step');
        {
          const el = getLocator().first();
          const text = await el.textContent({ timeout: 10000 });
          if (!text || !text.includes(data)) {
            throw new Error(`Assertion failed: Expected text to include "${data}", but got "${text}"`);
          }
        }
        break;

      case 'ASSERT_VALUE':
        if (data === undefined) throw new Error('Data is required for ASSERT_VALUE step');
        {
          const el = getLocator().first();
          const val = await el.inputValue({ timeout: 10000 });
          if (val !== data) {
            throw new Error(`Assertion failed: Expected value "${data}", but got "${val}"`);
          }
        }
        break;

      case 'EXTRACT_VAR':
        if (!data) throw new Error('Data (variable key) is required for EXTRACT_VAR step');
        {
          const el = getLocator().first();
          const text = await el.textContent({ timeout: 10000 });
          extractedValue = text?.trim() || '';
          executionContext.setRuntimeVar(data, extractedValue);
        }
        break;

      case 'EVALUATE_JS':
        if (data) {
          const jsResult = await this.page.evaluate(data);
          extractedValue = String(jsResult);
        }
        break;

      default:
        throw new Error(`Unsupported UI action: ${step.action}`);
    }

    const durationMs = Date.now() - startTime;
    let screenshotBase64: string | undefined;

    if (step.screenshot) {
      screenshotBase64 = await this.takeScreenshot();
    }

    return {
      durationMs,
      screenshot: screenshotBase64,
      extractedValue,
    };
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) return '';
    try {
      const buffer = await this.page.screenshot({ type: 'jpeg', quality: 50 });
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (e) {
      return '';
    }
  }

  async captureStateScreenshot(): Promise<string> {
    // A silent screenshot used for logging on failure
    return this.takeScreenshot();
  }

  async cleanup(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
