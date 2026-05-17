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
    expect(parseMarkdownRequirements('', 'proj-1').imported).toBe(0);
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
    expect(parseCsvRequirements('title,description,parent_title,priority', 'proj-1').imported).toBe(0);
  });
});