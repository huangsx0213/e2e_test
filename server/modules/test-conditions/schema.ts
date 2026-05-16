import { z } from 'zod';

export const testConditionPayloadSchema = z.object({
  requirementId: z.string(),
  requirementLevel: z.enum(['epic', 'feature', 'story', 'ac']).optional().default('story'),
  condition: z.string().min(1),
  category: z.enum(['happy-path', 'alternate', 'error', 'boundary']).optional().default('happy-path'),
  riskLevel: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  dataRequirements: z.string().optional(),
  dependencies: z.array(z.string()).optional().default([]),
  primaryTechnique: z.enum(['equivalence-partitioning', 'boundary-value-analysis', 'decision-table', 'state-transition', 'use-case']),
  secondaryTechniques: z.array(z.string()).optional().default([]),
  techniqueRationale: z.string().optional().default(''),
  coverageDimensions: z.array(z.object({
    dimension: z.string(),
    variants: z.array(z.string()),
  })).optional().default([]),
});

export const testConditionPatchSchema = testConditionPayloadSchema.partial();