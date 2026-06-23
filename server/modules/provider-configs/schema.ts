import { z } from 'zod';

const providerTypes = ['azure-openai', 'openai-compatible', 'openai-responses'] as const;

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
  models: z.array(z.string()).optional(),
  fallbackConfigIds: z.array(z.string()).optional(),
  monthlyTokenLimit: z.number().int().positive().optional().nullable(),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  reasoningSummary: z.enum(['auto', 'detailed', 'concise']).optional(),
  textVerbosity: z.enum(['low', 'medium', 'high']).optional(),
  isActive: z.boolean().optional(),
});

export const providerConfigPatchSchema = providerConfigPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided' },
);