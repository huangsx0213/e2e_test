import { describe, expect, it } from 'vitest';
import { interpolate, hasUnresolvedVars, extractVarKeys } from '../interpolator.ts';

// ─── Basic Variable Substitution ───

describe('basic substitution', () => {
  it('replaces {{key}} with value', () => {
    expect(interpolate('Hello {{name}}', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('replaces multiple variables', () => {
    expect(interpolate('{{a}}-{{b}}-{{c}}', { a: '1', b: '2', c: '3' })).toBe('1-2-3');
  });

  it('returns template unchanged when no variables', () => {
    expect(interpolate('plain text', {})).toBe('plain text');
  });

  it('handles empty template', () => {
    expect(interpolate('', {})).toBe('');
  });

  it('leaves unknown variable unchanged', () => {
    expect(interpolate('{{missing}}', {})).toBe('{{missing}}');
  });
});

// ─── Nested Resolution ───

describe('nested resolution', () => {
  it('resolves variables referencing other variables', () => {
    expect(interpolate('{{url}}/{{path}}', { url: 'http://{{host}}', path: 'api/v1', host: 'example.com' })).toBe('http://example.com/api/v1');
  });

  it('stops after MAX_ITERATIONS (5)', () => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < 6; i++) vars[`v${i}`] = i < 5 ? `{{v${i + 1}}}` : 'final';
    expect(interpolate('{{v0}}', vars)).toBe('{{v5}}');
  });
});

// ─── Generators ───

describe('generators', () => {
  it('$uuid produces a UUID', () => {
    const result = interpolate('{{$uuid()}}', {});
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('$timestamp produces a number string', () => {
    const result = interpolate('{{$timestamp()}}', {});
    expect(result).toMatch(/^\d+$/);
  });

  it('$randomInt returns value within range', () => {
    for (let i = 0; i < 20; i++) {
      const result = parseInt(interpolate('{{$randomInt(10,20)}}', {}), 10);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    }
  });

  it('$randomFloat returns value with specified decimals', () => {
    const result = interpolate('{{$randomFloat(0,1,4)}}', {});
    const parts = result.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[1]).toHaveLength(4);
  });

  it('$randomString produces correct length', () => {
    expect(interpolate('{{$randomString(12)}}', {})).toHaveLength(12);
  });

  it('$now returns ISO string by default', () => {
    const result = interpolate('{{$now()}}', {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('$now formats with pattern', () => {
    const result = interpolate('{{$now(YYYY-MM-DD)}}', {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Transformers ───

describe('transformers', () => {
  it('uppercase transformer', () => {
    expect(interpolate('{{name | uppercase}}', { name: 'hello' })).toBe('HELLO');
  });

  it('lowercase transformer', () => {
    expect(interpolate('{{name | lowercase}}', { name: 'HELLO' })).toBe('hello');
  });

  it('base64 encode', () => {
    expect(interpolate('{{value | base64}}', { value: 'hello' })).toBe('aGVsbG8=');
  });

  it('base64 decode', () => {
    expect(interpolate('{{value | base64Decode}}', { value: 'aGVsbG8=' })).toBe('hello');
  });

  it('md5 hash', () => {
    expect(interpolate('{{value | md5}}', { value: 'hello' })).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('trim transformer', () => {
    expect(interpolate('{{value | trim}}', { value: '  hello  ' })).toBe('hello');
  });

  it('jsonPath transformer', () => {
    const body = JSON.stringify({ user: { name: 'Alice' } });
    expect(interpolate(`{{body | jsonPath($.user.name)}}`, { body })).toBe('Alice');
  });

  it('chained transformers', () => {
    expect(interpolate('{{value | trim | uppercase}}', { value: '  hello  ' })).toBe('HELLO');
  });
});

// ─── Edge Cases ───

describe('edge cases', () => {
  it('handles {{ with no closing', () => {
    expect(interpolate('{{unclosed', {})).toBe('{{unclosed');
  });

  it('handles empty placeholder {{}}', () => {
    expect(interpolate('{{}}', {})).toBe('{{}}');
  });

  it('handles special characters in values', () => {
    expect(interpolate('{{v}}', { v: 'a/b?c=1&d=2' })).toBe('a/b?c=1&d=2');
  });
});

// ─── hasUnresolvedVars ───

describe('hasUnresolvedVars', () => {
  it('returns true when {{}} present', () => {
    expect(hasUnresolvedVars('hello {{name}}')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasUnresolvedVars('hello world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasUnresolvedVars('')).toBe(false);
  });
});

// ─── extractVarKeys ───

describe('extractVarKeys', () => {
  it('extracts variable names', () => {
    expect(extractVarKeys('{{a}} and {{b}}')).toEqual(['a', 'b']);
  });

  it('ignores generators', () => {
    expect(extractVarKeys('{{name}} {{$uuid()}}')).toEqual(['name']);
  });

  it('strips transformers', () => {
    expect(extractVarKeys('{{name | upper}}')).toEqual(['name']);
  });

  it('returns unique keys', () => {
    expect(extractVarKeys('{{a}}{{a}}{{b}}')).toEqual(['a', 'b']);
  });

  it('returns empty for no variables', () => {
    expect(extractVarKeys('plain')).toEqual([]);
  });
});
