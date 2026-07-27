import { z } from 'zod';

const stringEnum = <T extends string>(values: readonly [T, ...T[]]) => z.enum(values);

export const requirementPayloadSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable().optional(),
  humanId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  level: stringEnum(['epic', 'story', 'ac'] as const).optional(),
  flowType: stringEnum(['atomic', 'flow'] as const).nullable().optional(),
  status: stringEnum(['DRAFT', 'APPROVED', 'DEPRECATED'] as const).optional(),
  type: stringEnum(['functional', 'non-functional', 'security', 'data'] as const).optional(),
  position: z.number().optional(),
  isFlow: z.boolean().optional(),
  relatedRequirementIds: z.array(z.string()).optional(),
});

export const requirementPatchSchema = requirementPayloadSchema.partial();
