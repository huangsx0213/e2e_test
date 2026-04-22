import { chromium, Browser, Page, selectors } from 'playwright';

// Configure common test-id attributes globally
try {
  selectors.setTestIdAttribute('data-test');
} catch(e) {}

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

async function generateSmartSelector(page: Page, targetHtml: string, ariaInfo: { role: string, name: string } | null): Promise<{ name: string, selectorType: string, value: string, isVerified: boolean, locators: { selectorType: string, value: string }[] }> {
  const candidates: { type: string, value: any, options?: any, nameHint?: string }[] = [];

  // 1. Role Locator (🥇 Highest priority)
  if (ariaInfo && ariaInfo.role) {
    // Priority 1a: Exact match
    candidates.push({ 
      type: 'getByRole', 
      value: ariaInfo.role, 
      options: { name: ariaInfo.name, exact: true }, 
      nameHint: ariaInfo.name 
    });
    // Priority 1b: Fuzzy match
    candidates.push({ 
      type: 'getByRole', 
      value: ariaInfo.role, 
      options: { name: ariaInfo.name, exact: false }, 
      nameHint: ariaInfo.name 
    });
  }

  // 2. Test ID (🥈 High quality)
  const testIdMatch = targetHtml.match(/data-(?:test|testid|qa)=["']([^"']+)["']/i);
  if (testIdMatch) {
    candidates.push({ type: 'getByTestId', value: testIdMatch[1], nameHint: testIdMatch[1] });
  }

  // 3. ID (🥉 Reliable if exists)
  const idMatch = targetHtml.match(/id=["']([^"']+)["']/i);
  if (idMatch && !idMatch[1].match(/^\d+$/)) { // Avoid numeric auto-gen IDs
    candidates.push({ type: 'CSS', value: `#${idMatch[1]}`, nameHint: idMatch[1] });
  }

  // 4. Text (🥉 Fallback)
  if (ariaInfo && ariaInfo.name && ariaInfo.name.length > 2 && ariaInfo.name.length < 50) {
    candidates.push({ type: 'getByText', value: ariaInfo.name, options: { exact: true }, nameHint: ariaInfo.name });
  }

  const validate = async () => {
    const validLocs: { selectorType: string, value: string, name: string }[] = [];
    await Promise.all(candidates.map(async (cand) => {
      try {
        let locator: any;
        let finalValue: string;

        if (cand.type === 'getByRole') {
          locator = page.getByRole(cand.value, cand.options);
          const optsJson = JSON.stringify(cand.options).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
          finalValue = `${cand.value}, ${optsJson}`;
        } else if (cand.type === 'getByTestId') {
          locator = page.getByTestId(cand.value);
          finalValue = cand.value;
        } else if (cand.type === 'getByText') {
          locator = page.getByText(cand.value, cand.options);
          finalValue = cand.value;
        } else {
          locator = page.locator(cand.value);
          finalValue = cand.value;
        }

        const count = await locator.count();
        const isVisible = count === 1 ? await locator.isVisible().catch(() => false) : false;
        
        console.log(`[Validator] Cand: ${cand.type} Value: ${cand.value} Count: ${count} Visible: ${isVisible}`);
        
        if (count === 1) {
          validLocs.push({ 
            selectorType: cand.type, 
            value: finalValue, 
            name: cand.nameHint || 'Element' 
          });
          
          // Visual Feedback: Pulse the element
          if (isVisible) {
            await locator.evaluate((node: HTMLElement) => {
              const original = node.style.outline;
              const originalTransition = node.style.transition;
              node.style.transition = 'outline 0.1s ease-in-out';
              node.style.outline = '4px solid #3b82f6';
              node.style.outlineOffset = '2px';
              setTimeout(() => {
                node.style.outline = original;
                node.style.outlineOffset = '0px';
                node.style.transition = originalTransition;
              }, 400);
            }).catch(() => {});
          }
        }
      } catch (e) {}
    }));
    return validLocs;
  };

  // Attempt to validate in live DOM
  let results = await validate();

  // Retry logic for unstable/transitory states
  if (results.length === 0) {
    await new Promise(r => setTimeout(r, 60)); // slightly longer wait
    results = await validate();
  }

  if (results.length > 0) {
     // Pick the highest priority match from our candidates list
     for (const cand of candidates) {
        let val = String(cand.value);
        if (cand.type === 'getByRole' && cand.options) {
           const optsJson = JSON.stringify(cand.options).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
           val = `${cand.value}, ${optsJson}`;
        }
        const match = results.find(r => r.selectorType === cand.type && r.value === val);
        if (match) {
           return { 
             ...match, 
             isVerified: true,
             locators: results.map(r => ({ selectorType: r.selectorType, value: r.value })) 
           };
        }
     }
  }

  // Final Fallback: Trust the Highest Priority Candidate even if validation failed (due to page navigation)
  const bestFallback = candidates[0]; 
  let fallbackValue = String(bestFallback.value);
  if (bestFallback.type === 'getByRole' && bestFallback.options) {
      const optsJson = JSON.stringify(bestFallback.options).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
      fallbackValue = `${bestFallback.value}, ${optsJson}`;
  }
  
  console.log(`[Validator] ⚠️ Blind Fallback used: ${bestFallback.type} -> ${fallbackValue}`);
  return { 
    name: bestFallback.nameHint || 'RecordedElement', 
    selectorType: bestFallback.type, 
    value: fallbackValue,
    isVerified: false,
    locators: [{ selectorType: bestFallback.type, value: fallbackValue }]
  };
}

export async function startRecording(
  targetUrl: string, 
  projectId: string, 
  apiFilter: string | undefined,
  onElementRecorded: (element: any) => void,
  onStepRecorded?: (stepInfo: any) => void,
  onApiRecorded?: (apiInfo: any) => void,
  onRecorderStateChanged?: (state: { isPaused: boolean, mode: string }) => void
) {
  if (activeBrowser) {
    await stopRecording();
  }

  const isHeadless = process.env.HEADLESS === 'true';
  activeBrowser = await chromium.launch({ 
    headless: isHeadless,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      ...(isHeadless ? [] : ['--start-maximized'])
    ] 
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
        locators: selectorData.locators,
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

  await activePage.exposeFunction('onStepRecordedAction', async (action: string, targetHtml: string, contextHtml: string, pageUrl: string, ariaInfo: any, dataValue: any) => {
    try {
      if (!activePage) return { success: false };
      const selectorData = await generateSmartSelector(activePage, targetHtml, ariaInfo);
      
      const tagMatch = targetHtml.match(/^<([a-zA-Z0-9-]+)/);
      const tagName = tagMatch ? tagMatch[1].toUpperCase() : 'ELEMENT';
      const idMatch = targetHtml.match(/id=["']([^"']+)["']/);
      const testIdMatch = targetHtml.match(/data-test(?:id)?=["']([^"']+)["']/);

      let desc = `[${tagName}]`;
      if (ariaInfo?.role) desc += ` Role: ${ariaInfo.role}`;
      if (ariaInfo?.name) desc += ` Name: "${ariaInfo.name}"`;
      if (idMatch) desc += ` ID: #${idMatch[1]}`;
      if (testIdMatch) desc += ` TestID: ${testIdMatch[1]}`;

      const elementData = {
        id: `el-${Date.now()}`,
        name: selectorData.name || 'RecordedElement',
        selectorType: selectorData.selectorType,
        value: selectorData.value,
        locators: selectorData.locators,
        description: desc,
        originalHtml: targetHtml,
        pageUrl: pageUrl,
      };

      console.log(`✨ [Recorder] Captured Step: ${action} on ${selectorData.selectorType}:${selectorData.value}`);
      if (onStepRecorded) {
        await onStepRecorded({
           action,
           element: elementData,
           dataValue
        });
      }
      return { success: true };
    } catch (error) {
      console.error('❌ [Recorder] Failed to capture step:', error);
      return { success: false };
    }
  });

  let recorderState = { isPaused: true, mode: 'ui', started: false, action: 'INIT' } as any;
  await activePage.exposeFunction('onRecorderStateChanged', (state: { isPaused: boolean, mode: string, started?: boolean, action?: string }) => {
    recorderState = { ...recorderState, ...state };
    console.log(`[Recorder] State updated: ${JSON.stringify(state)}`);
    if (onRecorderStateChanged) {
      onRecorderStateChanged(recorderState);
    }
  });
  await activePage.exposeFunction('getInitialRecorderState', () => recorderState);
  await activePage.exposeFunction('onRecorderControl', async (action: 'STOP') => {
    if (action !== 'STOP') return;
    recorderState = { ...recorderState, isPaused: true, action: 'STOP' };
    console.log('[Recorder] Stop requested from toolbar');
    if (onRecorderStateChanged) {
      onRecorderStateChanged(recorderState);
    }
    await stopRecording();
  });

  if (onApiRecorded && activePage) {
    activePage.on('requestfinished', async (req) => {
      try {
        if (recorderState.isPaused || recorderState.mode !== 'api') return;
        
        console.log(`[Recorder] Intercepted: ${req.method()} ${req.url()}`);
        
        if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') {
           console.log(`[Recorder] Ignored (Not XHR/Fetch): ${req.resourceType()}`);
           return;
        }
        
        if (req.method() === 'OPTIONS') {
           console.log(`[Recorder] Ignored (OPTIONS)`);
           return;
        }
        
        let targetOrigin = '';
        let pageOrigin = '';
        try {
           targetOrigin = new URL(req.url()).origin;
           pageOrigin = new URL(activePage!.url()).origin;
        } catch(e) {}
        
        // Same-origin constraint (unless apiFilter is specifically overriding it)
        if (targetOrigin && pageOrigin && targetOrigin !== pageOrigin && !apiFilter) {
           console.log(`[Recorder] Ignored (Cross-Origin): Target=${targetOrigin}, Page=${pageOrigin}`);
           return;
        }

        const url = req.url();
        if (apiFilter) {
          const trimmedFilter = apiFilter.trim();
          // Escape regex characters except *, then convert * to .*
          const regexStr = trimmedFilter.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          const regex = new RegExp(regexStr, 'i');
          if (!regex.test(url)) {
             console.log(`[Recorder] Ignored (No match for "${trimmedFilter}"): ${url}`);
             return;
          }
        }
        
        const response = await req.response();
        const status = response ? response.status() : 0;
        
        // Only record completed responses, ignoring pre-flight failures or aborts
        if (status === 0) {
           console.log(`[Recorder] Ignored (Status 0 / Failed)`);
           return;
        }

        const headers = await req.allHeaders();
        let postData = req.postData();
        
        console.log(`[Recorder] ✨ API Captured: ${status} ${req.method()} ${url}`);
        
        onApiRecorded({
           url,
           method: req.method(),
           headers,
           postData,
           status
        });
      } catch (err) {
         console.warn('[Recorder] Warning processing API response:', err);
      }
    });
  }

  // Inject the Local Inspector script with Right-Click Recording and UI Tracker
  await activePage.addInitScript(`
    (async function() {
      console.log('[Recorder] Unified Tracker injected');
      
      // Initialize with backend state if available, otherwise default
      window.__recorderState = { isPaused: true, mode: 'ui', started: false };
      if (window.getInitialRecorderState) {
         try {
            const saved = await window.getInitialRecorderState();
            if (saved) window.__recorderState = { isPaused: true, mode: 'ui', started: false, ...saved };
         } catch(e) {}
      }
      
      let badge = null;
      let toolbar = null;

      const notifyState = () => {
         if (window.onRecorderStateChanged) {
            window.onRecorderStateChanged(window.__recorderState);
         }
      };

      const renderToolbar = () => {
         if (!toolbar) return;
         
          const isPaused = window.__recorderState.isPaused;
          const started = !!window.__recorderState.started;
          const mode = window.__recorderState.mode;

         toolbar.innerHTML = \`
            <div style="font-weight:bold; color:white; font-size:14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
               Action Recorder
               <div style="width:8px; height:8px; border-radius:50%; background:\${!isPaused ? '#ef4444' : '#64748b'}; box-shadow: \${!isPaused ? '0 0 8px #ef4444' : 'none'}; transition: all 0.3s ease;"></div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px;">
               <div>
                  <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:2px;">Recording Mode</label>
                  <select id="record-mode-select" style="width:100%; padding:6px; font-size:12px; background:#334155; color:white; border:1px solid #475569; border-radius:4px; outline:none; cursor:pointer;" \${!isPaused ? 'disabled' : ''}>
                     <option value="ui" \${mode === 'ui' ? 'selected' : ''}>💻 UI Steps</option>
                     <option value="api" \${mode === 'api' ? 'selected' : ''}>🌐 API Requests</option>
                     <option value="element" \${mode === 'element' ? 'selected' : ''}>📦 Elements Only</option>
                  </select>
               </div>
               
                <div style="display:flex; gap:8px; margin-top:4px;">
                   <button id="btn-record-primary" style="flex:1; padding:6px; background:\${isPaused ? '#10b981' : '#f59e0b'}; color:white; border:none; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">
                      \${isPaused ? (started ? '▶ Resume' : '▶ Start') : '⏸ Pause'}
                   </button>
                   <button id="btn-record-stop" style="flex:1; padding:6px; background:#ef4444; color:white; border:none; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">⏹ Stop</button>
                </div>
            </div>
         \`;

         const select = toolbar.querySelector('#record-mode-select');
         if (select) {
            select.addEventListener('change', (e) => {
               window.__recorderState.mode = e.target.value;
               notifyState();
            });
         }

          const btnPrimary = toolbar.querySelector('#btn-record-primary');
          if (btnPrimary) {
             btnPrimary.addEventListener('click', () => {
                if (window.__recorderState.isPaused) {
                   window.__recorderState.isPaused = false;
                   window.__recorderState.started = true;
                   window.__recorderState.action = 'START';
                } else {
                   window.__recorderState.isPaused = true;
                   window.__recorderState.started = true;
                   window.__recorderState.action = 'PAUSE';
                }
                notifyState();
                renderToolbar();
                if (badge) badge.style.display = window.__recorderState.isPaused ? 'none' : (window.__recorderState.mode === 'element' ? 'block' : 'none');
             });
          }

          const btnStop = toolbar.querySelector('#btn-record-stop');
          if (btnStop) {
             btnStop.addEventListener('click', () => {
                if (window.onRecorderControl) {
                   window.onRecorderControl('STOP');
                }
             });
          }
      };

      const ensureUI = () => {
        if (!document.body && !document.documentElement) {
           setTimeout(ensureUI, 100);
           return;
        }
        
        let container = document.body || document.documentElement;

        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'recorder-badge';
          badge.innerText = 'Right-Click an element to Record';
          badge.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #10b981; padding: 10px 20px; border-radius: 30px; font-weight: bold; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 4px 10px rgba(0,0,0,0.3); pointer-events: none; border: 1px solid #10b981; display: none;';
          container.appendChild(badge);
        } else if (!container.contains(badge)) {
          container.appendChild(badge);
        }
        
        if (!toolbar) {
          toolbar = document.createElement('div');
          toolbar.id = 'recorder-toolbar';
          toolbar.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #1e293b; color: white; padding: 12px; border-radius: 8px; font-family: sans-serif; z-index: 2147483647; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: 1px solid #334155; opacity: 0.95; min-width: 220px;';
          container.appendChild(toolbar);
          renderToolbar();
          notifyState();
        } else if (!container.contains(toolbar)) {
          container.appendChild(toolbar);
        }
      };

      // Continuously ensure UI is present in case of SPA navigations or lazy loading
      setInterval(ensureUI, 1000);

      // PRIMARY ACTION: Right Click to Record
      document.addEventListener('contextmenu', async (e) => {
        if (window.__recorderState.isPaused || window.__recorderState.mode !== 'element') return;
        const target = e.target;
        if (target && target instanceof HTMLElement) {
          e.preventDefault(); 
          e.stopPropagation();



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
      
      const cleanNode = (node) => {
        const clone = node.cloneNode(false);
        clone.removeAttribute('style');
        const text = node.textContent?.trim() || '';
        if (text) {
           clone.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
        }
        return clone;
      };

      const isInteractive = (el) => {
        const tag = el.tagName.toLowerCase();
        return ['button', 'a', 'input', 'select', 'textarea'].includes(tag) || 
               el.getAttribute('role') === 'button' || 
               el.hasAttribute('tabindex');
      };

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

      // 2. Left Click to Record Step
      document.addEventListener('click', async (e) => {
        if (e.target.closest('#recorder-toolbar') || e.target.closest('#recorder-badge')) return;
        
        if (window.__recorderState.isPaused || window.__recorderState.mode !== 'ui') return;
        
        const target = e.target.closest('button, a, input, select, textarea, [role="button"], [tabindex]') || e.target;
        
        if (target && target instanceof HTMLElement && isInteractive(target)) {
           // To avoid triggering on input focus where they will TYPE anyway
           if (['input', 'textarea'].includes(target.tagName.toLowerCase()) && target.type !== 'submit' && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio') {
             return;
           }

           const ariaInfo = getAriaInfo(target);
           const targetHtml = cleanNode(target).outerHTML;
           let contextHtml = targetHtml;
           if (target.parentElement) {
             const parentClone = cleanNode(target.parentElement);
             parentClone.innerHTML = '\\n  ' + targetHtml + '\\n';
             contextHtml = parentClone.outerHTML;
           }

           const pageUrl = window.location.href;
           let action = 'CLICK';
           if (target.tagName.toLowerCase() === 'input' && (target.type === 'checkbox' || target.type === 'radio')) {
             return; // let change event handle this
           }

           if (window.onStepRecordedAction) {
               console.log('[Browser] LOG: [Smart Recorder] ACTION: ' + action);
               window.onStepRecordedAction(action, targetHtml, contextHtml, pageUrl, ariaInfo, null);
           }
        }
      }, { capture: true });

      // Prevent empty duplicates by keeping track of the original value before changes
      document.addEventListener('focusin', async (e) => {
         if (window.__recorderState.isPaused || window.__recorderState.mode !== 'ui') return;
         if (e.target && e.target instanceof HTMLElement && ['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) {
            e.target._trackerOriginalValue = e.target.value || '';
         }
      }, { capture: true });

      // 3. Change capturing for Input/Select (use focusout for React compatibility)
      document.addEventListener('focusout', async (e) => {
        if (window.__recorderState.isPaused || window.__recorderState.mode !== 'ui') return;
        
        const target = e.target;
        if (target && target instanceof HTMLElement && ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())) {
           // Exclude buttons & non-text inputs from firing blur-based TYPE events
           if (target.tagName.toLowerCase() === 'input' && ['submit', 'button', 'image', 'reset', 'hidden', 'checkbox', 'radio'].includes(target.type)) {
              return;
           }

           const currentValue = target.value || '';
           if (target._trackerOriginalValue === currentValue) {
              return; // Filter out clicks through the field without modifying
           }
           target._trackerOriginalValue = currentValue; // update baseline

           const ariaInfo = getAriaInfo(target);
           const targetHtml = cleanNode(target).outerHTML;
           let contextHtml = targetHtml;
           if (target.parentElement) {
             const parentClone = cleanNode(target.parentElement);
             parentClone.innerHTML = '\\n  ' + targetHtml + '\\n';
             contextHtml = parentClone.outerHTML;
           }
           const pageUrl = window.location.href;
           
           let value = target.value;
           let action = target.tagName.toLowerCase() === 'select' ? 'SELECT_OPTION' : 'TYPE';
           
           if (window.onStepRecordedAction) {
               console.log('[Browser] LOG: [Smart Recorder] ACTION: ' + action);
               window.onStepRecordedAction(action, targetHtml, contextHtml, pageUrl, ariaInfo, value);
           }
        }
      }, { capture: true });

      // Auto-show guide badge
      setTimeout(ensureUI, 1000);
      console.log('[Recorder] Initialization complete. Right-Click to record elements, Left-Click to record steps.');
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
