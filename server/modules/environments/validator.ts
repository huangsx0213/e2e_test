import { z } from 'zod';

export const environmentNameSchema = z
  .string()
  .trim()
  .min(1, 'Environment name is required')
  .max(32, 'Environment name is too long');

export const environmentCreateSchema = z.object({
  name: environmentNameSchema,
});
