import type { RecorderMode, LocatorRef } from './protocol.ts';

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

    const escapeSingle = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapeDouble = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const getText = (el: Element) => {
      const text = (el as HTMLElement).innerText || el.textContent || '';
      return text.trim().replace(/\s+/g, ' ').slice(0, 80);
    };

    const inferRole = (el: Element): string | null => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a') return 'link';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type || 'text';
        if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        return 'textbox';
      }
      if (/^h[1-6]$/.test(tag)) return 'heading';
      if (tag === 'img') return 'img';
      return null;
    };

    const getAriaName = (el: Element): string | null => {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || '')
          .filter(Boolean)
          .join(' ')
          .trim();
        if (text) return text;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.labels && el.labels.length > 0) {
          const label = Array.from(el.labels)
            .map((l) => l.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ')
            .trim();
          if (label) return label;
        }
      }
      const text = getText(el);
      if (text) return text;
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      const alt = el.getAttribute('alt');
      if (alt) return alt.trim();
      return null;
    };

    const isStableClass = (value: string) => {
      if (!value) return false;
      if (value.length > 40) return false;
      if (/^[a-zA-Z]+-[a-zA-Z0-9]{6,}$/.test(value)) return false;
      if (/^css-[a-z0-9]+$/i.test(value)) return false;
      if (/^(ng-|sc-|css-|jsx-|tw-)/i.test(value)) return false;
      return /[a-zA-Z]/.test(value);
    };

    const buildCssSelector = (el: Element): string => {
      const attrId = el.getAttribute('id');
      if (attrId) return `#${CSS.escape(attrId)}`;

      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
      if (testId) return `${el.tagName.toLowerCase()}[data-testid="${escapeDouble(testId)}"]`;

      const nameAttr = el.getAttribute('name');
      if (nameAttr) return `${el.tagName.toLowerCase()}[name="${escapeDouble(nameAttr)}"]`;

      const typeAttr = el.getAttribute('type');
      if (typeAttr) return `${el.tagName.toLowerCase()}[type="${escapeDouble(typeAttr)}"]`;

      const className = (el as HTMLElement).className;
      if (typeof className === 'string') {
        const classList = className.split(/\s+/).filter(isStableClass);
        if (classList.length) return `${el.tagName.toLowerCase()}.${classList[0]}`;
      }

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

    const buildLocator = (el: Element): LocatorRef => {
      const role = inferRole(el);
      const name = getAriaName(el);
      if (role && name) {
        return { kind: 'getByRole', role, name, exact: true };
      }

      const tag = el.tagName.toLowerCase();
      const placeholder = el.getAttribute('placeholder');
      if (placeholder && (tag === 'input' || tag === 'textarea')) {
        return { kind: 'getByPlaceholder', text: placeholder.trim(), exact: true };
      }

      const labelText = (() => {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return '';
        if (el.labels && el.labels.length) {
          return Array.from(el.labels).map((l) => l.textContent?.trim() || '').filter(Boolean).join(' ').trim();
        }
        const id = el.getAttribute('id');
        if (id) {
          const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          return label?.textContent?.trim() || '';
        }
        return '';
      })();
      if (labelText) return { kind: 'getByLabel', text: labelText, exact: true };

      const text = getText(el);
      if (text && !['input', 'textarea', 'select'].includes(tag)) {
        return { kind: 'getByText', text, exact: true };
      }

      const alt = el.getAttribute('alt');
      if (alt) return { kind: 'getByAltText', text: alt.trim(), exact: true };

      const title = el.getAttribute('title');
      if (title) return { kind: 'getByTitle', text: title.trim(), exact: true };

      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
      if (testId) return { kind: 'getByTestId', text: testId.trim() };

      return { kind: 'css', selector: buildCssSelector(el) };
    };

    const buildOfficialSelector = (el: Element): string | null => {
      try {
        const injected = (window as any).__qqaOfficialInjectedScript;
        if (!injected?.generateSelectorSimple) return null;
        return injected.generateSelectorSimple(el, { testIdAttributeName: 'data-testid' });
      } catch {
        return null;
      }
    };

    const buildFramePath = (): string[] => {
      const path: string[] = [];
      let currentWindow: Window | null = window;
      let depth = 0;
      while (currentWindow && currentWindow !== currentWindow.top && depth < 10) {
        const frameElement = currentWindow.frameElement;
        if (!(frameElement instanceof Element)) break;
        const officialSelector = buildOfficialSelector(frameElement);
        path.unshift(officialSelector || buildCssSelector(frameElement));
        currentWindow = currentWindow.parent;
        depth++;
      }
      return path;
    };

    const toLegacyLocator = (ref: LocatorRef) => {
      switch (ref.kind) {
        case 'getByRole':
          return { selectorType: 'getByRole', value: ref.name ? `${ref.role}, { name: '${escapeSingle(ref.name)}'${ref.exact !== undefined ? `, exact: ${ref.exact ? 'true' : 'false'}` : ''} }` : ref.role };
        case 'getByLabel':
          return { selectorType: 'getByLabel', value: ref.text };
        case 'getByPlaceholder':
          return { selectorType: 'getByPlaceholder', value: ref.text };
        case 'getByText':
          return { selectorType: 'getByText', value: ref.text };
        case 'getByAltText':
          return { selectorType: 'getByAltText', value: ref.text };
        case 'getByTitle':
          return { selectorType: 'getByTitle', value: ref.text };
        case 'getByTestId':
          return { selectorType: 'getByTestId', value: ref.text };
        case 'css':
          return { selectorType: 'css', value: ref.selector };
      }
    };

    const elementName = (el: Element) => {
      const ref = buildLocator(el);
      if (ref.kind === 'getByRole' && ref.name) return ref.name;
      if ('text' in ref) return ref.text;
      if (ref.kind === 'css') return ref.selector;
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
          // If we hit a LABEL, use its associated control instead
          if (node.tagName.toLowerCase() === 'label' && (node as HTMLLabelElement).control) {
            return (node as HTMLLabelElement).control;
          }
          if (isInteractive(node)) return node;
        }
      }
      const target = e.target;
      if (target instanceof Element) {
        // Fallback check for labels
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
      const locator = buildLocator(target);
      const officialSelector = buildOfficialSelector(target);
      emitRaw({
        type: 'ui',
        action,
        locator,
        value,
        pageUrl: window.location.href,
        timestamp: Date.now(),
        metadata: {
          snapshot: buildSnapshot(target),
          legacyLocator: toLegacyLocator(locator),
          officialSelector,
          framePath: buildFramePath(),
          ...extra,
        },
      });
    };

    const emitElement = (target: Element) => {
      if (!isEnabled('element')) return;
      const locator = buildLocator(target);
      const officialSelector = buildOfficialSelector(target);
      emitRaw({
        type: 'element',
        locator,
        pageUrl: window.location.href,
        timestamp: Date.now(),
        metadata: {
          snapshot: buildSnapshot(target),
          legacyLocator: toLegacyLocator(locator),
          officialSelector,
          framePath: buildFramePath(),
        },
      });
    };

    document.addEventListener('contextmenu', (e) => {
      const target = resolveTarget(e);
      if (!target) return;
      if (isEnabled('ui')) {
        e.preventDefault();
        e.stopPropagation();
        emitUi('RIGHT_CLICK', target);
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
      emitUi('CLICK', target, undefined, { clickCount: (e as MouseEvent).detail || 1 });
    }, { capture: true });

    document.addEventListener('dblclick', (e) => {
      if (!isEnabled('ui')) return;
      const target = resolveTarget(e);
      if (!target) return;
      emitUi('DOUBLE_CLICK', target);
    }, { capture: true });

    document.addEventListener('change', async (e) => {
      if (!isEnabled('ui')) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
        emitUi(target.checked ? 'CHECK' : 'UNCHECK', target);
        return;
      }
      if (target instanceof HTMLSelectElement) {
        emitUi('SELECT_OPTION', target, target.value);
        return;
      }
      if (target instanceof HTMLInputElement && target.type === 'file') {
        const files = await serializeFiles(target.files);
        const fileNames = files.map((file) => file.name).join(', ');
        emitUi('ATTACH_FILE', target, fileNames, { files });
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
      emitUi('TYPE', target, currentValue);
    }, { capture: true });

    document.addEventListener('keydown', (e) => {
      if (!isEnabled('ui')) return;
      if (!(e.target instanceof Element)) return;

      const target = e.target;
      const tag = target.tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || (target instanceof HTMLElement && target.isContentEditable);

      // 1. Ignore pure modifiers
      const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);
      if (isModifier) return;

      // 2. Ignore Tab entirely (following official Playwright logic)
      if (e.key === 'Tab') return;

      // 3. Define special keys to record
      const special = ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'];
      if (!special.includes(e.key)) return;

      // 4. Ignore navigation keys inside text inputs (handled by filling the value)
      const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      if (isInput && navigationKeys.includes(e.key)) return;

      // 5. Ignore Enter on buttons (it will fire a CLICK event which we already record)
      if (e.key === 'Enter' && (tag === 'button' || (target as HTMLElement).getAttribute('role') === 'button' || (target as HTMLInputElement).type === 'submit')) return;

      const parts = [];
      if (e.ctrlKey) parts.push('Control');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');
      parts.push(e.key);
      
      emitUi('PRESS_KEY', target, parts.join('+'));
    }, { capture: true });

    let hoverTimer = 0;
    document.addEventListener('mouseover', (e) => {
      if (!isEnabled('ui')) return;
      const target = resolveTarget(e);
      if (!target) return;
      if (hoverTimer) return;
      hoverTimer = window.setTimeout(() => { hoverTimer = 0; }, 400);
      emitUi('HOVER', target);
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
      const locator = buildLocator(dragSource);
      emitRaw({
        type: 'ui',
        action: 'DRAG_AND_DROP',
        locator,
        secondaryLocator: buildLocator(target),
        pageUrl: window.location.href,
        timestamp: Date.now(),
        metadata: {
          snapshot: buildSnapshot(dragSource),
          dropTarget: buildSnapshot(target),
          legacyLocator: toLegacyLocator(locator),
        },
      });
      dragSource = null;
    }, { capture: true });

    const reportNavigation = (action: 'PAGE_LOAD' | 'NAVIGATE') => {
      const currentUrl = window.location.href;
      const previousUrl = (window as any).__qqaLastNavigationUrl || null;
      if (previousUrl === currentUrl) return;
      (window as any).__qqaLastNavigationUrl = currentUrl;
      if (!isEnabled('ui') && !isEnabled('api') && !isEnabled('element')) return;
      emitRaw({
        type: 'navigate',
        url: currentUrl,
        action,
        previousUrl,
        timestamp: Date.now(),
      });
    };

    (window as any).__qqaLastNavigationUrl = window.location.href;
    const { pushState, replaceState } = history;
    history.pushState = function(...args) {
      const result = pushState.apply(this, args as any);
      reportNavigation('NAVIGATE');
      return result;
    };
    history.replaceState = function(...args) {
      const result = replaceState.apply(this, args as any);
      reportNavigation('NAVIGATE');
      return result;
    };
    window.addEventListener('popstate', () => reportNavigation('NAVIGATE'));
    setTimeout(() => reportNavigation('PAGE_LOAD'), 0);
}
