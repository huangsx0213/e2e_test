import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import { JSONPath } from 'jsonpath-plus';
import type { TestStep, LogLevel } from '../../shared/contracts/index.ts';
import type { ExecutionContext } from './context.ts';
import type { UIElement } from '../../shared/contracts/index.ts';
import { environmentRepository } from '../environments/repository.ts';
import type { ExecutionLogger } from './logger.ts';
import { evaluateAssertions } from './assertions.ts';

export interface UIExecutionResult {
  durationMs: number;
  screenshot?: string;
  extractedValue?: string;
  assertionDetails?: {
    expected: string;
    actual: string;
    target?: string;
  };
  logs: { status: string; level: LogLevel; message: string }[];
}

// Constants for better maintainability
const DEFAULT_TIMEOUT = 10000;
const SCREENSHOT_QUALITY = 50;
const HIGHLIGHT_ITERATIONS = 4;
const HIGHLIGHT_DURATION = 250;

export class UIExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private dialogHandler: ((dialog: any) => Promise<void>) | null = null;
  private logger?: ExecutionLogger;

  async initialize(options: {
    headless: boolean;
    viewportWidth?: number;
    viewportHeight?: number;
    logger?: ExecutionLogger;
    recordVideo?: boolean;
  }): Promise<void> {
    this.logger = options.logger;
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: options.headless,
        args: options.viewportWidth && options.viewportHeight ? [] : ['--start-maximized'],
      });
      this.context = await this.browser.newContext({
        viewport: options.viewportWidth && options.viewportHeight
          ? { width: options.viewportWidth, height: options.viewportHeight }
          : null,
        recordVideo: options.recordVideo !== false ? { dir: 'videos/' } : undefined,
      });
      this.page = await this.context.newPage();

      if (this.logger) {
        this.page.on('console', msg => {
          this.logger?.log({
            stepId: 'system-console',
            status: 'INFO',
            level: msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warn' : 'debug',
            message: `[Browser Console] ${msg.text()}`,
          });
        });

        this.page.on('request', request => {
          this.logger?.log({
            stepId: 'system-network',
            status: 'INFO',
            level: 'debug',
            message: `[Network Request] ${request.method()} ${request.url()}`,
            metadata: {
              network: {
                url: request.url(),
                method: request.method(),
                isMocked: false,
              }
            }
          });
        });

        this.page.on('response', async response => {
          const request = response.request();
          this.logger?.log({
            stepId: 'system-network',
            status: 'INFO',
            level: response.status() >= 400 ? 'warn' : 'debug',
            message: `[Network Response] ${request.method()} ${request.url()} - ${response.status()}`,
            metadata: {
              network: {
                url: request.url(),
                method: request.method(),
                status: response.status(),
                isMocked: false,
              }
            }
          });
        });
      }
    }
  }

  async executeStep(
    step: TestStep,
    executionContext: ExecutionContext,
    pages: import('../../shared/contracts/index.ts').Page[],
    environment: string,
  ): Promise<UIExecutionResult> {
    if (!this.page) {
      throw new Error('UIExecutor not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    let extractedValue: string | undefined;
    let assertionDetails: UIExecutionResult['assertionDetails'] = undefined;
    const logs: { status: string; level: LogLevel; message: string }[] = [];

    // Resolve element locator if target exists
    let candidateLocators: { selectorType: string; value: string }[] = [];

    if (step.target) {
      const interpolated = executionContext.interpolate(step.target);

      // Try to resolve "PageName.ElementName" or plain element name
      let elementDef: UIElement | undefined;

      if (interpolated.includes('.')) {
        const dotIdx = interpolated.indexOf('.');
        const pageName = interpolated.slice(0, dotIdx).trim().toLowerCase();
        const elName = interpolated.slice(dotIdx + 1).trim().toLowerCase();
        const page = pages.find(p => p.name.toLowerCase() === pageName);
        if (page) {
          elementDef = (page.elements || []).find(e => e.name.toLowerCase() === elName);
        }
      }

      // Fall back to flat search by id or name across all pages (case-insensitive)
      if (!elementDef) {
        const flatInterp = interpolated.toLowerCase();
        for (const p of pages) {
          elementDef = (p.elements || []).find(e => 
            e.id === interpolated || e.name.toLowerCase() === flatInterp
          );
          if (elementDef) break;
        }
      }

      if (elementDef) {
        // Collect all available locators, prioritizing the primary one
        candidateLocators = [{ selectorType: elementDef.selectorType, value: elementDef.value }];
        if (elementDef.locators && elementDef.locators.length > 0) {
          for (const loc of elementDef.locators) {
             if (loc.value !== elementDef.value) {
                candidateLocators.push(loc);
             }
          }
        }
      } else {
        // Not a repo element — treat interpolated value as-is (raw selector or URL)
        candidateLocators = [{ selectorType: 'css', value: interpolated }];
      }
    }

    // Resolve data payload
    let data = step.data;
    if (data) {
      data = executionContext.interpolate(data);
    }

    // Helper: get a Playwright Locator from a formal locator definition
    const createLocator = (loc: { selectorType: string; value: string }): { locator: Locator; methodInfo: string } => {
      const st = loc.selectorType.toLowerCase();
      const val = executionContext.interpolate(loc.value);

      if (st === 'css' || st === 'CSS') {
        return { locator: this.page!.locator(val), methodInfo: `css(${val})` };
      } else if (st === 'xpath') {
        return { locator: this.page!.locator(`xpath=${val}`), methodInfo: `xpath(${val})` };
      } else if (st === 'text') {
        return { locator: this.page!.locator(`text=${val}`), methodInfo: `text(${val})` };
      } else if (st === 'testid' || st === 'getbytestid' || st === 'data-test') {
        return { locator: this.page!.getByTestId(val), methodInfo: `getByTestId(${val})` };
      } else if (['getbylabel', 'getbyrole', 'getbytext', 'getbyplaceholder', 'getbyalttext'].includes(st)) {
        switch (st) {
          case 'getbylabel':
            return { locator: this.page!.getByLabel(val), methodInfo: `getByLabel(${val})` };
          case 'getbytext':
            return { locator: this.page!.getByText(val), methodInfo: `getByText(${val})` };
          case 'getbyplaceholder':
            return { locator: this.page!.getByPlaceholder(val), methodInfo: `getByPlaceholder(${val})` };
          case 'getbyalttext':
            return { locator: this.page!.getByAltText(val), methodInfo: `getByAltText(${val})` };
          case 'getbyrole': {
            let role = val;
            let options: any = {};

            // Robust Support format: "button, {name: 'Login', exact: true}"
            if (val.includes('{')) {
              const parts = val.split(/,(?=\s*\{)/);
              role = parts[0].trim();
              const optionsStr = parts[1]?.trim();
              if (optionsStr) {
                // Improved regex for parsing options
                const nameMatch = optionsStr.match(/(?:['"]?name['"]?)\s*:\s*(['"])(.*?)\1/);
                if (nameMatch) options.name = nameMatch[2];
                const exactMatch = optionsStr.match(/(?:['"]?exact['"]?)\s*:\s*(true|false)/);
                if (exactMatch) options.exact = exactMatch[1] === 'true';
              }
            } 
            // Support format: "button[name='Login']"
            else if (val.includes('[name=')) {
              const bracketMatch = val.match(/^(\w+)\[name=['"](.+)['"]\]$/);
              if (bracketMatch) {
                role = bracketMatch[1];
                options.name = bracketMatch[2];
              }
            }

            return { locator: this.page!.getByRole(role as any, options), methodInfo: `getByRole(${role}, ${JSON.stringify(options)})` };
          }
        }
      }
      
      // Default fallback
      return { locator: this.page!.locator(val), methodInfo: `locator(${val})` };
    };

    // Helper: Safely get the best single locator with smart waiting and actionability checks
    const getSmartLocator = async (options?: { skipActionabilityCheck?: boolean }): Promise<Locator> => {
      let lastError: any = null;
      
      // Try each candidate locator in sequence
      for (const locInfo of candidateLocators) {
        const { locator: base, methodInfo } = createLocator(locInfo);
        
        try {
          // Quick wait to see if this locator works
          await base.first().waitFor({ state: 'attached', timeout: lastError ? 2000 : 5000 });
          
          let finalLocator = base;
          const count = await base.count();
          if (count > 1) {
            // Prefer visible elements when multiple matches exist
            const visibleFilter = base.filter({ visible: true });
            const visibleCount = await visibleFilter.count();
            if (visibleCount > 0) {
              finalLocator = visibleFilter;
            }
          }

          const target = finalLocator.first();
          if (!options?.skipActionabilityCheck) {
            await target.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {
              console.warn(`Element found via ${methodInfo} but not visible.`);
            });
          }

          console.log(`[EXEC] Successfully resolved element via: ${methodInfo}`);
          return target;
        } catch (e) {
          lastError = e;
          console.warn(`[EXEC] Locator failed: ${methodInfo}. Trying next...`);
          continue;
        }
      }

      throw new Error(`Element not found after trying ${candidateLocators.length} locators for: ${step.target}. Last error: ${lastError?.message}`);
    };

    // Helper: Perform action with fallback to JS evaluation
    const performActionWithFallback = async (
      locator: Locator,
      action: () => Promise<void>,
      fallbackEval?: (node: any, ...args: any[]) => void,
      ...fallbackArgs: any[]
    ): Promise<void> => {
      try {
        await action();
      } catch (e: any) {
        if (fallbackEval) {
          await locator.evaluate(fallbackEval, ...fallbackArgs);
        } else {
          throw e;
        }
      }
    };

    // Setup Network Mocks
    if (step.networkMocks && step.networkMocks.some(m => m.enabled)) {
      for (const mock of step.networkMocks) {
        if (!mock.enabled || !mock.urlPattern) continue;
        
        const resolvedUrlPattern = executionContext.interpolate(mock.urlPattern);
        const pattern = new RegExp(resolvedUrlPattern);
        await this.page.route(pattern, async (route, request) => {
          if (mock.method && mock.method !== 'ANY' && request.method().toUpperCase() !== mock.method.toUpperCase()) {
            return route.fallback();
          }
          
          if (mock.delayMs) {
            await new Promise(resolve => setTimeout(resolve, mock.delayMs));
          }
          
          logs.push({
            status: 'INFO',
            level: 'info',
            message: `[Mock Hit] ${request.method()} ${request.url()} -> ${mock.status || 200}`,
          });

          await route.fulfill({
            status: mock.status || 200,
            contentType: 'application/json',
            body: executionContext.interpolate(mock.body || '{}'),
          });
        });
      }
    }

    // Execute the action
    let waitPromise: Promise<import('playwright').Response> | undefined;
    if (step.waitForNetwork?.enabled && step.waitForNetwork.urlPattern) {
      const { urlPattern, method, expectedStatus, timeoutMs = 10000 } = step.waitForNetwork;
      const resolvedUrlPattern = executionContext.interpolate(urlPattern);
      
      waitPromise = this.page.waitForResponse((response) => {
        const urlMatch = response.url().includes(resolvedUrlPattern) || new RegExp(resolvedUrlPattern).test(response.url());
        const methodMatch = !method || method === 'ANY' || response.request().method().toUpperCase() === method.toUpperCase();
        const statusMatch = !expectedStatus || response.status() === expectedStatus;
        
        return urlMatch && methodMatch && statusMatch;
      }, { timeout: timeoutMs });
    }

    const resolvedSelector = step.target ? executionContext.interpolate(step.target) : '';

    const actionPromise = (async () => {
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

      case 'WAIT_FOR_VISIBLE': {
        const locator = await getSmartLocator({ skipActionabilityCheck: true });
        await locator.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'WAIT_FOR_INVISIBLE': {
        const locator = await getSmartLocator({ skipActionabilityCheck: true });
        await locator.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'CLICK': {
        const locator = await getSmartLocator();
        await performActionWithFallback(
          locator,
          () => locator.click({ timeout: DEFAULT_TIMEOUT, force: true }),
          (node: any) => node.click()
        );
        break;
      }

      case 'DOUBLE_CLICK': {
        const locator = await getSmartLocator();
        await locator.dblclick({ timeout: DEFAULT_TIMEOUT, force: true });
        break;
      }

      case 'RIGHT_CLICK': {
        const locator = await getSmartLocator();
        await locator.click({ button: 'right', timeout: DEFAULT_TIMEOUT, force: true });
        break;
      }



      case 'TYPE': {
        if (data === undefined) throw new Error('Data is required for TYPE step');
        const locator = await getSmartLocator();
        await performActionWithFallback(
          locator,
          () => locator.fill(data, { timeout: DEFAULT_TIMEOUT, force: true }),
          (node: any, val: string) => {
            node.value = val;
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
          },
          data
        );
        break;
      }

      case 'CLEAR': {
        const locator = await getSmartLocator();
        await performActionWithFallback(
          locator,
          () => locator.clear({ timeout: DEFAULT_TIMEOUT, force: true }),
          (node: any) => {
            node.value = '';
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('change', { bubbles: true }));
          }
        );
        break;
      }

      case 'HOVER':
        await (await getSmartLocator()).hover({ timeout: DEFAULT_TIMEOUT, force: true });
        break;

      case 'HIGHLIGHT': {
        const locator = await getSmartLocator({ skipActionabilityCheck: true });
        await locator.evaluate(async (node: HTMLElement) => {
          if (node.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          await new Promise(r => setTimeout(r, 100));

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

      case 'SCROLL_TO': {
        const locator = await getSmartLocator();
        await locator.scrollIntoViewIfNeeded({ timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'CHECK': {
        const locator = await getSmartLocator();
        await locator.check({ timeout: DEFAULT_TIMEOUT, force: true });
        break;
      }

      case 'UNCHECK': {
        const locator = await getSmartLocator();
        await locator.uncheck({ timeout: DEFAULT_TIMEOUT, force: true });
        break;
      }

      case 'TOGGLE': {
        const locator = await getSmartLocator();
        const isChecked = await locator.isChecked();
        if (isChecked) {
          await locator.uncheck({ timeout: DEFAULT_TIMEOUT, force: true });
        } else {
          await locator.check({ timeout: DEFAULT_TIMEOUT, force: true });
        }
        break;
      }

      case 'SELECT_OPTION': {
        if (data === undefined) throw new Error('Data is required for SELECT_OPTION step');
        const locator = await getSmartLocator();
        await locator.selectOption(data, { timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'PRESS_KEY':
        if (data) {
          // If there's a target element, focus it first
          if (step.target && resolvedSelector) {
            const locator = await getSmartLocator();
            await locator.focus({ timeout: DEFAULT_TIMEOUT });
          }
          await this.page.keyboard.press(data);
        } else if (resolvedSelector) {
          await this.page.keyboard.press(resolvedSelector);
        } else {
          throw new Error('Either data (key name) or target (element) is required for PRESS_KEY step');
        }
        break;

      case 'ASSERT_VISIBLE': {
        const locator = await getSmartLocator();
        assertionDetails = { expected: 'VISIBLE', actual: 'VISIBLE', target: resolvedSelector };
        try {
          await locator.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
        } catch (e: any) {
          assertionDetails.actual = 'HIDDEN/MISSING';
          e.assertionDetails = assertionDetails;
          throw e;
        }
        break;
      }

      case 'ASSERT_INVISIBLE': {
        const locator = await getSmartLocator();
        assertionDetails = { expected: 'HIDDEN', actual: 'HIDDEN', target: resolvedSelector };
        try {
          await locator.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT });
        } catch (e: any) {
          assertionDetails.actual = 'VISIBLE';
          e.assertionDetails = assertionDetails;
          throw e;
        }
        break;
      }

      case 'ASSERT_DISABLED': {
        const locator = await getSmartLocator();
        const isDisabled = await locator.isDisabled({ timeout: DEFAULT_TIMEOUT });
        assertionDetails = { expected: 'DISABLED', actual: isDisabled ? 'DISABLED' : 'ENABLED', target: resolvedSelector };
        if (!isDisabled) {
          const err = new Error(`Assertion failed: Expected element to be DISABLED, but it is ENABLED`);
          (err as any).assertionDetails = assertionDetails;
          throw err;
        }
        break;
      }

      case 'ASSERT_TEXT':
        if (data === undefined) throw new Error('Data is required for ASSERT_TEXT step');
        {
          const locator = await getSmartLocator();
          const text = await locator.textContent({ timeout: DEFAULT_TIMEOUT }) || '';
          assertionDetails = { expected: `CONTAINS '${data}'`, actual: text, target: resolvedSelector };
          if (!text.includes(data)) {
            const err = new Error(`Assertion failed: Expected text to CONTAINS '${data}', but got '${text}'`);
            (err as any).assertionDetails = assertionDetails;
            throw err;
          }
        }
        break;

      case 'ASSERT_VALUE':
        if (data === undefined) throw new Error('Data is required for ASSERT_VALUE step');
        {
          const locator = await getSmartLocator();
          const val = await locator.inputValue({ timeout: DEFAULT_TIMEOUT });
          assertionDetails = { expected: `EQUALS '${data}'`, actual: val, target: resolvedSelector };
          if (val !== data) {
            const err = new Error(`Assertion failed: Expected value EQUALS '${data}', but got '${val}'`);
            (err as any).assertionDetails = assertionDetails;
            throw err;
          }
        }
        break;

      case 'ASSERT_URL':
        if (data === undefined) throw new Error('Data (expected URL) is required for ASSERT_URL step');
        {
          const currentUrl = this.page.url();
          assertionDetails = { expected: `CONTAINS '${data}'`, actual: currentUrl };
          if (!currentUrl.includes(data) && currentUrl !== data) {
            const err = new Error(`Assertion failed: Expected URL to CONTAINS '${data}', but got '${currentUrl}'`);
            (err as any).assertionDetails = assertionDetails;
            throw err;
          }
        }
        break;

      case 'ASSERT_TITLE':
        if (data === undefined) throw new Error('Data (expected title) is required for ASSERT_TITLE step');
        {
          const title = await this.page.title();
          assertionDetails = { expected: `CONTAINS '${data}'`, actual: title };
          if (!title.includes(data)) {
            const err = new Error(`Assertion failed: Expected title to CONTAINS '${data}', but got '${title}'`);
            (err as any).assertionDetails = assertionDetails;
            throw err;
          }
        }
        break;

      case 'EXTRACT_VAR':
        if (!data) throw new Error('Data (variable key) is required for EXTRACT_VAR step');
        {
          const locator = await getSmartLocator({ skipActionabilityCheck: true });
          const text = await locator.textContent({ timeout: DEFAULT_TIMEOUT });
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

      case 'SWITCH_TO_WINDOW': {
        const target = data || resolvedSelector;
        if (!target) throw new Error('Target URL or title is required for SWITCH_TO_WINDOW step');
        if (this.context) {
          const pages = this.context.pages();
          let found = false;
          for (const page of pages) {
            const url = page.url();
            const title = await page.title();
            if (url.includes(target) || url === target || title.includes(target)) {
              this.page = page;
              found = true;
              break;
            }
          }
          if (!found) {
            throw new Error(`Window with URL or title matching "${target}" not found`);
          }
        }
        break;
      }

      case 'SWITCH_TO_FRAME': {
        if (!resolvedSelector) throw new Error('Frame selector is required for SWITCH_TO_FRAME step');
        const locator = await getSmartLocator();
        const frameElement = await locator.elementHandle({ timeout: DEFAULT_TIMEOUT });
        if (!frameElement) throw new Error(`Frame element not found: ${resolvedSelector}`);
        const frame = await frameElement.contentFrame();
        if (!frame) throw new Error(`Could not access frame content: ${resolvedSelector}`);
        this.page = frame as any;
        break;
      }

      case 'ACCEPT_ALERT':
        // Set up dialog handler for next dialog
        if (this.dialogHandler) {
          this.page.off('dialog', this.dialogHandler);
        }
        this.dialogHandler = async (dialog) => {
          await dialog.accept(data || '');
        };
        this.page.once('dialog', this.dialogHandler);
        break;

      case 'DISMISS_ALERT':
        // Set up dialog handler for next dialog
        if (this.dialogHandler) {
          this.page.off('dialog', this.dialogHandler);
        }
        this.dialogHandler = async (dialog) => {
          await dialog.dismiss();
        };
        this.page.once('dialog', this.dialogHandler);
        break;

      case 'ATTACH_FILE': {
        if (!data) throw new Error('Data (file path) is required for ATTACH_FILE step');
        const locator = await getSmartLocator();
        const filePaths = data.split(',').map(p => p.trim());
        await locator.setInputFiles(filePaths, { timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'DRAG_AND_DROP': {
        if (!data) throw new Error('Data (target selector) is required for DRAG_AND_DROP step');
        const sourceLocator = await getSmartLocator();

        // Also wait for target element
        const targetLocator = this.page!.locator(data);
        await targetLocator.first().waitFor({ state: 'attached', timeout: DEFAULT_TIMEOUT });

        await sourceLocator.dragTo(targetLocator, { timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'UPLOAD_FILE': {
        // Alias for ATTACH_FILE for backward compatibility
        if (!data) throw new Error('Data (file path) is required for UPLOAD_FILE step');
        const locator = await getSmartLocator();
        const filePaths = data.split(',').map(p => p.trim());
        await locator.setInputFiles(filePaths, { timeout: DEFAULT_TIMEOUT });
        break;
      }

      case 'UI_EXTRACT':
        // Do nothing, just wait for the element if there is a target
        if (resolvedSelector) {
           await getSmartLocator({ skipActionabilityCheck: true });
        }
        break;

      default:
        throw new Error(`Unsupported UI action: ${step.action}`);
      }
    })();

    if (waitPromise) {
      try {
        const [apiResponse] = await Promise.all([waitPromise, actionPromise]);
        
        let responseText: string | undefined;
        try { responseText = await apiResponse.text(); } catch (e) { /* ignore */ }

          // Process Assertions if any
          if (step.waitForNetwork?.assertions && step.waitForNetwork.assertions.length > 0) {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(apiResponse.headers())) {
              headers[key] = value;
            }
            const results = evaluateAssertions({
              body: responseText || '',
              headers,
              status: apiResponse.status(),
            }, step.waitForNetwork.assertions);
            
            results.forEach(res => {
              const { assertion, actualValue, passed, message } = res;
              const source = assertion.source;
              const expr = assertion.expression ? ` ${assertion.expression}` : '';
              const op = assertion.operator;
              
              const expectedStr = assertion.expectedValue !== undefined ? `Expected: '${assertion.expectedValue}'` : '';
              const actualStr = actualValue !== undefined ? `Actual: '${typeof actualValue === 'object' ? JSON.stringify(actualValue) : actualValue}'` : '';
              const detailParts = [expectedStr, actualStr].filter(Boolean);
              const logSuffix = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';

              if (passed) {
                logs.push({
                  status: 'PASS',
                  level: 'success',
                  message: `    ✅ Smart Wait Assertion Passed: [${source}]${expr} ${op}${logSuffix}`
                });
              } else {
                const isMismatch = message.includes('Expected') && message.includes('but got');
                const errorDetail = isMismatch ? '' : ` — ${message}`;
                logs.push({
                  status: 'FAIL',
                  level: 'error',
                  message: `    ❌ Smart Wait Assertion Failed: [${source}]${expr} ${op}${logSuffix}${errorDetail}`
                });
              }
            });
          }

        // Process API Extractors if any
        if (step.waitForNetwork?.extractors && step.waitForNetwork.extractors.length > 0) {
          let responseBody: any;
          let jsonParsed = false;
          
          try { 
            if (responseText) {
              responseBody = JSON.parse(responseText); 
              jsonParsed = true;
            }
          } catch (e) { 
            if (responseText && responseText.trim().startsWith('<')) {
              try {
                const { XMLParser } = require('fast-xml-parser');
                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
                responseBody = parser.parse(responseText);
                jsonParsed = true;
              } catch (xmlErr) {
                // ignore
              }
            }
          }

          for (const ext of step.waitForNetwork.extractors) {
            if (!ext.name) continue;
            let extVal: string | undefined;

            try {
              if ((ext.source === 'API_BODY_JSON' || ext.source === 'API_BODY_XML') && jsonParsed && responseBody && ext.expression) {
                const result = JSONPath({ path: ext.expression, json: responseBody });
                extVal = result && result.length > 0 ? String(result[0]) : undefined;
              } else if (ext.source === 'API_BODY_REGEX' && responseText && ext.expression) {
                const match = new RegExp(ext.expression).exec(responseText);
                if (match && match[1]) {
                  extVal = match[1];
                } else if (match && match[0]) {
                  extVal = match[0];
                }
              } else if (ext.source === 'API_HEADER' && ext.expression) {
                const headers = apiResponse.headers();
                extVal = headers[ext.expression.toLowerCase()];
              }

            if (extVal !== undefined) {
              executionContext.setRuntimeVar(ext.name, extVal, ext.scope);
              if (ext.scope === 'ENVIRONMENT') {
                const currentVars = environmentRepository.getVariables(environment);
                currentVars[ext.name] = extVal;
                environmentRepository.updateVariables(environment, currentVars);
              }
              if (!extractedValue) extractedValue = extVal;
              
              logs.push({
                status: 'INFO',
                level: 'info',
                message: `    📥 Smart Wait Extracted Variable: ${ext.name} = ${extVal.length > 50 ? extVal.substring(0, 50) + '...' : extVal}`
              });
            } else {
              logs.push({
                status: 'WARN',
                level: 'warn',
                message: `    ⚠️ Smart Wait Extractor failed to find value for: ${ext.name}`
              });
            }
            } catch (err) {
              console.error(`Network Extractor ${ext.name} failed:`, err);
              logs.push({
                status: 'WARN',
                level: 'warn',
                message: `    ⚠️ Smart Wait Extractor error for ${ext.name}: ${err instanceof Error ? err.message : String(err)}`
              });
            }
          }
        }
      } catch (error: any) {
        if (error.message.includes('Timeout') || error.name === 'TimeoutError') {
          throw new Error(`UI Action executed, but expected API (${step.waitForNetwork.urlPattern}) did not respond or status did not match within ${step.waitForNetwork.timeoutMs || 10000}ms.`);
        }
        throw error;
      }
    } else {
      await actionPromise;
    }

    // ─── Process Extractors ───
    if (step.extractors && step.extractors.length > 0) {
      for (const extractor of step.extractors) {
        if (!extractor.name) continue;
        let extVal: string | undefined;

        try {
          if (extractor.source === 'UI_PAGE_URL') {
            extVal = this.page.url();
          } else if (extractor.source === 'UI_PAGE_TITLE') {
            extVal = await this.page.title();
          } else {
            // For element-based extractors, we need a target
            if (!resolvedSelector) {
              console.warn(`Extractor ${extractor.name} requires a target element.`);
              continue;
            }
            const locator = await getSmartLocator({ skipActionabilityCheck: true });
            
            if (extractor.source === 'UI_TEXT') {
              extVal = await locator.textContent({ timeout: DEFAULT_TIMEOUT }) || undefined;
            } else if (extractor.source === 'UI_VALUE') {
              extVal = await locator.inputValue({ timeout: DEFAULT_TIMEOUT });
            } else if (extractor.source === 'UI_ATTRIBUTE' && extractor.expression) {
              extVal = await locator.getAttribute(extractor.expression, { timeout: DEFAULT_TIMEOUT }) || undefined;
            }
          }

          if (extVal !== undefined) {
            executionContext.setRuntimeVar(extractor.name, extVal, extractor.scope);
            if (extractor.scope === 'ENVIRONMENT') {
              const currentVars = environmentRepository.getVariables(environment);
              currentVars[extractor.name] = extVal;
              environmentRepository.updateVariables(environment, currentVars);
            }
            // If it's the only extractor and we don't have extractedValue yet, set it for the result
            if (!extractedValue) extractedValue = extVal;
            
            logs.push({
              status: 'INFO',
              level: 'info',
              message: `  📥 Extracted Variable: ${extractor.name} = ${extVal.length > 50 ? extVal.substring(0, 50) + '...' : extVal}`
            });
          } else {
            logs.push({
              status: 'WARN',
              level: 'warn',
              message: `  ⚠️ Extractor failed to find value for: ${extractor.name}`
            });
          }
        } catch (err) {
          console.error(`UI Extractor ${extractor.name} failed:`, err);
          logs.push({
            status: 'WARN',
            level: 'warn',
            message: `  ⚠️ Extractor error for ${extractor.name}: ${err instanceof Error ? err.message : String(err)}`
          });
        }
      }
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
      assertionDetails,
      logs,
    };
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) return '';
    try {
      const buffer = await this.page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY });
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (e) {
      console.error('Screenshot failed:', e);
      return '';
    }
  }

  async captureStateScreenshot(): Promise<string> {
    return this.takeScreenshot();
  }

  async cleanup(): Promise<void> {
    try {
      // Remove dialog handler if exists
      if (this.dialogHandler && this.page) {
        this.page.off('dialog', this.dialogHandler);
        this.dialogHandler = null;
      }

      if (this.page) {
        await this.page.close().catch(() => { });
      }
      if (this.context) {
        await this.context.close().catch(() => { });
      }
      if (this.browser) {
        await this.browser.close().catch(() => { });
      }
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}
