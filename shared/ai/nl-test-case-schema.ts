import { z } from 'zod';
import { PipelineBusinessFlowBlueprintSchema } from '../contracts/index.ts';

export const SelfReviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'major', 'minor']),
  category: z.enum(['atomicity', 'testability', 'coverage', 'repeatability', 'clarity', 'data-completeness']),
  description: z.string(),
  suggestion: z.string(),
});

export const SelfReviewSchema = z.object({
  score: z.number(),
  issues: z.array(SelfReviewIssueSchema),
  pass: z.boolean(),
});

export const TestDataSchema = z.object({
  key: z.string(), value: z.union([z.string(), z.number()]).transform(v => String(v)), description: z.string(),
});

export const StepSchema = z.object({
  sequence: z.number(), action: z.string(), expected: z.string(),
});

export const NlTestCaseSchema = z.object({
  id: z.string(), title: z.string(), requirementId: z.string(), conditionId: z.string(),
  techniqueApplied: z.string(), priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  preconditions: z.array(z.string()),
  testData: z.array(TestDataSchema),
  steps: z.array(StepSchema),
  postconditions: z.array(z.string()), tags: z.array(z.string()),
});

export const DesignerCaseSchema = NlTestCaseSchema.extend({
  selfReview: SelfReviewSchema,
});

export const DesignerOutputSchema = z.object({
  draftTestCases: z.array(DesignerCaseSchema),
});

export const QmInputCaseSchema = NlTestCaseSchema.extend({
  selfReview: SelfReviewSchema.optional(),
});

export const QmOutputCaseSchema = QmInputCaseSchema.extend({
  reviewSummary: z.string(),
  changeLog: z.array(z.object({
    source: z.enum(['agent-self-review', 'human-review', 'final-review']),
    changes: z.string(),
  })),
});

export const CoverageMatrixSchema = z.object({
  rows: z.array(z.object({
    requirementId: z.string(), requirementTitle: z.string(), level: z.string(),
    totalConditions: z.number(), testCaseCount: z.number(),
    techniqueBreakdown: z.record(z.string(), z.number()),
    categoryBreakdown: z.record(z.string(), z.number()),
    coveragePercentage: z.number(), uncoveredRisks: z.array(z.string()),
  })),
});

export const QMInputSchema = z.object({
  draftCases: z.array(QmInputCaseSchema),
  humanFeedback: z.string().optional(),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),
});

export const QMOutputSchema = z.object({
  finalTestCases: z.array(QmOutputCaseSchema),
  coverageMatrix: CoverageMatrixSchema,
});
