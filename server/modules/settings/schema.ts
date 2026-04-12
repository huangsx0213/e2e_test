import { z } from 'zod';

export const settingsPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  currentProjectId: z.string().min(1),
  currentEnvironment: z.string().min(1),
  headlessMode: z.boolean().optional(),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  recordVideo: z.boolean().optional(),
});

export const settingsPatchSchema = settingsPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one settings field must be provided' },
);
