import { createHash } from 'node:crypto';

import {
  MAX_HTML_FILE_NAME_CODE_POINTS,
  MAX_HTML_REQUIREMENT_ID_CODE_POINTS,
  MAX_HTML_TEXT_CHARS,
  type SanitizedHtmlRoute,
} from './types.ts';

const HTML_ROUTE_BASE = 'https://html-knowledge.invalid/';
const URI_SCHEME = /^([a-z][a-z\d+.-]*):/i;
const CJK_CHARACTERS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const SEARCH_TOKEN = /(?<![\p{L}\p{N}_])[+-]?(?:\p{N}+(?:\.\p{N}+)?|\.\p{N}+)(?![\p{L}\p{N}_])|[\p{Script=Latin}\p{N}]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

export class HtmlKnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HtmlKnowledgeValidationError';
  }
}

export class HtmlKnowledgeLimitError extends HtmlKnowledgeValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'HtmlKnowledgeLimitError';
  }
}

export function validateHtmlRequirementId(value: unknown, context = 'Requirement'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HtmlKnowledgeValidationError(`${context} ID must be a non-empty string`);
  }
  if (hasUnpairedSurrogate(value)) {
    throw new HtmlKnowledgeValidationError(`${context} ID contains an unpaired surrogate`);
  }
  if (/[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new HtmlKnowledgeValidationError(`${context} ID contains control characters`);
  }
  if (Array.from(value).length > MAX_HTML_REQUIREMENT_ID_CODE_POINTS) {
    throw new HtmlKnowledgeValidationError(
      `${context} ID exceeds ${MAX_HTML_REQUIREMENT_ID_CODE_POINTS} Unicode code points`,
    );
  }
  return value;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function normalizeHtmlFileName(fileName: string): { displayName: string; key: string } {
  if (typeof fileName !== 'string') {
    throw new HtmlKnowledgeValidationError('HTML file name must be a string');
  }

  const displayName = fileName.normalize('NFC');
  if (displayName.length === 0) {
    throw new HtmlKnowledgeValidationError('HTML file name is required');
  }
  if (Array.from(displayName).length > MAX_HTML_FILE_NAME_CODE_POINTS) {
    throw new HtmlKnowledgeValidationError('HTML file name exceeds 255 Unicode code points');
  }
  if (/[\\/]/u.test(displayName)) {
    throw new HtmlKnowledgeValidationError('HTML file name must not contain path separators');
  }
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(displayName)) {
    throw new HtmlKnowledgeValidationError('HTML file name must not contain control characters');
  }
  if (!/^.+\.html?$/iu.test(displayName)) {
    throw new HtmlKnowledgeValidationError('HTML file name must end in .html or .htm');
  }

  return {
    displayName,
    key: displayName.normalize('NFC').toLocaleLowerCase('en-US'),
  };
}

export function normalizeStaticText(value: string, maxChars = MAX_HTML_TEXT_CHARS): string {
  if (!Number.isInteger(maxChars) || maxChars < 0) {
    throw new RangeError('maxChars must be a non-negative integer');
  }

  const normalized = String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const codePoints = Array.from(normalized);
  return codePoints.length <= maxChars ? normalized : codePoints.slice(0, maxChars).join('');
}

export function tokenizeHtmlKnowledge(value: string): string[] {
  const normalized = String(value).normalize('NFKC').toLocaleLowerCase('en-US');
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const match of normalized.matchAll(SEARCH_TOKEN)) {
    const value = match[0];
    if (CJK_CHARACTERS.test(value[0])) {
      const characters = Array.from(value);
      if (characters.length === 1) {
        addToken(characters[0]);
      } else {
        for (let index = 0; index < characters.length - 1; index += 1) {
          addToken(`${characters[index]}${characters[index + 1]}`);
        }
      }
    } else {
      addToken(value);
    }
  }

  return tokens;

  function addToken(token: string): void {
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
}

export function sanitizeHtmlRoute(raw: string, base?: string): SanitizedHtmlRoute | null {
  const target = String(raw).trim();
  if (!target || target.startsWith('#') || target.includes('\\') || /\p{Cc}/u.test(target)) return null;

  const targetScheme = target.match(URI_SCHEME)?.[1]?.toLocaleLowerCase('en-US');
  if (targetScheme && targetScheme !== 'http' && targetScheme !== 'https') return null;

  let baseUrl = new URL(HTML_ROUTE_BASE);
  let hasRealOrigin = target.startsWith('//') || targetScheme === 'http' || targetScheme === 'https';

  if (base !== undefined) {
    const baseValue = String(base).trim();
    if (!baseValue || baseValue.startsWith('#') || baseValue.includes('\\') || /\p{Cc}/u.test(baseValue)) return null;
    const baseScheme = baseValue.match(URI_SCHEME)?.[1]?.toLocaleLowerCase('en-US');
    if (baseScheme && baseScheme !== 'http' && baseScheme !== 'https') return null;

    try {
      baseUrl = baseScheme ? new URL(baseValue) : new URL(baseValue, HTML_ROUTE_BASE);
    } catch {
      return null;
    }
    if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') return null;
    hasRealOrigin ||= baseValue.startsWith('//') || baseScheme === 'http' || baseScheme === 'https';
  }

  let parsed: URL;
  try {
    parsed = targetScheme ? new URL(target) : new URL(target, baseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const path = normalizePercentEncoding(parsed.pathname || '/');
  const queryParameterNames = [...new Set([...parsed.searchParams.keys()].filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'en-US'));
  const query = queryParameterNames.length > 0
    ? `?${queryParameterNames.map((name) => encodeURIComponent(name)).join('&')}`
    : '';
  const origin = hasRealOrigin ? parsed.origin.toLocaleLowerCase('en-US') : null;

  return {
    normalizedTarget: `${origin ?? ''}${path}${query}`,
    origin,
    path,
    queryParameterNames,
    fullPathSha256: createHash('sha256').update(path).digest('hex'),
  };
}

function normalizePercentEncoding(path: string): string {
  return path.replace(/%[\da-f]{2}/gi, (escape) => {
    const character = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return /[A-Za-z0-9_~-]/u.test(character) ? character : escape.toUpperCase();
  });
}
