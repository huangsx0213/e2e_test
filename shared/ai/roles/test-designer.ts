import { z } from 'zod';
import type { AgentRole } from '../agent.ts';
import { DesignerOutputSchema } from '../nl-test-case-schema.ts';
import { PipelineBusinessFlowBlueprintSchema } from '../../contracts/index.ts';

export const DesignerInputSchema = z.object({
  conditions: z.array(z.object({
    id: z.string(), requirementId: z.string(), condition: z.string(),
    category: z.string(), primaryTechnique: z.string(),
    coverageDimensions: z.array(z.object({ dimension: z.string(), variants: z.array(z.string()) })),
  })),
  projectContext: z.object({ name: z.string(), pages: z.array(z.object({ name: z.string() })), endpoints: z.array(z.object({ name: z.string(), method: z.string() })) }),
  businessFlowBlueprints: z.array(PipelineBusinessFlowBlueprintSchema).optional(),
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
};