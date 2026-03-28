import { z } from 'zod';

const executionLogSchema = z.object({
  stepId: z.string().min(1),
  timestamp: z.number(),
  status: z.string().min(1),
  message: z.string(),
  screenshot: z.string().min(1).optional(),
});

export const reportPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  suiteId: z.string().min(1),
  suiteName: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  startTime: z.number(),
  endTime: z.number().optional(),
  status: z.string().min(1),
  passRate: z.number(),
  totalCases: z.number().optional(),
  passedCases: z.number().optional(),
  failedCases: z.number().optional(),
  logs: z.array(executionLogSchema),
});

export const reportPatchSchema = reportPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one report field must be provided' },
);
