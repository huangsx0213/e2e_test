import { z } from 'zod';
import type { AgentRole } from '../agent.ts';

export const DesignerInputSchema = z.object({
  conditions: z.array(z.object({
    id: z.string(), requirementId: z.string(), condition: z.string(),
    category: z.string(), primaryTechnique: z.string(),
    coverageDimensions: z.array(z.object({ dimension: z.string(), variants: z.array(z.string()) })),
  })),
  projectContext: z.object({ name: z.string(), pages: z.array(z.object({ name: z.string() })), endpoints: z.array(z.object({ name: z.string(), method: z.string() })) }),
});

const SelfReviewIssueSchema = z.object({
  severity: z.enum(['blocker', 'major', 'minor']),
  category: z.enum(['atomicity', 'testability', 'coverage', 'repeatability', 'clarity', 'data-completeness']),
  description: z.string(),
  suggestion: z.string(),
});

const SelfReviewSchema = z.object({ score: z.number(), issues: z.array(SelfReviewIssueSchema), pass: z.boolean() });

export const DesignerOutputSchema = z.object({
  draftTestCases: z.array(z.object({
    id: z.string(), title: z.string(), requirementId: z.string(), conditionId: z.string(),
    techniqueApplied: z.string(), priority: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.object({ key: z.string(), value: z.string(), description: z.string() })),
    steps: z.array(z.object({ sequence: z.number(), action: z.string(), expected: z.string() })),
    postconditions: z.array(z.string()), tags: z.array(z.string()),
    selfReview: SelfReviewSchema,
  })),
});

export const TestDesignerRole: AgentRole = {
  name: 'test-designer',
  systemPromptTemplate: `You are an ISTQB-certified Test Design Engineer.
You design detailed natural language test cases from approved test conditions.

## Working Style
- Use the skills below for ISTQB design standards
- Follow ISTQB format: preconditions → test data → steps(action+expected) → postconditions
- Apply the assigned test technique for each condition
- After designing, perform self-quality review on all cases
- Each step is atomic (one action per step)
- Expected result is measurable and observable

## Input
{{input}}

## Output
Return valid JSON matching the output schema.`,
  requiredSkills: ['test-designer'],
  inputSchema: DesignerInputSchema,
  outputSchema: DesignerOutputSchema,
};