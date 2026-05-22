import { z } from 'zod';
import type { AgentRole } from '../agent.ts';

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
    category: z.enum(['happy-path', 'alternate', 'error', 'boundary']),
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

## Input
{{input}}

## Output
Return valid JSON matching the output schema.`,
  requiredSkills: ['test-analyst', 'requirement-index', 'requirement-query', 'requirement-analysis'],
  inputSchema: BatchAnalystInputSchema,
  outputSchema: AnalystOutputSchema,
};