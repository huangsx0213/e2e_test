import { z } from 'zod';

export const startPipelineSchema = z.object({
  requirementIds: z.array(z.string()).min(1, 'At least one requirement ID is required'),
  providerConfigName: z.string().min(1, 'Provider config name is required'),
  mode: z.enum(['auto', 'interactive']).default('auto'),
  flowIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  includeFlowCases: z.boolean().optional().default(false),
  useCache: z.boolean().optional().default(false),
});

export const resumePipelineSchema = z.object({
  action: z.enum(['approve', 'retry']),
  feedback: z.string().optional(),
  editedData: z.any().optional(),
});

export const checkpointUpdateSchema = z.object({
  editedData: z.record(z.string(), z.unknown()),
  checkpointNumber: z.number().min(1).max(3),
});
