import { chromium, Browser, Page } from 'playwright';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

async function generateSmartSelector(page: Page, targetHtml: string, ariaInfo: { role: string, name: string } | null): Promise<{ name: string, selectorType: string, value: string }> {
  const candidates: { type: string, value: any, options?: any, nameHint?: string }[] = [];

  // 1. Role Locator (🥇 Highest priority)
  if (ariaInfo?.role) {
    if (ariaInfo.name && ariaInfo.name.length < 60) {
      candidates.push({ 
        type: 'getByRole', 
        value: ariaInfo.role, 
        options: { name: ariaInfo.name, exact: true }, 
        nameHint: ariaInfo.name 
      });
    } else {
      candidates.push({ type: 'getByRole', value: ariaInfo.role, nameHint: ariaInfo.role });
    }
  }

  // Extract attributes for fallback heuristics
  const testIdMatch = targetHtml.match(/data-testid=["']([^"']+)["']/) || targetHtml.match(/data-test=["']([^"']+)["']/);
  const idMatch = targetHtml.match(/id=["']([^"']+)["']/);
  const textContent = targetHtml.match(/>([^<]+)</)?.[1]?.trim();

  // 2. Test ID (🥈)
  if (testIdMatch) candidates.push({ type: 'getByTestId', value: testIdMatch[1], nameHint: testIdMatch[1] });

  // 3. CSS ID (🥉)
  if (idMatch) candidates.push({ type: 'CSS', value: `#${idMatch[1]}`, nameHint: idMatch[1] });

  // 4. Text Content
  if (textContent && textContent.length > 0 && textContent.length < 50) {
    candidates.push({ type: 'getByText', value: textContent, nameHint: textContent.replace(/\s+/g, '') });
  }

  // 5. Validation loop
  for (const cand of candidates) {
    try {
      let locator;
      switch (cand.type) {
        case 'getByRole': locator = page.getByRole(cand.value as any, cand.options); break;
        case 'getByTestId': locator = page.getByTestId(cand.value); break;
        case 'getByText': locator = page.getByText(cand.value, { exact: true }); break;
        case 'CSS': locator = page.locator(cand.value); break;
        default: locator = page.locator(cand.value);
      }

      const count = await locator.count();
      if (count === 1) {
        let finalValue = String(cand.value);
        if (cand.type === 'getByRole' && cand.options) {
          const optsJson = JSON.stringify(cand.options).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
          finalValue = `${cand.value}, ${optsJson}`;
        }
        return { name: cand.nameHint || 'Element', selectorType: cand.type, value: finalValue };
      }
    } catch (e) { }
  }

  return { name: 'RecordedElement', selectorType: 'CSS', value: targetHtml.match(/^<([a-zA-Z0-9-]+)/)?.[1] || 'div' };
}

export async function startRecording(targetUrl: string, projectId: string, onElementRecorded: (element: any) => void) {
  if (activeBrowser) {
    await stopRecording();
  }

  activeBrowser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized', '--no-sandbox'] 
  });
  const context = await activeBrowser.newContext({ viewport: null });
  activePage = await context.newPage();

  // Silence noisy browser logs, only show critical logic errors or our specific recorder logs
  activePage.on('console', msg => {
    const text = msg.text();
    const isRecorderLog = text.includes('[Smart Recorder]');
    const isResourceError = text.includes('Failed to load resource') || text.includes('net::ERR_');
    
    // Only log if it's our recorder log OR it's a real error AND not just a network resource failure
    if (isRecorderLog || (msg.type() === 'error' && !isResourceError)) {
      console.log(`[Browser] ${msg.type().toUpperCase()}: ${text}`);
    }
  });

  // Expose function to be called from the browser
  await activePage.exposeFunction('onElementClicked', async (targetHtml: string, htmlContext: string, pageUrl: string, ariaInfo: any) => {
    try {
      if (!activePage) return { success: false };
      
      const selectorData = await generateSmartSelector(activePage, targetHtml, ariaInfo);

      // --- Meaningful Description Generation ---
      const tagMatch = targetHtml.match(/^<([a-zA-Z0-9-]+)/);
      const tagName = tagMatch ? tagMatch[1].toUpperCase() : 'ELEMENT';
      const idMatch = targetHtml.match(/id=["']([^"']+)["']/);
      const testIdMatch = targetHtml.match(/data-test(?:id)?=["']([^"']+)["']/);

      let desc = `[${tagName}]`;
      if (ariaInfo?.role) desc += ` Role: ${ariaInfo.role}`;
      if (ariaInfo?.name) desc += ` Name: "${ariaInfo.name}"`;
      if (idMatch) desc += ` ID: #${idMatch[1]}`;
      if (testIdMatch) desc += ` TestID: ${testIdMatch[1]}`;

      const newElement = {
        id: `el-${Date.now()}`,
        name: selectorData.name || 'RecordedElement',
        selectorType: selectorData.selectorType,
        value: selectorData.value,
        description: desc,
        originalHtml: targetHtml,
        pageUrl: pageUrl,
      };

      console.log(`✨ [Recorder] Captured: ${newElement.name} via ${newElement.selectorType} (${newElement.value})`);
      await onElementRecorded(newElement);
      return { success: true };
    } catch (error) {
      console.error('❌ [Recorder] Failed to capture element:', error);
      return { success: false };
    }
  });

  // Inject the Local Inspector script with Right-Click Recording
  await activePage.addInitScript(`
    (function() {
      console.log('[Recorder] Right-Click Recording script started');
      
      let badge = null;
      const ensureBadge = () => {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'recorder-badge';
          badge.innerText = 'Right-Click an element to Record';
          badge.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #10b981; padding: 10px 20px; border-radius: 30px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events: none; border: 1px solid #10b981;';
          
          if (document.body) {
            document.body.appendChild(badge);
          } else if (document.documentElement) {
            document.documentElement.appendChild(badge);
          }
        }
      };

      // PRIMARY ACTION: Right Click to Record
      document.addEventListener('contextmenu', async (e) => {
        const target = e.target;
        if (target && target instanceof HTMLElement) {
          e.preventDefault(); 
          e.stopPropagation();

          // Official ACCESSIBLE NAME / ROLE Calculation (Browser-Side)
          const getAriaInfo = (el) => {
            // 1. Get Role
            let role = el.getAttribute('role');
            if (!role) {
               const tag = el.tagName.toLowerCase();
               if (tag === 'button' || (tag === 'input' && (el.type === 'submit' || el.type === 'button'))) role = 'button';
               else if (tag === 'select') role = 'combobox';
               else if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) role = el.type;
               else if (tag === 'input' || tag === 'textarea') role = 'textbox';
               else if (tag === 'a') role = 'link';
               else if (tag === 'h1' || tag === 'h2' || tag === 'h3') role = 'heading';
            }

            // 2. Get Accessible Name (Simple implementation of the official spec)
            const name = el.innerText?.trim() || 
                         el.getAttribute('aria-label') || 
                         (el.placeholder) || 
                         (el.labels && el.labels[0]?.innerText?.trim()) || 
                         el.title || 
                         el.alt || 
                         el.value || '';
            
            return { role, name: name.substring(0, 100).trim() };
          };

          const ariaInfo = getAriaInfo(target);
          console.log('[Recorder] Right-Click detected. ARIA:', ariaInfo);
          
          const cleanNode = (node) => {
            const clone = node.cloneNode(false);
            clone.removeAttribute('style');
            const text = node.textContent?.trim() || '';
            if (text) {
               clone.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
            }
            return clone;
          }

          const targetHtml = cleanNode(target).outerHTML;
          let contextHtml = targetHtml;
          if (target.parentElement) {
            const parentClone = cleanNode(target.parentElement);
            parentClone.innerHTML = '\\n  ' + targetHtml + '\\n';
            contextHtml = parentClone.outerHTML;
          }

          const pageUrl = window.location.href;
          
          target.style.outline = '4px solid #10b981';
          target.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';

          try {
            await window.onElementClicked(targetHtml, contextHtml, pageUrl, ariaInfo);
            console.log('[Recorder] Element SUCCESS');
          } catch (err) {
            console.error('[Recorder] Element ERROR:', err);
            target.style.outline = '4px solid #ef4444';
          }
          
          setTimeout(() => {
            target.style.outline = '';
            target.style.backgroundColor = '';
          }, 1000);
        }
      }, { capture: true });
      
      // Auto-show guide badge
      setTimeout(ensureBadge, 1000);
      console.log('[Recorder] Initialization complete. Right-Click to record.');
    })();
  `);

  await activePage.goto(targetUrl);
}

export async function stopRecording() {
  if (activeBrowser) {
    await activeBrowser.close();
    activeBrowser = null;
    activePage = null;
  }
}
