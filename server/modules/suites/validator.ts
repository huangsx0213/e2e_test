import { z } from 'zod';

import { stepSchema } from '../../shared/schemas.ts';

const suiteVariableSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  value: z.string(),
});

const dataRowSchema = z.record(z.string(), z.string());

const testCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(stepSchema),
  setupSteps: z.array(stepSchema).optional(),
  teardownSteps: z.array(stepSchema).optional(),
});

export const suitePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  cases: z.array(testCaseSchema),
  variables: z.array(suiteVariableSchema),
  dataRows: z.array(dataRowSchema),
  setupSteps: z.array(stepSchema).optional(),
  teardownSteps: z.array(stepSchema).optional(),
});

export const suitePatchSchema = suitePayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one suite field must be provided' },
);
