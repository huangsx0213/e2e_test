import type { LocatorRef } from './protocol.ts';

export function locatorRefFromOfficialSelector(officialSelector: string): LocatorRef {
  return { kind: 'official', selector: officialSelector };
}

export function locatorRefFromPlaywrightLocator(locator: string): LocatorRef {
  // Legacy fallback for manually edited records.
  const text = locator.trim().replace(/^page\./, '').replace(/^locator\(/, 'locator(');

  const hasTextMatch = text.match(/(?:^|\.)locator\((.*)\)\.filter\(\{\s*hasText:\s*(['"])(.*?)\2\s*\}\)$/);
  if (hasTextMatch)
    return { kind: 'getByText', text: hasTextMatch[3], exact: true };

  const hasNotTextMatch = text.match(/(?:^|\.)locator\((.*)\)\.filter\(\{\s*hasNotText:\s*(['"])(.*?)\2\s*\}\)$/);
  if (hasNotTextMatch)
    return { kind: 'getByText', text: hasNotTextMatch[3], exact: false };

  const last = extractLastCall(text);
  if (!last)
    return { kind: 'css', selector: text };

  const { name, args } = last;
  const normalized = args.trim();

  if (name === 'getByRole') {
    const [rolePart, optionsPart] = splitTopLevelArgs(normalized);
    const role = unquote(rolePart.trim());
    const options = parseOptionsObject(optionsPart);
    return { kind: 'getByRole', role, name: options.name, exact: options.exact };
  }
  if (name === 'getByLabel')
    return { kind: 'getByLabel', text: unquote(normalized), exact: true };
  if (name === 'getByPlaceholder')
    return { kind: 'getByPlaceholder', text: unquote(normalized), exact: true };
  if (name === 'getByText')
    return { kind: 'getByText', text: unquote(normalized), exact: true };
  if (name === 'getByAltText')
    return { kind: 'getByAltText', text: unquote(normalized), exact: true };
  if (name === 'getByTitle')
    return { kind: 'getByTitle', text: unquote(normalized), exact: true };
  if (name === 'getByTestId')
    return { kind: 'getByTestId', text: unquote(normalized) };
  if (name === 'locator') {
    const selector = unquote(normalized);
    const hasText = parseFilterArg(text, 'hasText');
    if (hasText)
      return { kind: 'getByText', text: hasText, exact: true };
    const hasNotText = parseFilterArg(text, 'hasNotText');
    if (hasNotText)
      return { kind: 'getByText', text: hasNotText, exact: false };
    return { kind: 'css', selector };
  }

  return { kind: 'css', selector: text };
}

export function locatorRefToSelectorType(ref: LocatorRef): string {
  return ref.kind;
}

export function locatorRefToValue(ref: LocatorRef): string {
  switch (ref.kind) {
    case 'getByRole': {
      const parts = [`${ref.role}`];
      const options: string[] = [];
      if (ref.name !== undefined) options.push(`name: '${escapeSingleQuotes(ref.name)}'`);
      if (ref.exact !== undefined) options.push(`exact: ${ref.exact ? 'true' : 'false'}`);
      if (options.length) parts.push(`{ ${options.join(', ')} }`);
      return parts.join(', ');
    }
    case 'getByLabel':
    case 'getByPlaceholder':
    case 'getByText':
    case 'getByAltText':
    case 'getByTitle': {
      return ref.text;
    }
    case 'getByTestId':
      return ref.text;
    case 'official':
      return ref.selector;
    case 'css':
      return ref.selector;
  }
}

export function locatorRefToCandidateStrings(ref: LocatorRef): string[] {
  switch (ref.kind) {
    case 'getByRole': {
      const exactOptions = ref.name !== undefined ? `, { name: '${escapeSingleQuotes(ref.name)}'${ref.exact !== undefined ? `, exact: ${ref.exact ? 'true' : 'false'}` : ''} }` : '';
      const simpleOptions = ref.name !== undefined ? `, { name: '${escapeSingleQuotes(ref.name)}' }` : '';
      const candidates = [`${ref.role}${exactOptions}`];
      if (simpleOptions && simpleOptions !== exactOptions) candidates.push(`${ref.role}${simpleOptions}`);
      return candidates;
    }
    case 'getByLabel':
    case 'getByPlaceholder':
    case 'getByText':
    case 'getByAltText':
    case 'getByTitle': {
      const candidates = [ref.text];
      if (ref.exact !== undefined) candidates.unshift(`${ref.text}, { exact: ${ref.exact ? 'true' : 'false'} }`);
      return candidates;
    }
    case 'getByTestId':
      return [ref.text];
    case 'official':
      return [ref.selector];
    case 'css':
      return [ref.selector];
  }
}

export function locatorRefToLegacyDef(ref: LocatorRef): { selectorType: string; value: string } {
  return { selectorType: locatorRefToSelectorType(ref), value: locatorRefToValue(ref) };
}

function extractLastCall(locator: string): { name: string; args: string } | null {
  const match = locator.match(/(?:^|\.)(getByRole|getByLabel|getByPlaceholder|getByText|getByAltText|getByTitle|getByTestId|locator)\((.*)\)$/);
  if (!match)
    return null;
  return { name: match[1], args: match[2] };
}

function splitTopLevelArgs(args: string): [string, string?] {
  let depth = 0;
  let inString: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString)
        inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[')
      depth++;
    else if (ch === ')' || ch === '}' || ch === ']')
      depth--;
    else if (ch === ',' && depth === 0)
      return [args.slice(0, i), args.slice(i + 1)];
  }
  return [args];
}

function parseOptionsObject(optionsPart?: string): { name?: string; exact?: boolean } {
  if (!optionsPart)
    return {};
  const nameMatch = optionsPart.match(/name\s*:\s*(['"])(.*?)\1/);
  const exactMatch = optionsPart.match(/exact\s*:\s*(true|false)/);
  return {
    name: nameMatch?.[2],
    exact: exactMatch ? exactMatch[1] === 'true' : undefined,
  };
}

function parseFilterArg(locator: string, field: 'hasText' | 'hasNotText'): string | undefined {
  const match = locator.match(new RegExp(`${field}\\s*:\\s*(['\"])(.*?)\\1`));
  return match?.[2];
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function locatorRefToName(ref: LocatorRef): string {
  switch (ref.kind) {
    case 'css':
      return ref.selector;
    case 'getByRole':
      return ref.name || ref.role;
    case 'getByTestId':
      return ref.text;
    case 'official':
      return ref.selector;
    default:
      return ref.text;
  }
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
