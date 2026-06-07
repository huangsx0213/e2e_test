import { z } from 'zod';

const providerTypes = ['azure-openai', 'nvidia-nim', 'openrouter', 'openai', 'agnes-ai'] as const;

export const providerConfigPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(providerTypes),
  endpoint: z.string().optional(),
  encryptedApiKey: z.string().min(1, 'API key is required'),
  deployment: z.string().optional(),
  apiVersion: z.string().optional(),
  model: z.string().optional(),
  fallbackConfigIds: z.array(z.string()).optional(),
  monthlyTokenLimit: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const providerConfigPatchSchema = providerConfigPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided' },
);