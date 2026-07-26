import { describe, expect, it } from 'vitest';
import { parseStoryMarkdown, parseACMarkdown } from '../format-parser';

describe('frontend parseStoryMarkdown mirror', () => {
  it('parses three segments', () => {
    const result = parseStoryMarkdown('As a user\nI want to do x\nSo that y');
    expect(result.hasAllSegments).toBe(true);
    expect(result.role).toBe('user');
  });

  it('parses with colons', () => {
    const result = parseStoryMarkdown('As a: user\nI want: x\nSo that: y');
    expect(result.action).toBe('x');
  });
});

describe('frontend parseACMarkdown mirror', () => {
  it('parses Given/When/Then', () => {
    const result = parseACMarkdown('Given x\nWhen y\nThen z');
    expect(result.given).toBe('x');
    expect(result.when).toBe('y');
    expect(result.then).toBe('z');
    expect(result.hasAllSegments).toBe(true);
  });

  it('flags missing segments', () => {
    const result = parseACMarkdown('free-form');
    expect(result.hasAllSegments).toBe(false);
  });
});
