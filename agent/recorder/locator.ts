import type { LocatorRef } from './protocol.ts';

/**
 * Convert a LocatorRef to a human-readable display name.
 * - official: parses Playwright internal selector format (role, label, testid)
 * - css: returns the CSS selector as-is
 */
export function locatorRefToName(ref: LocatorRef): string {
  switch (ref.kind) {
    case 'css':
      return ref.selector;
    case 'official':
      return humanizeOfficialSelector(ref.selector);
  }
}

/**
 * Convert a LocatorRef to the legacy { selectorType, value } format
 * used by UIElement and the test step storage layer.
 * Since LocatorRef now only has official/css, selectorType === ref.kind and value === ref.selector.
 */
export function locatorRefToLegacyDef(ref: LocatorRef): { selectorType: string; value: string } {
  return {
    selectorType: ref.kind,
    value: ref.selector,
  };
}

// ─── Internal helpers ───

function humanizeOfficialSelector(selector: string): string {
  const roleMatch = selector.match(/internal:role=([^\[]+)(?:\[name=(['"])(.*?)\2(?:i)?\])?/);
  if (roleMatch) {
    const role = roleMatch[1].trim();
    const name = roleMatch[3]?.trim();
    return name ? `${role}: ${name}` : role;
  }

  const labelMatch = selector.match(/internal:label=(['"])(.*?)\1(?:i)?/);
  if (labelMatch)
    return `label: ${labelMatch[2].trim()}`;

  return selector;
}