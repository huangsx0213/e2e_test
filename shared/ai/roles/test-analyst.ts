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

## CRITICAL WORKFLOW — follow these steps IN ORDER:

### Step 1: Call execute_skill_module (MANDATORY)
You MUST call this tool FIRST, before producing any output:
  execute_skill_module('test-analyst', 'analyzeConditions', [requirements, projectContext])

This returns pre-computed test conditions with ISTQB technique tags, risk ratings, and coverage dimensions. The result is the FOUNDATION for your work.

### Step 2: Refine with LLM reasoning
After receiving the deterministic results, refine them:
- Improve condition descriptions for clarity and specificity
- Fill coverage gaps the deterministic function missed
- Apply human feedback (if any) to adjust categories/risk levels
- Ensure every requirement has at least one test condition

### Step 3: Output JSON ONLY
Your final output MUST be a single valid JSON object — NO markdown, NO explanations, NO code blocks. Just raw JSON.

## FORBIDDEN BEHAVIORS
- DO NOT generate flow-based test cases or business flow scenarios — that is the test-designer's job
- DO NOT output markdown, code fences, or explanatory text — ONLY raw JSON
- DO NOT skip Step 1 — always call execute_skill_module first

## HITL Refinement / Retry Instructions
If 'humanFeedback' is provided in the input, you are in Refinement/Correction Mode:
- Thoroughly review 'humanFeedback' and the conditions in 'previousConditions'.
- Refine, correct, or rewrite the conditions as directed by the feedback.
- CRITICAL Traceability Rule:
  1. For any test condition carried over from 'previousConditions', keep its original 'id'.
  2. For any brand-new test condition, generate a new unique 'id'.

## Skills
{{skills}}

## Input
{{input}}

## Output Schema
Return valid JSON with exactly these two top-level fields:
1. "requirementAnalysis" — object with "overallApproach" and "riskAssessmentSummary" strings
2. "testConditions" — array of objects, each with: id, requirementId, requirementLevel (epic|feature|story|ac), condition, category (happy-path|alternate|error|boundary), riskLevel (high|medium|low), priority (critical|high|medium|low), primaryTechnique (equivalence-partitioning|boundary-value-analysis|decision-table|state-transition|use-case), secondaryTechniques (array of strings), techniqueRationale (string), coverageDimensions (array of {dimension, variants})

Both fields are REQUIRED. Never omit any field in testConditions.`,
  requiredSkills: ['test-analyst', 'requirement-index', 'requirement-query', 'requirement-analysis', 'flow-design'],
  inputSchema: BatchAnalystInputSchema,
  outputSchema: AnalystOutputSchema,
  options: { maxTokens: 128000 },
  allowedTools: ['search_skills', 'load_skill', 'execute_skill_module', 'fetch_requirement_resource'],
  useProgressiveDisclosure: true,
};