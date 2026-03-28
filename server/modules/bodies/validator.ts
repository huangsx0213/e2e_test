import { z } from 'zod';

export const bodyPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  contentType: z.string().min(1),
  content: z.string(),
  defaultValues: z.record(z.string(), z.string()),
});

export const bodyPatchSchema = bodyPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one body field must be provided' },
);
