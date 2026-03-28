import { z } from 'zod';
import { stepSchema } from '../../shared/schemas.ts';

const elementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  selectorType: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
});

const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  elements: z.array(elementSchema),
});

const moduleParamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
});

const moduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  params: z.array(moduleParamSchema),
  steps: z.array(stepSchema),
});

const scenarioSuiteSchema = z.object({
  id: z.string().min(1),
  suiteId: z.string().min(1),
  variableOverrides: z.record(z.string(), z.string()),
});

const scenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  suites: z.array(scenarioSuiteSchema),
});

export const projectPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(pageSchema).optional(),
  modules: z.array(moduleSchema).optional(),
  scenarios: z.array(scenarioSchema).optional(),
});

export const projectPatchSchema = projectPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one project field must be provided' },
);
