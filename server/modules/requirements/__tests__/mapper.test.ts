import { describe, it, expect } from 'vitest';
import { normalizeRequirement } from '../mapper.ts';

describe('normalizeRequirement', () => {
  it('generates id when missing', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.id).toMatch(/^req-/);
  });
  it('preserves provided id', () => {
    const result = normalizeRequirement({ id: 'req-custom', projectId: 'proj-1', title: 'Test' });
    expect(result.id).toBe('req-custom');
  });
  it('defaults title to New Requirement', () => {
    const result = normalizeRequirement({ projectId: 'proj-1' });
    expect(result.title).toBe('New Requirement');
  });
  it('defaults status to DRAFT', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test' });
    expect(result.status).toBe('DRAFT');
  });
  it('accepts null parentId', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test', parentId: null });
    expect(result.parentId).toBeUndefined();
  });
  it('preserves string parentId', () => {
    const result = normalizeRequirement({ projectId: 'proj-1', title: 'Test', parentId: 'req-parent' });
    expect(result.parentId).toBe('req-parent');
  });
  it('preserves existing level when updating position only', () => {
    const existing = {
      id: 'req-1',
      projectId: 'proj-1',
      title: 'Test',
      level: 'epic' as const,
      status: 'APPROVED' as const,
    };
    const merged = normalizeRequirement({ ...existing, position: 3, id: existing.id });
    expect(merged.level).toBe('epic');
    expect(merged.status).toBe('APPROVED');
  });
});
