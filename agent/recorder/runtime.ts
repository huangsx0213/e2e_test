import type { LocatorRef } from './protocol.ts';

type RecorderMode = 'ui' | 'api' | 'element' | 'all';

type RuntimeConfig = {
  bindingName: string;
  mode: RecorderMode;
};

export function recorderInit(config: RuntimeConfig) {
  const bindingName = config.bindingName;
  const mode = config.mode;

  const send = (payload: any) => {
    try {
      const fn = (window as any)[bindingName];
      if (typeof fn === 'function') fn(JSON.stringify(payload));
    } catch (e) {
      console.warn('[RecorderV2] binding send failed', e);
    }
  };

  const state = {
    mode,
    isPaused: false,
    started: true,
  };

  (window as any).__qqaRecorderState = state;

  const isEnabled = (kind: 'ui' | 'api' | 'element') => mode === 'all' || mode === kind;

  const readAttrs = (el: Element) => {
    const attrs: Record<string, string> = {};
    Array.from(el.attributes || []).forEach((attr) => {
      attrs[attr.name] = attr.value;
    });
    return attrs;
  };

  const escapeDouble = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const getText = (el: Element) => {
    const text = (el as HTMLElement).innerText || el.textContent || '';
    return text.trim().replace(/\s+/g, ' ').slice(0, 80);
  };

  const buildCssFallback = (el: Element): string => {
    const attrId = el.getAttribute('id');
    if (attrId) return `#${CSS.escape(attrId)}`;

    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
    if (testId) return `${el.tagName.toLowerCase()}[data-testid="${escapeDouble(testId)}"]`;

    const nameAttr = el.getAttribute('name');
    if (nameAttr) return `${el.tagName.toLowerCase()}[name="${escapeDouble(nameAttr)}"]`;

    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body) {
      let segment = current.tagName.toLowerCase();
      const id = current.getAttribute('id');
      if (id) {
        segment = `#${CSS.escape(id)}`;
        parts.unshift(segment);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
        if (sameTag.length > 1) {
          segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  // ─── Locator construction (simplified: only official/css) ───

  const buildOfficialSelector = (el: Element): string | null => {
    try {
      const injected = (window as any).__qqaOfficialInjectedScript;
      if (!injected?.generateSelectorSimple) return null;
      return injected.generateSelectorSimple(el, { testIdAttributeName: 'data-testid' });
    } catch {
      return null;
    }
  };

  const buildLocatorRef = (el: Element): LocatorRef => {
    const official = buildOfficialSelector(el);
    if (official) return { kind: 'official', selector: official };
    return { kind: 'css', selector: buildCssFallback(el) };
  };

  const buildFramePath = (): string[] => {
    const path: string[] = [];
    let currentWindow: Window | null = window;
    let depth = 0;
    while (currentWindow && currentWindow !== currentWindow.top && depth < 10) {
      const frameElement = currentWindow.frameElement;
      if (!(frameElement instanceof Element)) break;
      const officialSelector = buildOfficialSelector(frameElement);
      path.unshift(officialSelector || buildCssFallback(frameElement));
      currentWindow = currentWindow.parent;
      depth++;
    }
    return path;
  };

  // ─── Human-readable element name from official selector ───

  const elementName = (el: Element) => {
    const official = buildOfficialSelector(el);
    if (official) {
      const roleMatch = official.match(/internal:role=([^\[]+)(?:\[name=(['"])(.*?)\2(?:i)?\])?/);
      if (roleMatch) {
        const name = roleMatch[3]?.trim();
        if (name) return name;
      }
      const labelMatch = official.match(/internal:label=(['"])(.*?)\1(?:i)?/);
      if (labelMatch) return labelMatch[2].trim();
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const text = getText(el);
    if (text) return text;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();
    const title = el.getAttribute('title');
    if (title) return title.trim();
    const alt = el.getAttribute('alt');
    if (alt) return alt.trim();
    return el.tagName.toLowerCase();
  };

  const buildSnapshot = (el: Element) => ({
    tagName: el.tagName.toUpperCase(),
    text: getText(el),
    pageUrl: window.location.href,
    attributes: readAttrs(el),
    name: elementName(el),
  });

  const serializeFiles = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    const payloads = [] as Array<{ name: string; mimeType: string; bufferBase64: string }>;
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      payloads.push({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        bufferBase64: btoa(binary),
      });
    }
    return payloads;
  };

  const isCheckboxOrRadio = (el: Element) => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
  const isClickableInput = (el: Element) => el instanceof HTMLInputElement && ['submit', 'button', 'image', 'reset'].includes(el.type);
  const isTextInput = (el: Element) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
  const isInteractive = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    return ['button', 'a', 'input', 'select', 'textarea', 'option', 'li'].includes(tag) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' || el.hasAttribute('tabindex') || (el instanceof HTMLElement && el.isContentEditable);
  };

  const resolveTarget = (e: Event) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element) {
        if (node.tagName.toLowerCase() === 'label' && (node as HTMLLabelElement).control) {
          return (node as HTMLLabelElement).control;
        }
        if (isInteractive(node)) return node;
      }
    }
    const target = e.target;
    if (target instanceof Element) {
      if (target.tagName.toLowerCase() === 'label' && (target as HTMLLabelElement).control) {
        return (target as HTMLLabelElement).control;
      }
      return target;
    }
    return null;
  };

  const emitRaw = (payload: any) => send(payload);

  const emitUi = (action: string, target: Element, value?: string, extra?: Record<string, any>) => {
    if (!isEnabled('ui')) return;
    const locator = buildLocatorRef(target);
    emitRaw({
      action,
      locator,
      value,
      pageUrl: window.location.href,
      timestamp: Date.now(),
      metadata: {
        snapshot: buildSnapshot(target),
        officialSelector: locator.kind === 'official' ? locator.selector : null,
        framePath: buildFramePath(),
        ...extra,
      },
      type: 'ui',
    });
  };

  const emitElement = (target: Element) => {
    if (!isEnabled('element')) return;
    const locator = buildLocatorRef(target);
    emitRaw({
      action: 'recordElement',
      locator,
      pageUrl: window.location.href,
      timestamp: Date.now(),
      metadata: {
        snapshot: buildSnapshot(target),
        officialSelector: locator.kind === 'official' ? locator.selector : null,
        framePath: buildFramePath(),
      },
    });
  };

  // ─── Event listeners (unchanged from original) ───

  document.addEventListener('contextmenu', (e) => {
    const target = resolveTarget(e);
    if (!target) return;
    if (isEnabled('ui')) {
      e.preventDefault();
      e.stopPropagation();
      emitUi('rightClick', target);
    }
    if (isEnabled('element')) {
      e.preventDefault();
      e.stopPropagation();
      emitElement(target);
    }
  }, { capture: true });

  document.addEventListener('click', (e) => {
    if (!isEnabled('ui')) return;
    const target = resolveTarget(e);
    if (!target) return;
    if (isTextInput(target) && !isClickableInput(target)) return;
    if (isCheckboxOrRadio(target)) return;
    if (target.tagName.toLowerCase() === 'select') return;
    if (target.tagName.toLowerCase() === 'label' && (target as HTMLLabelElement).control) return;
    emitUi('click', target, undefined, { clickCount: (e as MouseEvent).detail || 1 });
  }, { capture: true });

  document.addEventListener('dblclick', (e) => {
    if (!isEnabled('ui')) return;
    const target = resolveTarget(e);
    if (!target) return;
    emitUi('dblclick', target);
  }, { capture: true });

  document.addEventListener('change', async (e) => {
    if (!isEnabled('ui')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
      emitUi(target.checked ? 'check' : 'uncheck', target);
      return;
    }
    if (target instanceof HTMLSelectElement) {
      emitUi('selectOption', target, target.value);
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'file') {
      const files = await serializeFiles(target.files);
      const fileNames = files.map((file) => file.name).join(', ');
      emitUi('setInputFiles', target, fileNames, { files });
    }
  }, { capture: true });

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLInputElement) target.dataset.qqaOriginalValue = target.value;
    else if (target instanceof HTMLTextAreaElement) target.dataset.qqaOriginalValue = target.value;
    else if (target.isContentEditable) target.dataset.qqaOriginalValue = target.textContent || '';
  }, { capture: true });

  document.addEventListener('focusout', (e) => {
    if (!isEnabled('ui')) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLSelectElement) return;
    if (target instanceof HTMLInputElement && ['submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'hidden'].includes(target.type)) return;

    const currentValue = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value
      : target.isContentEditable
        ? target.textContent || ''
        : '';
    const originalValue = target.dataset.qqaOriginalValue || '';
    if (currentValue === originalValue) return;
    target.dataset.qqaOriginalValue = currentValue;
    emitUi('fill', target, currentValue);
  }, { capture: true });

  document.addEventListener('keydown', (e) => {
    if (!isEnabled('ui')) return;
    if (!(e.target instanceof Element)) return;

    const target = e.target;
    const tag = target.tagName.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || (target instanceof HTMLElement && target.isContentEditable);

    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
    if (isModifier) return;

    if (e.key === 'Tab') return;

    const special = ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!special.includes(e.key)) return;

    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (isInput && navigationKeys.includes(e.key)) return;

    if (e.key === 'Enter' && (tag === 'button' || (target as HTMLElement).getAttribute('role') === 'button' || (target as HTMLInputElement).type === 'submit')) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(e.key);

    emitUi('press', target, parts.join('+'));
  }, { capture: true });

  let hoverTimer = 0;
  document.addEventListener('mouseover', (e) => {
    if (!isEnabled('ui')) return;
    const target = resolveTarget(e);
    if (!target) return;
    if (hoverTimer) return;
    hoverTimer = window.setTimeout(() => { hoverTimer = 0; }, 400);
    emitUi('hover', target);
  }, { capture: true });

  let dragSource: Element | null = null;
  document.addEventListener('dragstart', (e) => {
    if (!isEnabled('ui')) return;
    const target = resolveTarget(e);
    if (target) dragSource = target;
  }, { capture: true });
  document.addEventListener('drop', (e) => {
    if (!isEnabled('ui')) return;
    const target = resolveTarget(e);
    if (!dragSource || !target) return;
    const locator = buildLocatorRef(dragSource);
    emitRaw({
      action: 'dragTo',
      locator,
      secondaryLocator: buildLocatorRef(target),
      pageUrl: window.location.href,
      timestamp: Date.now(),
      metadata: {
        snapshot: buildSnapshot(dragSource),
        dropTarget: buildSnapshot(target),
        officialSelector: locator.kind === 'official' ? locator.selector : null,
      },
      type: 'ui',
    });
    dragSource = null;
  }, { capture: true });

  const reportNavigation = (action: 'goto') => {
    const currentUrl = window.location.href;
    const previousUrl = (window as any).__qqaLastNavigationUrl || null;
    if (previousUrl === currentUrl) return;
    (window as any).__qqaLastNavigationUrl = currentUrl;
    if (!isEnabled('ui') && !isEnabled('api') && !isEnabled('element')) return;
    emitRaw({
      action,
      value: currentUrl,
      pageUrl: currentUrl,
      timestamp: Date.now(),
      metadata: { previousUrl },
      type: 'navigate',
    });
  };

  (window as any).__qqaLastNavigationUrl = window.location.href;
  const { pushState, replaceState } = history;
  history.pushState = function (...args) {
    const result = pushState.apply(this, args as any);
    reportNavigation('goto');
    return result;
  };
  history.replaceState = function (...args) {
    const result = replaceState.apply(this, args as any);
    reportNavigation('goto');
    return result;
  };
  window.addEventListener('popstate', () => reportNavigation('goto'));
  setTimeout(() => reportNavigation('goto'), 0);
}