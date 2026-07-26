import { describe, expect, it } from 'vitest';
import { buildAnalystSystemPrompt, buildDesignerSystemPrompt, buildQualitySystemPrompt } from '../graph/prompts.ts';

describe('buildAnalystSystemPrompt', () => {
  it('explicitly calls out required test condition fields that are often omitted', () => {
    const prompt = buildAnalystSystemPrompt({
      batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
      currentBatch: [{ id: 'REQ-1', title: 'Login', level: 'L1', parentId: '' }],
      projectContext: { name: 'Demo Project', pages: [], endpoints: [] },
      businessFlowBlueprints: [],
      selectedFlowIds: [],
      humanReviewFeedback: '',
    } as any);

    expect(prompt).toContain('For EVERY object in `testConditions`, these fields are mandatory');
    expect(prompt).toContain('`requirementId` must be the exact source requirement ID');
    expect(prompt).toContain('`category` must be explicitly set');
    expect(prompt).toContain('end with a single JSON code block');
    expect(prompt).toContain('It must contain ALL test conditions');
  });

  it('includes CRITICAL RULES section with test level decision table', () => {
    const prompt = buildAnalystSystemPrompt({
      batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
      currentBatch: [{ id: 'REQ-1', title: 'Login', level: 'L1', parentId: '' }],
      projectContext: { name: 'Demo Project', pages: [], endpoints: [] },
      businessFlowBlueprints: [],
      selectedFlowIds: [],
      humanReviewFeedback: '',
    } as any);

    expect(prompt).toContain('CRITICAL RULES');
    expect(prompt).toContain('Decision table — assign testLevel per CONDITION');
    expect(prompt).toContain('testLevel:integration');
    expect(prompt).toContain('testLevel:component');
    expect(prompt).toContain('Per-requirement quota');
    expect(prompt).toContain('Final Self-Check');
  });
});

describe('buildDesignerSystemPrompt', () => {
  it('requires complete draftTestCases data without relying on output_result retries', () => {
    const prompt = buildDesignerSystemPrompt({
      approvedConditions: [{
        id: 'C-1',
        condition: 'Verify login',
        priority: 'high',
        category: 'functional',
        primaryTechnique: 'Equivalence Partitioning',
        secondaryTechniques: [],
        riskLevel: 'high',
        requirementId: 'REQ-1',
      }],
      projectContext: { name: 'Demo Project', pages: [], endpoints: [] },
      businessFlowBlueprints: [],
      humanReviewFeedback: '',
    } as any);

    expect(prompt).toContain('An empty object `{}` is always invalid');
    expect(prompt).toContain('Do not end your analysis until you have described at least one complete test case for extraction.');
    expect(prompt).toContain('For EVERY object in `draftTestCases`, these fields are mandatory');
    expect(prompt).toContain('end with a single JSON code block');
    expect(prompt).toContain('The block must contain COMPLETE data');
  });
});

describe('buildQualitySystemPrompt', () => {
  it('tells the reviewer to stop after analysis and let the system extract structured output', () => {
    const prompt = buildQualitySystemPrompt({
      approvedDraftCases: [{
        id: 'TC-1',
        title: 'Verify login',
        conditionId: 'C-1',
        requirementId: 'REQ-1',
        priority: 'high',
        category: 'functional',
        techniqueApplied: 'Equivalence Partitioning',
        preconditions: [],
        testData: [],
        steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
        tags: [],
      }],
      currentBatch: [{ id: 'REQ-1', title: 'Login', level: 'L1', parentId: '' }],
      humanReviewFeedback: '',
    } as any);

    expect(prompt).toContain('End with a single JSON code block containing the COMPLETE output. Nothing after it.');
    // Dual test level: Quality Manager must verify testLevel fidelity and batch-level mix
    expect(prompt).toContain('Test Level Fidelity');
    expect(prompt).toContain('at least one `component` case AND at least one `integration` case');
  });
});
