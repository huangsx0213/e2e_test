import { describe, expect, it } from 'vitest';
import { deduplicateTestCases, groupRequirementsByEpic } from '../helpers.ts';

describe('deduplicateTestCases', () => {
  it('removes cases with the same title and identical steps', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['step1'] },
      { title: 'Login Test', steps: ['step1'] },
      { title: 'Other Test', steps: ['step2'] },
    ]);
    expect(result.allCases).toHaveLength(2);
    expect(result.removedCount).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it('records conflict when same title has different steps', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['step1'] },
      { title: 'Login Test', steps: ['step2'] },
    ]);
    expect(result.allCases).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatch(/Duplicate.*title.*Login Test/);
  });

  it('keeps cases with empty titles', () => {
    const result = deduplicateTestCases([
      { title: '', steps: [] },
      { title: '', steps: [] },
    ]);
    expect(result.allCases).toHaveLength(2);
  });

  it('normalizes title whitespace for comparison', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['x'] },
      { title: '  login   test  ', steps: ['x'] },
    ]);
    expect(result.removedCount).toBe(1);
  });

  it('keeps cases with the same title but different testLevel', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['s1'], testLevel: 'component' },
      { title: 'Login Test', steps: ['s2'], testLevel: 'integration' },
    ]);
    expect(result.allCases).toHaveLength(2);
    expect(result.removedCount).toBe(0);
  });

  it('still dedups same title and same testLevel', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['s1'], testLevel: 'component' },
      { title: 'Login Test', steps: ['s1'], testLevel: 'component' },
    ]);
    expect(result.allCases).toHaveLength(1);
    expect(result.removedCount).toBe(1);
  });

  it('dedups by conditionId + testLevel (preferred over title)', () => {
    // Same conditionId + same testLevel → duplicate even if titles differ
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['s1'], testLevel: 'component', conditionId: 'cond-1' },
      { title: 'Different Title', steps: ['s1'], testLevel: 'component', conditionId: 'cond-1' },
    ]);
    expect(result.allCases).toHaveLength(1);
    expect(result.removedCount).toBe(1);
  });

  it('keeps same conditionId with different testLevel', () => {
    const result = deduplicateTestCases([
      { title: 'Login Test', steps: ['s1'], testLevel: 'component', conditionId: 'cond-1' },
      { title: 'Login Test', steps: ['s2'], testLevel: 'integration', conditionId: 'cond-1' },
    ]);
    expect(result.allCases).toHaveLength(2);
    expect(result.removedCount).toBe(0);
  });
});

describe('groupRequirementsByEpic', () => {
  const allIndex = [
    { id: 'epic-1', parent: null, level: 0, title: 'Auth Epic' },
    { id: 'story-1', parent: 'epic-1', level: 1, title: 'Login Story' },
    { id: 'story-2', parent: 'epic-1', level: 1, title: 'Logout Story' },
    { id: 'epic-2', parent: null, level: 0, title: 'Reports Epic' },
    { id: 'story-3', parent: 'epic-2', level: 1, title: 'Report Story' },
  ];

  it('groups selected items by their root epic', () => {
    const result = groupRequirementsByEpic(allIndex, new Set(['story-1', 'story-3']));
    expect(result.totalBatches).toBe(2);
    expect(result.epics.map(e => e.id)).toEqual(['epic-1', 'epic-2']);
    expect(result.rootGroups.get('epic-1')).toEqual(['story-1']);
    expect(result.rootGroups.get('epic-2')).toEqual(['story-3']);
  });

  it('walks up to root for nested items', () => {
    const nested = [
      { id: 'epic-1', parent: null, level: 0, title: 'Epic' },
      { id: 'story-1', parent: 'epic-1', level: 1, title: 'Story' },
      { id: 'ac-1', parent: 'story-1', level: 3, title: 'AC' },
    ];
    const result = groupRequirementsByEpic(nested, new Set(['ac-1']));
    expect(result.rootGroups.get('epic-1')).toEqual(['ac-1']);
  });

  it('returns empty epics when nothing selected', () => {
    const result = groupRequirementsByEpic(allIndex, new Set());
    expect(result.epics).toEqual([]);
    expect(result.totalBatches).toBe(0);
  });
});

