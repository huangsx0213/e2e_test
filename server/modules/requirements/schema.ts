import { z } from 'zod';

const stringEnum = <T extends string>(values: readonly [T, ...T[]]) => z.enum(values);

export const requirementPayloadSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  level: stringEnum(['epic', 'feature', 'story', 'ac'] as const).optional(),
  priority: stringEnum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).optional(),
  status: stringEnum(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DEPRECATED'] as const).optional(),
  tags: z.array(z.string()).optional(),
  position: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const requirementPatchSchema = requirementPayloadSchema.partial();
