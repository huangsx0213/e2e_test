import { chromium, Browser, Page, selectors } from 'playwright';
import { randomId } from '../../shared/utils/index.ts';

// Configure common test-id attributes globally
try {
  selectors.setTestIdAttribute('data-test');
} catch(e) {}

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

type SelectorCandidate = {
  type: string;
  value: any;
  options?: any;
  nameHint?: string;
};

type RichSnapshot = {
  tagName: string;
  html: string;
  contextHtml?: string;
  textContent?: string;
  pageUrl: string;
  aria: {
    role: string;
    name: string;
    describedBy?: string;
    labelledBy?: string;
    describedByText?: string;
    labelledByText?: string;
  };
  rect?: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, string>;
};

function normalizeRecordedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function buildSelectorCandidates(snapshot: RichSnapshot | null): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  if (!snapshot) {
    return candidates;
  }

  const targetHtml = snapshot.html;
  const ariaInfo = snapshot.aria;

  if (ariaInfo && ariaInfo.role) {
    candidates.push({
      type: 'getByRole',
      value: ariaInfo.role,
      options: { name: ariaInfo.name, exact: true },
      nameHint: ariaInfo.name,
    });
    candidates.push({
      type: 'getByRole',
      value: ariaInfo.role,
      options: { name: ariaInfo.name, exact: false },
      nameHint: ariaInfo.name,
    });
  }

  const testIdMatch = targetHtml.match(/data-(?:test|testid|qa)=["']([^"']+)["']/i);
  if (testIdMatch) {
    candidates.push({ type: 'getByTestId', value: testIdMatch[1], nameHint: testIdMatch[1] });
  }

  const idMatch = targetHtml.match(/id=["']([^"']+)["']/i);
  if (idMatch && !idMatch[1].match(/^\d+$/)) {
    candidates.push({ type: 'CSS', value: `#${idMatch[1]}`, nameHint: idMatch[1] });
  }

  if (ariaInfo && ariaInfo.name && ariaInfo.name.length > 2 && ariaInfo.name.length < 50) {
    candidates.push({ type: 'getByText', value: ariaInfo.name, options: { exact: true }, nameHint: ariaInfo.name });
  }

  if (snapshot.textContent && snapshot.textContent.length > 2 && snapshot.textContent.length < 50) {
    candidates.push({ type: 'getByText', value: snapshot.textContent, options: { exact: true }, nameHint: snapshot.textContent });
  }

  return candidates;
}

function formatCandidateValue(candidate: SelectorCandidate): string {
  if (candidate.type === 'getByRole' && candidate.options) {
    const optsJson = JSON.stringify(candidate.options).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
    return `${candidate.value}, ${optsJson}`;
  }

  return String(candidate.value);
}

function fallbackCandidate(candidates: SelectorCandidate[], snapshot: RichSnapshot | null) {
  if (candidates[0]) return candidates[0];

  const targetHtml = snapshot?.html || '';
  const tagMatch = targetHtml.match(/^<([a-zA-Z0-9-]+)/);
  return {
    type: 'CSS',
    value: tagMatch ? tagMatch[1].toLowerCase() : 'div',
    nameHint: 'RecordedElement',
  };
}

function buildElementDescription(snapshot: RichSnapshot): string {
  const attrs = snapshot.attributes || {};
  const testId = attrs['data-test'] || attrs['data-testid'] || attrs['data-qa'];

  let desc = `[${snapshot.tagName || 'ELEMENT'}]`;
  if (snapshot.aria?.role) desc += ` Role: ${snapshot.aria.role}`;
  if (snapshot.aria?.name) desc += ` Name: "${snapshot.aria.name}"`;
  if (attrs.id) desc += ` ID: #${attrs.id}`;
  if (testId) desc += ` TestID: ${testId}`;

  return desc;
}

async function generateSmartSelector(
  page: Page,
  snapshot: RichSnapshot | null,
  recordedPageUrl?: string,
): Promise<{ name: string, selectorType: string, value: string, isVerified: boolean, locators: { selectorType: string, value: string }[] }> {
  const candidates = buildSelectorCandidates(snapshot);

  const validate = async () => {
    const validLocs: { selectorType: string, value: string, name: string }[] = [];
    await Promise.all(candidates.map(async (cand) => {
      try {
        let locator: any;
        let finalValue: string;

        if (cand.type === 'getByRole') {
          locator = page.getByRole(cand.value, cand.options);
          finalValue = formatCandidateValue(cand);
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

  const shouldSkipLiveValidation = !!recordedPageUrl && normalizeRecordedUrl(page.url()) !== normalizeRecordedUrl(recordedPageUrl);

  if (shouldSkipLiveValidation) {
    const bestFallback = fallbackCandidate(candidates, snapshot);
    const fallbackValue = formatCandidateValue(bestFallback);
    console.log(`[Validator] ⚠️ Page changed before validation, using snapshot fallback: ${bestFallback.type} -> ${fallbackValue}`);
    return {
      name: bestFallback.nameHint || 'RecordedElement',
      selectorType: bestFallback.type,
      value: fallbackValue,
      isVerified: false,
      locators: [{ selectorType: bestFallback.type, value: fallbackValue }],
    };
  }

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
         let val = formatCandidateValue(cand);
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
  const bestFallback = fallbackCandidate(candidates, snapshot);
  const fallbackValue = formatCandidateValue(bestFallback);
  
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
  let lastNavigationUrl = '';
  let navigationBarrier: Promise<void> = Promise.resolve();

  const waitForNavigationBarrier = async () => {
    await navigationBarrier;
  };

  const setNavigationBarrier = (durationMs = 100) => {
    navigationBarrier = new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  };

  const buildNavigationSnapshot = (navigationUrl: string, action: 'PAGE_LOAD' | 'NAVIGATE', previousUrl: string | null): RichSnapshot => ({
    tagName: 'NAVIGATION',
    html: `<navigation url="${navigationUrl}"></navigation>`,
    contextHtml: `<navigation url="${navigationUrl}"></navigation>`,
    textContent: navigationUrl,
    pageUrl: navigationUrl,
    aria: {
      role: 'navigation',
      name: action === 'PAGE_LOAD' ? 'Page Load' : 'Navigation',
      describedBy: previousUrl || undefined,
      labelledBy: previousUrl || undefined,
    },
    rect: { x: 0, y: 0, width: 0, height: 0 },
    attributes: {
      url: navigationUrl,
      action,
      ...(previousUrl ? { previousUrl } : {}),
    },
  });

  const emitNavigationStep = async (navigationUrl: string, action: 'PAGE_LOAD' | 'NAVIGATE', previousUrl: string | null) => {
    if (!onStepRecorded) return;

    const snapshot = buildNavigationSnapshot(navigationUrl, action, previousUrl);
    await onStepRecorded({
      action,
      element: {
        id: randomId('el'),
        name: action === 'PAGE_LOAD' ? 'Page Load' : 'Navigation',
        selectorType: 'URL',
        value: navigationUrl,
        description: action === 'PAGE_LOAD' ? `Page loaded: ${navigationUrl}` : `Navigated to ${navigationUrl}`,
        originalHtml: snapshot.html,
        pageUrl: navigationUrl,
        metadata: {
          navigation: {
            url: navigationUrl,
            previousUrl,
            action,
          },
          snapshot,
        },
      },
      dataValue: navigationUrl,
    });
  };

  const recordNavigation = async (navigationUrl: string, action: 'PAGE_LOAD' | 'NAVIGATE', previousUrl: string | null) => {
    const normalizedUrl = normalizeRecordedUrl(navigationUrl);
    if (normalizedUrl === lastNavigationUrl) return;

    lastNavigationUrl = normalizedUrl;
    setNavigationBarrier();
    console.log(`[Recorder] Navigation observed: ${navigationUrl}`);
    await emitNavigationStep(navigationUrl, action, previousUrl);
  };

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

  activePage.on('request', (req) => {
    try {
      (req as any).__recordedPageUrl = req.frame()?.url() || activePage?.url() || targetUrl;
    } catch {
      (req as any).__recordedPageUrl = activePage?.url() || targetUrl;
    }
  });

  activePage.on('framenavigated', (frame) => {
    if (!activePage || frame !== activePage.mainFrame()) return;

    const currentUrl = frame.url();
    if (!currentUrl || currentUrl === 'about:blank') return;

    const previousUrl = lastNavigationUrl || null;
    void recordNavigation(currentUrl, previousUrl ? 'NAVIGATE' : 'PAGE_LOAD', previousUrl).catch((error) => {
      console.error('❌ [Recorder] Failed to record navigation step:', error);
    });
  });

  await activePage.exposeFunction('onNavigationObserved', async (payload: { url: string; action: 'NAVIGATE'; previousUrl?: string | null }) => {
    try {
      if (!activePage || !payload?.url) return { success: false };

      await recordNavigation(payload.url, payload.action, payload.previousUrl || null);
      return { success: true };
    } catch (error) {
      console.error('❌ [Recorder] Failed to capture navigation:', error);
      return { success: false };
    }
  });

  // Expose function to be called from the browser
  await activePage.exposeFunction('onElementClicked', async (snapshot: RichSnapshot) => {
    try {
      if (!activePage) return { success: false };
      await waitForNavigationBarrier();

      const selectorData = await generateSmartSelector(activePage, snapshot, snapshot?.pageUrl);

      // --- Meaningful Description Generation ---
      const desc = buildElementDescription(snapshot);

      const newElement = {
        id: randomId('el'),
        name: selectorData.name || 'RecordedElement',
        selectorType: selectorData.selectorType,
        value: selectorData.value,
        locators: selectorData.locators,
        description: desc,
originalHtml: snapshot.html,
        pageUrl: snapshot?.pageUrl,
        metadata: { snapshot },
      };

      console.log(`✨ [Recorder] Captured: ${newElement.name} via ${newElement.selectorType} (${newElement.value})`);
      await onElementRecorded(newElement);
      return { success: true };
    } catch (error) {
      console.error('❌ [Recorder] Failed to capture element:', error);
      return { success: false };
    }
  });

  await activePage.exposeFunction('onStepRecordedAction', async (action: string, snapshot: RichSnapshot, dataValue: any) => {
    try {
      if (!activePage) return { success: false };
      await waitForNavigationBarrier();

      const selectorData = await generateSmartSelector(activePage, snapshot, snapshot?.pageUrl);
      
      const desc = buildElementDescription(snapshot);

      const elementData = {
        id: randomId('el'),
        name: selectorData.name || 'RecordedElement',
        selectorType: selectorData.selectorType,
        value: selectorData.value,
        locators: selectorData.locators,
        description: desc,
originalHtml: snapshot.html,
        pageUrl: snapshot?.pageUrl,
        metadata: { snapshot },
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
           const recordedPageUrl = (req as any).__recordedPageUrl || activePage!.url();
           pageOrigin = new URL(recordedPageUrl).origin;
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

      const RECORDER_STATE_KEY = '__quantumqa_recorder_state__';
      const readSavedState = () => {
        try {
          const raw = window.name || '';
          const marker = raw.indexOf(RECORDER_STATE_KEY + '=');
          if (marker === -1) return null;
          const encoded = raw.slice(marker + RECORDER_STATE_KEY.length + 1);
          return JSON.parse(decodeURIComponent(encoded));
        } catch (e) {
          return null;
        }
      };

      const writeSavedState = (state) => {
        try {
          const raw = window.name || '';
          const marker = raw.indexOf(RECORDER_STATE_KEY + '=');
          const base = marker === -1 ? raw : raw.slice(0, marker);
          window.name = base + RECORDER_STATE_KEY + '=' + encodeURIComponent(JSON.stringify(state));
        } catch (e) {}
      };
      
      // Initialize with backend state if available, otherwise default
      window.__recorderState = { isPaused: true, mode: 'ui', started: false };
      const savedState = readSavedState();
      if (savedState) {
        window.__recorderState = { isPaused: true, mode: 'ui', started: false, ...savedState };
      }
      if (window.getInitialRecorderState) {
         try {
            const saved = await window.getInitialRecorderState();
            if (saved) window.__recorderState = { isPaused: true, mode: 'ui', started: false, ...saved };
         } catch(e) {}
      }

      writeSavedState(window.__recorderState);
      
      let badge = null;
      let toolbar = null;

      const notifyState = () => {
         writeSavedState(window.__recorderState);
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

      // Keep recorder UI attached across navigations and SPA rerenders
      document.addEventListener('DOMContentLoaded', ensureUI, { once: false });
      window.addEventListener('load', ensureUI);
      const observerTarget = document.documentElement || document.body;
      if (observerTarget && window.MutationObserver) {
        const observer = new MutationObserver(() => ensureUI());
        observer.observe(observerTarget, { childList: true, subtree: true });
      }
      setInterval(ensureUI, 250);

      const readAttributes = (el) => {
        const attrs = {};
        if (!el.attributes) return attrs;
        Array.from(el.attributes).forEach((attr) => {
          attrs[attr.name] = attr.value;
        });
        return attrs;
      };

      const getElementRect = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };

      const buildRichSnapshot = (target, contextNode) => {
        const aria = getAriaInfo(target);
        return {
          tagName: target.tagName.toUpperCase(),
          html: cleanNode(target).outerHTML,
          contextHtml: contextNode ? cleanNode(contextNode).outerHTML : undefined,
          textContent: (target.innerText || target.textContent || '').trim().substring(0, 200),
          pageUrl: window.location.href,
          aria,
          rect: getElementRect(target),
          attributes: readAttributes(target),
        };
      };

      // PRIMARY ACTION: Right Click to Record
      document.addEventListener('contextmenu', async (e) => {
        if (window.__recorderState.isPaused || window.__recorderState.mode !== 'element') return;
        const target = e.target;
        if (target && target instanceof HTMLElement) {
          e.preventDefault(); 
          e.stopPropagation();



          const snapshot = buildRichSnapshot(target, target.parentElement || null);
            console.log('[Recorder] Right-Click detected. ARIA:', snapshot.aria);
          const cleanNode = (node) => {
            const clone = node.cloneNode(false);
            clone.removeAttribute('style');
            const text = node.textContent?.trim() || '';
            if (text) {
               clone.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
            }
            return clone;
          }

          if (target.parentElement) {
            const parentClone = cleanNode(target.parentElement);
            parentClone.innerHTML = '\\n  ' + targetHtml + '\\n';
            contextHtml = parentClone.outerHTML;
          }

            const pageUrl = snapshot.pageUrl;
          
          target.style.outline = '4px solid #10b981';
          target.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';

          try {
            await window.onElementClicked(snapshot);
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
        if (clone.removeAttribute) {
          clone.removeAttribute('style');
        }
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

        const name = el.innerText?.trim() ||
                     el.getAttribute('aria-label') ||
                     el.placeholder ||
                     (el.labels && el.labels[0]?.innerText?.trim()) ||
                     el.title ||
                     el.alt ||
                     el.value || '';

        const describedBy = el.getAttribute('aria-describedby') || '';
        const labelledBy = el.getAttribute('aria-labelledby') || '';
        const resolveReferences = (refIds) => refIds.split(/\s+/).map((id) => document.getElementById(id)?.innerText?.trim()).filter(Boolean).join(' ');

        return {
          role,
          name: name.substring(0, 100).trim(),
          describedBy: describedBy || undefined,
          labelledBy: labelledBy || undefined,
          describedByText: describedBy ? resolveReferences(describedBy).substring(0, 200).trim() || undefined : undefined,
          labelledByText: labelledBy ? resolveReferences(labelledBy).substring(0, 200).trim() || undefined : undefined,
        };
      };

      const recentRecordedAction = { key: '', ts: 0 };

      const buildActionKey = (action, snapshot) => action + '|' + snapshot.pageUrl + '|' + snapshot.html;

      const recordUiAction = async (action, snapshot, dataValue) => {
        if (!window.onStepRecordedAction) return;

        const actionKey = buildActionKey(action, snapshot);
        const now = Date.now();
        if (recentRecordedAction.key === actionKey && now - recentRecordedAction.ts < 250) {
          return;
        }

        recentRecordedAction.key = actionKey;
        recentRecordedAction.ts = now;

        console.log('[Browser] LOG: [Smart Recorder] ACTION: ' + action);
        window.onStepRecordedAction(action, snapshot, dataValue);
      };

      document.addEventListener('pointerdown', async (e) => {
        if (e.target.closest('#recorder-toolbar') || e.target.closest('#recorder-badge')) return;

        if (window.__recorderState.isPaused || window.__recorderState.mode !== 'ui') return;

        const target = e.target.closest('button, a, input, select, textarea, [role="button"], [tabindex]') || e.target;

        if (target && target instanceof HTMLElement && isInteractive(target)) {
          if (['input', 'textarea'].includes(target.tagName.toLowerCase()) && target.type !== 'submit' && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio') {
            return;
          }

          if (target.tagName.toLowerCase() === 'input' && (target.type === 'checkbox' || target.type === 'radio')) {
            return;
          }

          const snapshot = buildRichSnapshot(target, target.parentElement || null);
          await recordUiAction('CLICK', snapshot, null);
        }
      }, { capture: true });

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

            const snapshot = buildRichSnapshot(target, target.parentElement || null);
            let contextHtml = snapshot.contextHtml || targetHtml;
           if (target.parentElement) {
             const parentClone = cleanNode(target.parentElement);
             parentClone.innerHTML = '\\n  ' + targetHtml + '\\n';
             contextHtml = parentClone.outerHTML;
           }

            const pageUrl = snapshot.pageUrl;
           let action = 'CLICK';
           if (target.tagName.toLowerCase() === 'input' && (target.type === 'checkbox' || target.type === 'radio')) {
             return; // let change event handle this
           }

            if (window.onStepRecordedAction) {
                console.log('[Browser] LOG: [Smart Recorder] ACTION: ' + action);
                window.onStepRecordedAction(action, snapshot, null);
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

            const snapshot = buildRichSnapshot(target, target.parentElement || null);
            const targetHtml = snapshot.html;
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
                window.onStepRecordedAction(action, snapshot, value);
           }
        }
      }, { capture: true });

      const reportNavigation = (action) => {
        const currentUrl = window.location.href;
        if (currentUrl === window.__quantumqaLastNavigationUrl) return;

        const previousUrl = window.__quantumqaLastNavigationUrl || null;
        window.__quantumqaLastNavigationUrl = currentUrl;

        if (window.onNavigationObserved) {
          window.onNavigationObserved({ url: currentUrl, action, previousUrl });
        }
      };

      window.__quantumqaLastNavigationUrl = window.location.href;

      const { pushState, replaceState } = history;
      history.pushState = function(...args) {
        const result = pushState.apply(this, args);
        reportNavigation('NAVIGATE');
        return result;
      };
      history.replaceState = function(...args) {
        const result = replaceState.apply(this, args);
        reportNavigation('NAVIGATE');
        return result;
      };
      window.addEventListener('popstate', () => reportNavigation('NAVIGATE'));

      // Auto-show guide badge
      setTimeout(ensureUI, 100);
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
