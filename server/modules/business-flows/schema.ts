import { z } from 'zod';

const stringEnum = <T extends string>(values: readonly [T, ...T[]]) => z.enum(values);

const businessFlowStepSchema = z.object({
  sequence: z.number(),
  requirementIds: z.array(z.string().min(1)).min(1),
  actionSummary: z.string(),
});

export const businessFlowPayloadSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: stringEnum(['happy-path', 'alternate', 'exception'] as const).optional(),
  status: stringEnum(['DRAFT', 'APPROVED'] as const).optional(),
  steps: z.array(businessFlowStepSchema).optional(),
});

export const businessFlowPatchSchema = businessFlowPayloadSchema.partial();
