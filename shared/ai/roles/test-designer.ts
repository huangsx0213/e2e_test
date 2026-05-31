import { z } from 'zod';
import type { AgentRole } from '../agent.ts';
import { DesignerOutputSchema } from '../nl-test-case-schema.ts';
import { PipelineBusinessFlowBlueprintSchema } from '../../contracts/index.ts';

export const DesignerInputSchema = z.object({
  conditions: z.array(z.object({
    id: z.string(), requirementId: z.string(), condition: z.string(),
    category: z.string(), primaryTechnique: z.string(),
    requirementLevel: z.string().optional(),
    riskLevel: z.string().optional(),
    priority: z.string().optional(),
    secondaryTechniques: z.array(z.string()).optional(),
    techniqueRationale: z.string().optional(),
    coverageDimensions: z.array(z.object({ dimension: z.string(), variants: z.array(z.string()) })),
  })),
  projectContext: z.object({ name: z.string(), pages: z.array(z.object({ name: z.string() })), endpoints: z.array(z.object({ name: z.string(), method: z.string() })) }),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),
  previousDraftCases: z.array(z.any()).optional(),
  humanFeedback: z.string().optional(),
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
- Step sequencing: each step MUST have a unique, sequential "sequence" number starting from 1, incrementing by 1 for every step. Never reuse or skip numbers. Steps are ordered by their sequence value.

## HITL Refinement / Retry Instructions
If 'humanFeedback' is provided in the input, you are in Refinement/Correction Mode:
- Thoroughly review 'humanFeedback' and the draft test cases in 'previousDraftCases'.
- Refine, correct, or rewrite the test cases as directed by the feedback. You have full autonomy to rewrite steps, preconditions, and postconditions to satisfy high quality standards.
- CRITICAL Traceability Rule:
  1. For any test case carried over or modified from 'previousDraftCases', you MUST keep its original 'id' unchanged.
  2. For any completely brand-new test case you add, you MUST generate a new unique 'id'.
  3. NEVER change the 'id' of a pre-existing test case that is still relevant.

## Skills
{{skills}}

## Input
{{input}}

## Output
Return valid JSON with exactly one top-level field:
- "draftTestCases" — array of draft test case objects (see skill for field details)

All fields inside each test case are required. Never omit any field.`,
  requiredSkills: ['test-designer', 'flow-design'],
  inputSchema: DesignerInputSchema,
  outputSchema: DesignerOutputSchema,
  allowedTools: ['execute_skill_module'],
};