import { z } from 'zod';
import type { AgentRole } from '../agent.ts';
import { PipelineBusinessFlowBlueprintSchema } from '../../contracts/index.ts';

export const BatchAnalystInputSchema = z.object({
  requirements: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    level: z.enum(['epic', 'feature', 'story', 'ac']),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    tags: z.array(z.string()),
    parentId: z.string().nullable().optional(),
  })),
  batchContext: z.object({
    currentBatch: z.number(),
    totalBatches: z.number(),
    processedCount: z.number(),
  }),
  projectContext: z.object({
    name: z.string(),
    pages: z.array(z.object({ name: z.string() })),
    endpoints: z.array(z.object({ name: z.string(), method: z.string() })),
  }),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),
  previousConditions: z.array(z.any()).optional(),
  humanFeedback: z.string().optional(),
});

export const AnalystOutputSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string(),
    riskAssessmentSummary: z.string(),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    requirementLevel: z.enum(['epic', 'feature', 'story', 'ac']),
    condition: z.string(),
    category: z.enum(['happy-path', 'alternate', 'error', 'boundary']).catch('alternate'),
    riskLevel: z.enum(['high', 'medium', 'low']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    primaryTechnique: z.enum(['equivalence-partitioning', 'boundary-value-analysis', 'decision-table', 'state-transition', 'use-case']),
    secondaryTechniques: z.array(z.string()),
    techniqueRationale: z.string(),
    coverageDimensions: z.array(z.object({ dimension: z.string(), variants: z.array(z.string()) })),
  })),
});

export const TestAnalystRole: AgentRole = {
  name: 'test-analyst',
  systemPromptTemplate: `You are an ISTQB-certified Test Analyst.
You analyze requirements and produce test conditions.

## Working Style
- Use the skills below for ISTQB rules and domain knowledge
- Extract atomic test conditions — each tests ONE specific thing
- Classify and prioritize by risk + business value
- Select appropriate ISTQB test design techniques
- Always use the requirement-query skill to load requirements progressively

## HITL Refinement / Retry Instructions
If 'humanFeedback' is provided in the input, you are in Refinement/Correction Mode:
- Thoroughly review 'humanFeedback' and the conditions in 'previousConditions'.
- Refine, correct, or rewrite the conditions as directed by the feedback. You have full autonomy to restructure or rewrite scenarios and use cases in order to achieve the highest possible quality.
- CRITICAL Traceability Rule:
  1. For any test condition carried over or modified from 'previousConditions', you MUST keep its original 'id' unchanged.
  2. For any completely brand-new test condition you add, you MUST generate a new unique 'id'.
  3. NEVER change the 'id' of a pre-existing condition that is still relevant.

## Skills
{{skills}}

## Input
{{input}}

## Output
Return valid JSON with exactly these two top-level fields:
1. "requirementAnalysis" — object with "overallApproach" and "riskAssessmentSummary" strings
2. "testConditions" — array of condition objects (see skill for field details)

Both fields are required. Never omit requirementAnalysis.

## Technique Constraint
The "primaryTechnique" field in testConditions MUST be one of exactly these 5 values — no other technique names are accepted:
- equivalence-partitioning
- boundary-value-analysis
- decision-table
- state-transition
- use-case
Any other value (like "error-guessing", "exploratory-testing", etc.) will be rejected.`,
  requiredSkills: ['test-analyst', 'requirement-index', 'requirement-query', 'requirement-analysis', 'flow-design'],
  inputSchema: BatchAnalystInputSchema,
  outputSchema: AnalystOutputSchema,
  options: { maxTokens: 128000 },
};