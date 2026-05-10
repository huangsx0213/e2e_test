import { z } from 'zod';

export const optionalNonEmptyString = z.string().min(1).optional();

export const extractorSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  source: z.enum([
    'API_BODY_JSON',
    'API_BODY_XML',
    'API_BODY_REGEX',
    'API_HEADER',
    'UI_TEXT',
    'UI_VALUE',
    'UI_ATTRIBUTE',
    'UI_PAGE_URL',
    'UI_PAGE_TITLE'
  ]),
  expression: z.string().optional(),
  scope: z.enum(['CASE', 'SUITE', 'SCENARIO', 'ENVIRONMENT']),
});

export const assertionSchema = z.object({
  id: z.string().min(1),
  source: z.enum([
    'API_BODY_JSON',
    'API_BODY_XML',
    'API_STATUS',
    'API_HEADER',
    'API_DURATION',
    'UI_TEXT',
    'UI_VALUE',
    'UI_ATTRIBUTE',
    'UI_PAGE_URL',
    'UI_PAGE_TITLE',
    'UI_ELEMENT_COUNT',
    'UI_ELEMENT_VISIBLE',
    'UI_ELEMENT_ENABLED'
  ]),
  expression: z.string().optional(),
  operator: z.enum([
    'EQUALS',
    'CONTAINS',
    'NOT_EQUALS',
    'NOT_CONTAINS',
    'EXISTS',
    'NOT_EXISTS',
    'MATCHES_REGEX',
    'GREATER_THAN',
    'LESS_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN_OR_EQUAL',
    'IS_TYPE',
    'HAS_LENGTH',
    'CONTAINS_KEY',
    'MATCHES_JSON_SCHEMA',
    'LESS_THAN_DURATION'
  ]),
  expectedValue: z.string().optional(),
  flags: z.string().optional(),
  message: z.string().optional(),
  continueOnFailure: z.boolean().optional(),
});

export const networkWaitSchema = z.object({
  enabled: z.boolean(),
  urlPattern: z.string(),
  method: z.string().optional(),
  expectedStatus: z.number().optional(),
  timeoutMs: z.number().optional(),
  extractors: z.array(extractorSchema).optional(),
});

export const networkMockSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  urlPattern: z.string(),
  method: z.string().optional(),
  status: z.number(),
  body: z.string(),
  delayMs: z.number().optional(),
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
  waitForNetwork: networkWaitSchema.optional(),
  networkMocks: z.array(networkMockSchema).optional(),
  assertions: z.array(assertionSchema).optional(),
  failureStrategy: z.enum(['fail-fast', 'soft']).optional(),
});

export const dynamicVariableSchema = z.object({
  name: z.string().min(1),
  expression: z.string().min(1),
  description: z.string().optional(),
});
