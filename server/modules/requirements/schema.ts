import { z } from 'zod';

export const requirementPayloadSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  level: z.enum(['epic', 'feature', 'story', 'ac']).optional().default('story'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM'),
  status: z.enum(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DEPRECATED']).optional().default('DRAFT'),
  tags: z.array(z.string()).optional().default([]),
  position: z.number().optional().default(0),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const requirementPatchSchema = requirementPayloadSchema.partial();