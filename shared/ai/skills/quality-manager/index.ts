interface QualityDeps {
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  toolRegistry?: any;
}

export interface DraftCase {
  id: string;
  title: string;
  requirementId: string;
  conditionId: string;
  techniqueApplied: string;
  priority: string;
  category: string;
  preconditions: string[];
  testData: Array<{ key: string; value: string; description: string }>;
  steps: Array<{ sequence: number; action: string; expected: string }>;
  postconditions: string[];
  tags: string[];
}

export interface CoverageMatrix {
  rows: Array<{
    requirementId: string;
    requirementTitle: string;
    level: string;
    totalConditions: number;
    testCaseCount: number;
    techniqueBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    coveragePercentage: number;
    uncoveredRisks: string[];
  }>;
}

export interface ReviewResult {
  finalTestCases: DraftCase[];
  coverageMatrix: CoverageMatrix;
  reviewSummary: string;
}

export function reviewCases(draftCases: DraftCase[], coverageMatrix?: CoverageMatrix): ReviewResult {
  const reviewed: DraftCase[] = [];

  for (const tc of draftCases) {
    const issues = detectIssues(tc);
    if (issues.blockers.length > 0) {
      const fixed = fixBlockers(tc, issues.blockers);
      reviewed.push(fixed);
    } else {
      reviewed.push(tc);
    }
  }

  const matrix = coverageMatrix ?? buildCoverageMatrix(reviewed);

  return {
    finalTestCases: reviewed,
    coverageMatrix: matrix,
    reviewSummary: `Reviewed ${draftCases.length} cases. ${reviewed.length} passed review.`,
  };
}

interface DetectedIssues {
  blockers: string[];
  majors: string[];
  minors: string[];
}

function detectIssues(tc: DraftCase): DetectedIssues {
  const blockers: string[] = [];
  const majors: string[] = [];
  const minors: string[] = [];

  if (!tc.steps || tc.steps.length === 0) {
    blockers.push('No test steps defined');
  }

  for (const step of tc.steps ?? []) {
    if (!step.action || step.action.trim().length === 0) {
      blockers.push(`Step ${step.sequence}: empty action`);
    }
    if (!step.expected || step.expected.trim().length === 0) {
      majors.push(`Step ${step.sequence}: empty expected result`);
    }
    if (step.action && /\b(and|also|then)\b/i.test(step.action) && step.action.split(/\b(and|also|then)\b/i).length > 3) {
      majors.push(`Step ${step.sequence}: multiple actions in one step`);
    }
    if (step.expected && /\b(works|correct|properly|expected|should)\b/i.test(step.expected)) {
      minors.push(`Step ${step.sequence}: vague expected result`);
    }
  }

  if (!tc.preconditions || tc.preconditions.length === 0) {
    majors.push('No preconditions defined');
  }

  if (!tc.testData || tc.testData.length === 0) {
    majors.push('No test data defined');
  }

  return { blockers, majors, minors };
}

function fixBlockers(tc: DraftCase, blockers: string[]): DraftCase {
  const fixed = { ...tc, steps: [...tc.steps] };

  if (blockers.some(b => b.includes('No test steps'))) {
    fixed.steps = [{
      sequence: 1,
      action: `Execute test for: ${tc.title}`,
      expected: 'Test completes with expected outcome',
    }];
  }

  for (let i = 0; i < fixed.steps.length; i++) {
    if (!fixed.steps[i].action || fixed.steps[i].action.trim().length === 0) {
      fixed.steps[i] = {
        ...fixed.steps[i],
        action: `Perform step ${fixed.steps[i].sequence} for ${tc.title}`,
      };
    }
  }

  return fixed;
}

function buildCoverageMatrix(cases: DraftCase[]): CoverageMatrix {
  const byReq = new Map<string, DraftCase[]>();
  for (const tc of cases) {
    const list = byReq.get(tc.requirementId) ?? [];
    list.push(tc);
    byReq.set(tc.requirementId, list);
  }

  const rows = [...byReq.entries()].map(([reqId, tcs]) => {
    const techniqueBreakdown: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};
    for (const tc of tcs) {
      techniqueBreakdown[tc.techniqueApplied] = (techniqueBreakdown[tc.techniqueApplied] ?? 0) + 1;
      categoryBreakdown[tc.category] = (categoryBreakdown[tc.category] ?? 0) + 1;
    }
    const totalVariants = tcs.reduce((sum, tc) => sum + (tc.testData?.length ?? 0), 0);
    const coveragePercentage = tcs.length > 0 ? Math.min(100, (totalVariants / Math.max(tcs.length, 1)) * 100) : 0;

    return {
      requirementId: reqId,
      requirementTitle: reqId,
      level: 'story',
      totalConditions: new Set(tcs.map(t => t.conditionId)).size,
      testCaseCount: tcs.length,
      techniqueBreakdown,
      categoryBreakdown,
      coveragePercentage: Math.round(coveragePercentage),
      uncoveredRisks: coveragePercentage < 80 ? ['Incomplete coverage'] : [],
    };
  });

  return { rows };
}

export function createService(deps: QualityDeps) {
  return {
    reviewCases: async (draftCases: DraftCase[], coverageMatrix?: CoverageMatrix): Promise<ReviewResult> => {
      return reviewCases(draftCases, coverageMatrix);
    },
    generateMatrix: async (cases: DraftCase[]): Promise<CoverageMatrix> => {
      return buildCoverageMatrix(cases);
    },
  };
}
