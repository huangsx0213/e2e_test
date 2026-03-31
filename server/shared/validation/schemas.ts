import { z } from 'zod';

export const optionalNonEmptyString = z.string().min(1).optional();

export const stepSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  target: z.string(),
  data: z.string(),
  description: z.string().optional(),
  headerProfileId: optionalNonEmptyString,
  bodyTemplateId: optionalNonEmptyString,
  endpointId: optionalNonEmptyString,
  screenshot: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
