import { z } from 'zod';

export const optionalNonEmptyString = z.string().min(1).optional();

export const extractorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.enum([
    'API_BODY_JSON',
    'API_BODY_REGEX',
    'API_HEADER',
    'UI_TEXT',
    'UI_VALUE',
    'UI_ATTRIBUTE',
    'UI_PAGE_URL',
    'UI_PAGE_TITLE'
  ]),
  expression: z.string().optional(),
  scope: z.enum(['CASE', 'SUITE', 'ENVIRONMENT']),
});

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
  extractors: z.array(extractorSchema).optional(),
});

export const dynamicVariableSchema = z.object({
  name: z.string().min(1),
  expression: z.string().min(1),
  description: z.string().optional(),
});
