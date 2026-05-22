import { z } from 'zod';
import type { AgentRole } from '../agent.ts';

const NlTestCaseInputSchema = z.object({
  id: z.string(), title: z.string(), requirementId: z.string(), conditionId: z.string(),
  techniqueApplied: z.string(), priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  preconditions: z.array(z.string()),
  testData: z.array(z.object({ key: z.string(), value: z.string(), description: z.string() })),
  steps: z.array(z.object({ sequence: z.number(), action: z.string(), expected: z.string() })),
  postconditions: z.array(z.string()), tags: z.array(z.string()),
  selfReview: z.object({ score: z.number(), issues: z.any(), pass: z.boolean() }).optional(),
});

export const QMInputSchema = z.object({
  draftCases: z.array(NlTestCaseInputSchema),
  humanFeedback: z.string().optional(),
});

export const QMOutputSchema = z.object({
  finalTestCases: z.array(z.object({
    id: z.string(), title: z.string(), requirementId: z.string(), conditionId: z.string(),
    techniqueApplied: z.string(), priority: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.object({ key: z.string(), value: z.string(), description: z.string() })),
    steps: z.array(z.object({ sequence: z.number(), action: z.string(), expected: z.string() })),
    postconditions: z.array(z.string()), tags: z.array(z.string()),
    reviewSummary: z.string(),
    changeLog: z.array(z.object({ source: z.enum(['agent-self-review', 'human-review', 'final-review']), changes: z.string() })),
  })),
  coverageMatrix: z.object({
    rows: z.array(z.object({
      requirementId: z.string(), requirementTitle: z.string(), level: z.string(),
      totalConditions: z.number(), testCaseCount: z.number(),
      techniqueBreakdown: z.record(z.string(), z.number()),
      categoryBreakdown: z.record(z.string(), z.number()),
      coveragePercentage: z.number(), uncoveredRisks: z.array(z.string()),
    })),
  }),
});

export const QualityManagerRole: AgentRole = {
  name: 'quality-manager',
  systemPromptTemplate: `You are an ISTQB-certified Test Quality Manager.
You review draft test cases and produce final quality-assured test cases.

## Working Style
- Use the skills below for ISTQB quality standards
- Review ALL draft cases from 6 quality dimensions
- Merge self-review findings from the Test Designer, cross-validate
- Fix all blocker and major issues
- Incorporate human feedback
- Generate a coverage matrix

## Input
{{input}}

## Output
Return valid JSON matching the output schema.`,
  requiredSkills: ['quality-manager'],
  inputSchema: QMInputSchema,
  outputSchema: QMOutputSchema,
};