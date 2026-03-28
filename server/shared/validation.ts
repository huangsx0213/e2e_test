import type { ZodType } from 'zod';

import { ValidationError } from './errors.ts';

export function validateWithSchema<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
  }

  return result.data;
}
