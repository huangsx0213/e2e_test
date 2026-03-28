import { z } from 'zod';

const headerItemSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  enabled: z.boolean(),
});

export const headerPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  headers: z.array(headerItemSchema),
});

export const headerPatchSchema = headerPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one header field must be provided' },
);
