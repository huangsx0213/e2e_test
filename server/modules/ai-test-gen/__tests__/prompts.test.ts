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

  it('includes CRITICAL RULES section with conditionType decision table', () => {
    const prompt = buildAnalystSystemPrompt({
      batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 },
      currentBatch: [{ id: 'REQ-1', title: 'Login', level: 'L1', parentId: '' }],
      projectContext: { name: 'Demo Project', pages: [], endpoints: [] },
      businessFlowBlueprints: [],
      selectedFlowIds: [],
      humanReviewFeedback: '',
    } as any);

    expect(prompt).toContain('CRITICAL RULES');
    expect(prompt).toContain('Decision rule — assign `conditionType` per CONDITION');
    // The decision table renders the values as `flow` / `component` (with
    // backticks) so they stand out as enum literals.
    expect(prompt).toContain('`flow`');
    expect(prompt).toContain('`component`');
    // Anti-redundancy: non-overlap rule replaces the old rigid per-requirement quota
    expect(prompt).toContain('Non-overlap rule');
    expect(prompt).toContain('ANTI-REDUNDANCY');
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

  it('F18: Designer prompt mandates 操作原子性 with the exact failure mode observed in the run', () => {
    const prompt = buildDesignerSystemPrompt({
      approvedConditions: [],
      projectContext: { name: 'Demo Project', pages: [], endpoints: [] },
      businessFlowBlueprints: [],
      humanReviewFeedback: '',
    } as any);

    // The exact failure mode observed in the latest run appears in the table.
    expect(prompt).toContain('Submit the login form with admin/admin123');
    // F18 self-audit still names the four quick checks (verb / object / data / expected).
    expect(prompt).toContain('一个动词');
    expect(prompt).toContain('一个目标');
    expect(prompt).toContain('数据就在该 step 里');
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
    // F14: Quality must read the Analyst conditions first before judging.
    expect(prompt).toContain('Read the conditions first');
    // Test level fidelity: Quality must verify the Designer's testLevel by
    // inspecting steps (not by flipping the level). The old "at least one
    // component AND integration case" rigid quota was removed.
    expect(prompt).toContain('Test Level Fidelity');
    expect(prompt).toContain('do NOT flip a case from `component` to `integration`');
    // Anti-redundancy: Quality must check non-overlap between component and integration cases.
    expect(prompt).toContain('Redundancy (F17 — anti-overlap between component and flow cases, hard check)');
  });

  it('F18: Quality prompt enforces 操作原子性 against the same compound-action patterns', () => {
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

    // Quality rejects the exact compound pattern observed in the latest run.
    expect(prompt).toContain('Submit the login form with admin/admin123');
    // Quality applies the same 操作原子性 rule as the Designer.
    expect(prompt).toContain('Clarity (操作原子性，硬约束)');
    expect(prompt).toContain('只有一个动词');
  });
});
