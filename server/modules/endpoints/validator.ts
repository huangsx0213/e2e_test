import { z } from 'zod';

const endpointParameterSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  enabled: z.boolean(),
});

export const endpointPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  method: z.string().min(1).optional(),
  baseUrls: z.record(z.string(), z.string()).refine(
    (value) => Object.keys(value).length > 0,
    { message: 'At least one base URL must be provided' },
  ),
  parameters: z.array(endpointParameterSchema),
});

export const endpointPatchSchema = endpointPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one endpoint field must be provided' },
);
