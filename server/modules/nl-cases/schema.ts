import { z } from 'zod';

const nlStepSchema = z.object({
  sequence: z.number(),
  action: z.string().min(1),
  expected: z.string().min(1),
});

const testDataSchema = z.object({
  key: z.string(),
  value: z.string(),
  description: z.string(),
});

export const nlCasePayloadSchema = z.object({
  title: z.string().min(1),
  requirementId: z.string().optional(),
  conditionId: z.string().optional(),
  techniqueApplied: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  category: z.string().optional(),
  preconditions: z.array(z.string()).optional().default([]),
  testData: z.array(testDataSchema).optional().default([]),
  steps: z.array(nlStepSchema),
  postconditions: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(['DRAFT', 'APPROVED', 'FINAL']).optional().default('DRAFT'),
});

export const nlCasePatchSchema = nlCasePayloadSchema.partial();