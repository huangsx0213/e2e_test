import { describe, it, expect } from 'vitest';
import type { ZodType } from 'zod';
import { TestAnalystRole } from '../roles/test-analyst.ts';
import { TestDesignerRole } from '../roles/test-designer.ts';
import { QualityManagerRole } from '../roles/quality-manager.ts';

describe('TestAnalystRole', () => {
  it('validates analyst input schema', () => {
    const input = {
      requirements: [{ id: 'r1', title: 'Login', description: 'User login', level: 'story' as const, priority: 'HIGH' as const, tags: ['auth'], parentId: null }],
      batchContext: { currentBatch: 0, totalBatches: 1, processedCount: 0 },
      projectContext: { name: 'Test', pages: [], endpoints: [] },
    };
    const schema = TestAnalystRole.inputSchema as ZodType;
    const parsed = schema.parse(input) as { requirements: unknown[] };
    expect(parsed.requirements).toHaveLength(1);
  });

  it('rejects invalid analyst input', () => {
    expect(() => (TestAnalystRole.inputSchema as ZodType).parse({})).toThrow();
  });

  it('has correct required skills', () => {
    expect(TestAnalystRole.requiredSkills).toContain('test-analyst');
    expect(TestAnalystRole.requiredSkills).toContain('requirement-index');
  });
});

describe('TestDesignerRole', () => {
  it('validates designer input schema', () => {
    const input = {
      conditions: [{ id: 'c1', requirementId: 'r1', condition: 'Test login', category: 'happy-path', primaryTechnique: 'equivalence-partitioning', coverageDimensions: [{ dimension: 'email', variants: ['valid', 'invalid'] }] }],
      projectContext: { name: 'Test', pages: [], endpoints: [] },
    };
    const schema = TestDesignerRole.inputSchema as ZodType;
    const parsed = schema.parse(input) as { conditions: unknown[] };
    expect(parsed.conditions).toHaveLength(1);
  });

  it('has correct required skills', () => {
    expect(TestDesignerRole.requiredSkills).toContain('test-designer');
  });
});

describe('QualityManagerRole', () => {
  it('validates QM input schema', () => {
    const input = {
      draftCases: [{ id: 'tc1', title: 'Login test', requirementId: 'r1', conditionId: 'c1', techniqueApplied: 'EP', priority: 'high' as const, category: 'happy-path', preconditions: [], testData: [], steps: [{ sequence: 1, action: 'Enter email', expected: 'Field populated' }], postconditions: [], tags: [] }],
      humanFeedback: 'Looks good',
    };
    const schema = QualityManagerRole.inputSchema as ZodType;
    const parsed = schema.parse(input) as { draftCases: unknown[] };
    expect(parsed.draftCases).toHaveLength(1);
  });

  it('has correct required skills', () => {
    expect(QualityManagerRole.requiredSkills).toContain('quality-manager');
  });
});