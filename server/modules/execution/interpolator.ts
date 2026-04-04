import crypto from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { JSONPath } from 'jsonpath-plus';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Variable interpolation engine.
 * Replaces all {{key}} patterns in a template string with values from the provided variables map.
 * Supports nested resolution (up to MAX_ITERATIONS) to allow variables referencing other variables.
 * Also supports dynamic generators (e.g., {{$uuid()}}) and transformers (e.g., {{var | md5}}).
 */

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
const MAX_ITERATIONS = 5;

// --- Generators ---
const generators: Record<string, (...args: string[]) => string> = {
  $uuid: () => crypto.randomUUID(),
  $guid: () => crypto.randomUUID(),
  $timestamp: () => Date.now().toString(),
  $timestampSec: () => Math.floor(Date.now() / 1000).toString(),
  $now: (formatStr, tzStr) => {
    let d = dayjs();
    if (tzStr) d = d.tz(tzStr);
    return formatStr ? d.format(formatStr) : d.toISOString();
  },
  $randomInt: (minStr, maxStr) => {
    const min = parseInt(minStr || '0', 10);
    const max = parseInt(maxStr || '100', 10);
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  },
  $randomFloat: (minStr, maxStr, decStr) => {
    const min = parseFloat(minStr || '0');
    const max = parseFloat(maxStr || '100');
    const dec = parseInt(decStr || '2', 10);
    return (Math.random() * (max - min) + min).toFixed(dec);
  },
  $randomString: (lengthStr) => {
    const length = parseInt(lengthStr || '8', 10);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomUpper: (lengthStr) => {
    const length = parseInt(lengthStr || '8', 10);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomLower: (lengthStr) => {
    const length = parseInt(lengthStr || '8', 10);
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomAlpha: (lengthStr) => {
    const length = parseInt(lengthStr || '8', 10);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  $randomEmail: () => `test_${crypto.randomBytes(4).toString('hex')}@example.com`,
  $randomPhone: () => `1${Math.floor(Math.random() * 9000000000) + 1000000000}`,
  $randomName: () => {
    const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Helen', 'Ivan', 'Judy'];
    return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
  },
  $randomIp: () => Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.'),
  $randomMac: () => Array.from({length: 6}, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':'),
  $randomBool: () => Math.random() > 0.5 ? 'true' : 'false',
};

// --- Transformers ---
const transformers: Record<string, (val: string, ...args: string[]) => string> = {
  base64: (val) => Buffer.from(val).toString('base64'),
  base64Decode: (val) => Buffer.from(val, 'base64').toString('utf8'),
  md5: (val) => crypto.createHash('md5').update(val).digest('hex'),
  sha1: (val) => crypto.createHash('sha1').update(val).digest('hex'),
  sha256: (val) => crypto.createHash('sha256').update(val).digest('hex'),
  hmac: (val, secret, algo) => crypto.createHmac(algo || 'sha256', secret || '').update(val).digest('hex'),
  urlEncode: (val) => encodeURIComponent(val),
  urlDecode: (val) => decodeURIComponent(val),
  uppercase: (val) => val.toUpperCase(),
  lowercase: (val) => val.toLowerCase(),
  substring: (val, startStr, endStr) => {
    const start = parseInt(startStr || '0', 10);
    const end = endStr ? parseInt(endStr, 10) : undefined;
    return val.substring(start, end);
  },
  replace: (val, search, replace) => val.split(search).join(replace || ''),
  trim: (val) => val.trim(),
  date: (val, formatStr, tzStr) => {
    let d = dayjs(val);
    if (tzStr) d = d.tz(tzStr);
    return d.format(formatStr || 'YYYY-MM-DDTHH:mm:ssZ');
  },
  split: (val, sep, indexStr) => {
    const arr = val.split(sep || ',');
    const idx = parseInt(indexStr || '0', 10);
    return arr[idx] || '';
  },
  default: (val, defValue) => val ? val : (defValue || ''),
  length: (val) => val.length.toString(),
  toJson: (val) => {
    try { return JSON.stringify(JSON.parse(val)); } catch { return JSON.stringify(val); }
  },
  jsonPath: (val, path) => {
    try {
      const res = JSONPath({ path: path || '$', json: JSON.parse(val) });
      return res.length > 0 ? (typeof res[0] === 'object' ? JSON.stringify(res[0]) : String(res[0])) : '';
    } catch {
      return '';
    }
  }
};

// --- Helper to parse function calls like "name(arg1, 'arg2')" ---
function parseCall(expr: string): { name: string, args: string[] } {
  const match = expr.match(/^([a-zA-Z0-9_$]+)(?:\((.*)\))?$/);
  if (!match) return { name: expr, args: [] };
  const name = match[1];
  const argsStr = match[2] || '';
  
  // Simple argument splitting by comma, stripping quotes and spaces
  const args = argsStr ? argsStr.split(',').map(s => {
    let trimmed = s.trim();
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      trimmed = trimmed.slice(1, -1);
    }
    return trimmed;
  }) : [];
  
  return { name, args };
}

export function interpolate(template: string, vars: Record<string, string>): string {
  if (!template) return '';

  let result = template;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const previous = result;
    result = result.replace(VARIABLE_PATTERN, (_, expression) => {
      const parts = expression.split('|').map((p: string) => p.trim());
      const baseExpr = parts[0];
      
      let currentValue: string | undefined;
      
      // 1. Resolve Base Value
      if (baseExpr.startsWith('$')) {
        // It's a generator
        const { name, args } = parseCall(baseExpr);
        if (generators[name]) {
          currentValue = generators[name](...args);
        } else {
          // Unknown generator, leave as is
          return `{{${expression}}}`;
        }
      } else {
        // It's a variable
        currentValue = vars[baseExpr];
        if (currentValue === undefined) {
          // Variable not found, leave as is
          return `{{${expression}}}`;
        }
      }
      
      // 2. Apply Transformers
      for (let i = 1; i < parts.length; i++) {
        const { name, args } = parseCall(parts[i]);
        if (transformers[name] && currentValue !== undefined) {
          currentValue = transformers[name](currentValue, ...args);
        }
      }
      
      return currentValue !== undefined ? currentValue : `{{${expression}}}`;
    });

    // No more substitutions occurred
    if (result === previous) break;
    iteration++;
  }

  return result;
}

/**
 * Checks whether a string contains any unresolved {{key}} placeholders.
 */
export function hasUnresolvedVars(str: string): boolean {
  if (!str) return false;
  return VARIABLE_PATTERN.test(str);
}

/**
 * Extracts all variable keys from a template string.
 * E.g. "Hello {{name}}, your id is {{id}}" => ["name", "id"]
 * Ignores generators (starting with $) and transformers.
 */
export function extractVarKeys(template: string): string[] {
  if (!template) return [];
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = re.exec(template)) !== null) {
    const expression = match[1];
    const baseExpr = expression.split('|')[0].trim();
    if (!baseExpr.startsWith('$')) {
      keys.push(baseExpr);
    }
  }
  return Array.from(new Set(keys));
}
