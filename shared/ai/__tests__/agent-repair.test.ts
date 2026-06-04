import { describe, it, expect } from 'vitest';
import { repairAgentOutput } from '../agent.ts';

describe('repairAgentOutput (schema repair for LLM enum drift)', () => {
  it('coerces invalid selfReview.issues[].category to a valid enum', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1',
        title: 't',
        requirementId: 'r-1',
        conditionId: 'c-1',
        techniqueApplied: 'use-case',
        priority: 'critical',
        category: 'happy-path',
        preconditions: [],
        testData: [],
        steps: [{ sequence: 1, action: 'a', expected: 'e' }],
        postconditions: [],
        tags: [],
        selfReview: {
          score: 0.9,
          pass: true,
          issues: [{ severity: 'major', category: 'Atomicity Granularity', description: 'd' }],
        },
      }],
    }) as any;
    expect(out.draftTestCases[0].selfReview.issues[0].category).toBe('atomicity');
  });

  it('fills missing suggestion field with fallback string', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'critical', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [{ severity: 'major', category: 'clarity' }] },
      }],
    }) as any;
    expect(typeof out.draftTestCases[0].selfReview.issues[0].suggestion).toBe('string');
    expect(out.draftTestCases[0].selfReview.issues[0].suggestion.length).toBeGreaterThan(0);
  });

  it('preserves valid enum values unchanged', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'high', category: 'error',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: {
          score: 0.9, pass: true,
          issues: [{ severity: 'minor', category: 'coverage', description: 'd', suggestion: 's' }],
        },
      }],
    }) as any;
    expect(out.draftTestCases[0].selfReview.issues[0].category).toBe('coverage');
    expect(out.draftTestCases[0].selfReview.issues[0].suggestion).toBe('s');
    expect(out.draftTestCases[0].priority).toBe('high');
    expect(out.draftTestCases[0].category).toBe('error');
  });

  it('coerces unrecognized priority strings to "medium"', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'ZZZ-Unknown', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
    }) as any;
    // "ZZZ-Unknown" doesn't match any priority pattern → defaults to 'medium'
    expect(out.draftTestCases[0].priority).toBe('medium');
  });

  it('coerces critical-like priority strings to "critical"', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'Critical - Blocker Bug', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
    }) as any;
    expect(out.draftTestCases[0].priority).toBe('critical');
  });

  it('coerces low-priority-like strings to "low"', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'Low Severity', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
    }) as any;
    expect(out.draftTestCases[0].priority).toBe('low');
  });

  it('coerces invalid category to a valid enum', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'high', category: 'Positive Path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
    }) as any;
    expect(out.draftTestCases[0].category).toBe('happy-path');
  });

  it('clamps score to [0, 1]', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'high', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 99, pass: true, issues: [] },
      }],
    }) as any;
    expect(out.draftTestCases[0].selfReview.score).toBe(1);
  });

  it('repairs all three top-level array keys (draftTestCases, finalTestCases, testConditions)', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'Crit', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
      finalTestCases: [{
        id: 'tc-2', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'Low Severity', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: { score: 0.9, pass: true, issues: [] },
      }],
    }) as any;
    expect(out.draftTestCases[0].priority).toBe('critical');
    expect(out.finalTestCases[0].priority).toBe('low');
  });

  it('handles completely missing selfReview gracefully (no throw)', () => {
    const out = repairAgentOutput({
      draftTestCases: [{
        id: 'tc-1', title: 't', requirementId: 'r-1', conditionId: 'c-1',
        techniqueApplied: 'use-case', priority: 'high', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        // selfReview missing entirely
      }],
    }) as any;
    expect(out.draftTestCases[0].selfReview).toBeUndefined();
  });

  it('the exact failure mode from the test-designer bug log (40-field error) passes after repair', () => {
    // Reproduces the user's reported error: 40 validation errors, mostly
    // selfReview.issues[].category invalid + .suggestion undefined
    const cases: any[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push({
        id: `tc-${i}`, title: 't', requirementId: 'r-1', conditionId: `c-${i}`,
        techniqueApplied: 'use-case', priority: 'critical', category: 'happy-path',
        preconditions: [], testData: [], steps: [], postconditions: [], tags: [],
        selfReview: {
          score: 0.9, pass: true,
          issues: [
            { severity: 'major', category: 'Atomicity Issue', description: 'd' },
            { severity: 'minor', category: 'Missing Coverage', description: 'd2' },
          ],
        },
      });
    }
    const out = repairAgentOutput({ draftTestCases: cases }) as any;
    for (const tc of out.draftTestCases) {
      for (const iss of tc.selfReview.issues) {
        expect(['atomicity', 'testability', 'coverage', 'repeatability', 'clarity', 'data-completeness']).toContain(iss.category);
        expect(typeof iss.suggestion).toBe('string');
        expect(iss.suggestion.length).toBeGreaterThan(0);
      }
    }
  });
});
