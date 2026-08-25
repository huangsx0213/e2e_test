// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findCaseStartUrl, normalizeExplicitStartUrl } from '../start-url.ts';

function makeCase(over: Partial<{ preconditions: string[]; testData: Array<{ key: string; value: string }> }> = {}) {
  return {
    preconditions: over.preconditions ?? [],
    testData: over.testData ?? [],
  } as any;
}

describe('findCaseStartUrl', () => {
  it('finds a bare URL precondition', () => {
    expect(findCaseStartUrl(makeCase({ preconditions: ['https://app.com/login'] }))).toBe('https://app.com/login');
  });

  it('finds a URL inline with prose and strips trailing CJK punctuation', () => {
    expect(findCaseStartUrl(makeCase({ preconditions: ['先访问 https://app.com/login。'] }))).toBe('https://app.com/login');
  });

  it('strips trailing ASCII punctuation from the match', () => {
    expect(findCaseStartUrl(makeCase({ preconditions: ['Go to https://app.com/login, then sign in.'] }))).toBe('https://app.com/login');
  });

  it('finds a testData entry whose key contains url', () => {
    expect(findCaseStartUrl(makeCase({ testData: [{ key: 'loginUrl', value: 'https://app.com/' }] }))).toBe('https://app.com/');
  });

  it('returns null when nothing matches (scheme-less or missing)', () => {
    expect(findCaseStartUrl(makeCase())).toBeNull();
    expect(findCaseStartUrl(makeCase({ preconditions: ['app.com/login without scheme'] }))).toBeNull();
    expect(findCaseStartUrl(makeCase({ testData: [{ key: '起始地址', value: 'https://app.com/' }] }))).toBeNull();
  });
});

describe('normalizeExplicitStartUrl', () => {
  it('trims and keeps absolute URLs unchanged', () => {
    expect(normalizeExplicitStartUrl('  https://app.com/login  ')).toBe('https://app.com/login');
  });

  it('prepends https:// when the scheme is missing', () => {
    expect(normalizeExplicitStartUrl('app.example.com/login')).toBe('https://app.example.com/login');
    expect(normalizeExplicitStartUrl('www.foo.com')).toBe('https://www.foo.com');
  });

  it('preserves port and query/path', () => {
    expect(normalizeExplicitStartUrl('localhost:3000/app?x=1')).toBe('https://localhost:3000/app?x=1');
  });

  it('throws a readable error for garbage input', () => {
    expect(() => normalizeExplicitStartUrl('not a url at all')).toThrow(/Invalid start URL/);
    expect(() => normalizeExplicitStartUrl('   ')).toThrow(/Invalid start URL/);
  });
});
