import { describe, it, expect } from 'vitest';
import { parseMarkdownRequirements, parseCsvRequirements } from '../import.ts';

describe('parseMarkdownRequirements', () => {
  it('parses simple hierarchy', () => {
    const md = '# Login Feature [CRITICAL]\nThis is the login epic.\n\n## Email Login\nUser logs in with email and password.\n\n### Verify email format\nThe email field must accept valid email addresses.';
    const result = parseMarkdownRequirements(md, 'proj-1');
    expect(result.imported).toBe(3);
    const epic = result.requirements.find(r => r.title.includes('Login Feature'));
    expect(epic?.priority).toBe('CRITICAL');
    expect(epic?.parentId).toBeUndefined();
  });
  it('returns 0 for empty input', () => {
    const result = parseMarkdownRequirements('', 'proj-1');
    expect(result.imported).toBe(0);
    expect(result.warnings).toEqual([]);
  });
  it('warns when heading exceeds max depth', () => {
    const md = '##### Deep heading';
    const result = parseMarkdownRequirements(md, 'proj-1');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('exceeding max depth');
  });
  it('warns when a sub-heading has no parent', () => {
    const md = '### Orphan story';
    const result = parseMarkdownRequirements(md, 'proj-1');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('has no parent');
  });
});

describe('parseCsvRequirements', () => {
  it('parses CSV with parent titles', () => {
    const csv = 'title,description,parent_title,priority\nLogin Epic,Main login functionality,,CRITICAL\nEmail Login,Login with email,Login Epic,HIGH';
    const result = parseCsvRequirements(csv, 'proj-1');
    expect(result.imported).toBe(2);
    expect(result.requirements[0].priority).toBe('CRITICAL');
  });
  it('returns 0 for header-only CSV', () => {
    const result = parseCsvRequirements('title,description,parent_title,priority', 'proj-1');
    expect(result.imported).toBe(0);
    expect(result.warnings).toEqual([]);
  });
  it('warns when parent_title is not found', () => {
    const csv = 'title,parent_title\nChild,NonExistentParent';
    const result = parseCsvRequirements(csv, 'proj-1');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('NonExistentParent');
  });
});