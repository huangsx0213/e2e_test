import { z } from 'zod';

export const startPipelineSchema = z.object({
  requirementIds: z.array(z.string()).min(1),
  providerConfigName: z.string().min(1),
  model: z.string().optional(),
  mode: z.enum(['auto', 'interactive']).default('auto'),
  flowIds: z.array(z.string()).optional(),
  name: z.string().optional(),
  includeFlowCases: z.boolean().optional().default(false),
  useCache: z.boolean().optional().default(false),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  reasoningSummary: z.enum(['auto', 'detailed', 'concise']).optional(),
  textVerbosity: z.enum(['low', 'medium', 'high']).optional(),
  referenceRunIds: z.array(z.string()).optional(),
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
