import { describe, expect, it } from 'vitest';
import { parseStoryMarkdown, parseACMarkdown } from '../format-parser.ts';

describe('parseStoryMarkdown', () => {
  it('detects all three story segments', () => {
    const md = `As a signed-in user
I want to change my password
So that I can keep my account secure`;
    const result = parseStoryMarkdown(md);
    expect(result.role).toBe('signed-in user');
    expect(result.action).toBe('change my password');
    expect(result.value).toBe('keep my account secure');
    expect(result.hasAllSegments).toBe(true);
    expect(result.remainder).toBe('');
  });

  it('accepts "As an" prefix as alias for "As a"', () => {
    const md = `As an admin
I want to delete users
So that I can clean up`;
    const result = parseStoryMarkdown(md);
    expect(result.role).toBe('admin');
    expect(result.hasAllSegments).toBe(true);
  });

  it('allows trailing colon after prefix', () => {
    const md = `As a: admin
I want: delete
So that: cleanup`;
    const result = parseStoryMarkdown(md);
    expect(result.role).toBe('admin');
    expect(result.action).toBe('delete');
    expect(result.value).toBe('cleanup');
  });

  it('is case-insensitive on prefixes', () => {
    const md = `as a user
i WANT to do x
SO THAT y`;
    const result = parseStoryMarkdown(md);
    expect(result.role).toBe('user');
    expect(result.action).toBe('do x');
    expect(result.value).toBe('y');
  });

  it('captures non-matching lines as remainder', () => {
    const md = `As a user
I want to do x
Extra note line
So that y`;
    const result = parseStoryMarkdown(md);
    expect(result.hasAllSegments).toBe(true);
    expect(result.remainder).toBe('Extra note line');
  });

  it('returns hasAllSegments=false when segments missing', () => {
    const md = `Just some free-form prose
without any structure.`;
    const result = parseStoryMarkdown(md);
    expect(result.role).toBeUndefined();
    expect(result.hasAllSegments).toBe(false);
    expect(result.remainder).toContain('free-form prose');
  });

  it('handles empty input', () => {
    const result = parseStoryMarkdown('');
    expect(result.hasAllSegments).toBe(false);
    expect(result.remainder).toBe('');
  });
});

describe('parseACMarkdown', () => {
  it('detects all three AC segments', () => {
    const md = `Given user is signed in
When user clicks Save
Then a toast appears`;
    const result = parseACMarkdown(md);
    expect(result.given).toBe('user is signed in');
    expect(result.when).toBe('user clicks Save');
    expect(result.then).toBe('a toast appears');
    expect(result.hasAllSegments).toBe(true);
  });

  it('allows trailing colon after prefix', () => {
    const md = `Given: signed in
When: click Save
Then: toast`;
    const result = parseACMarkdown(md);
    expect(result.given).toBe('signed in');
    expect(result.when).toBe('click Save');
    expect(result.then).toBe('toast');
  });

  it('is case-insensitive on prefixes', () => {
    const md = `GIVEN x
when y
THEN z`;
    const result = parseACMarkdown(md);
    expect(result.given).toBe('x');
    expect(result.when).toBe('y');
    expect(result.then).toBe('z');
  });

  it('captures non-matching lines as remainder', () => {
    const md = `Given x
When y
Notes here
Then z`;
    const result = parseACMarkdown(md);
    expect(result.remainder).toBe('Notes here');
    expect(result.hasAllSegments).toBe(true);
  });

  it('returns hasAllSegments=false when segments missing', () => {
    const md = `Just a checklist item`;
    const result = parseACMarkdown(md);
    expect(result.hasAllSegments).toBe(false);
  });
});
