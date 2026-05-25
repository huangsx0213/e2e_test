import { z } from 'zod';

export const startPipelineSchema = z.object({
  requirementIds: z.array(z.string()).min(1, 'At least one requirement ID is required'),
  providerConfigName: z.string().min(1, 'Provider config name is required'),
  mode: z.enum(['auto', 'interactive']).default('auto'),
  flowIds: z.array(z.string()).optional(),
  name: z.string().optional(),
});

export const resumePipelineSchema = z.object({
  action: z.string().min(1, 'Action is required'),
  feedback: z.string().optional(),
  editedData: z.unknown().optional(),
});
