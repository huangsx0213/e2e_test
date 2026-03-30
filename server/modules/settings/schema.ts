import { z } from 'zod';

export const settingsPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  currentProjectId: z.string().min(1),
  currentEnvironment: z.string().min(1),
  headlessMode: z.boolean().optional(),
});

export const settingsPatchSchema = settingsPayloadSchema.partial().refine(
  (value) => value.currentProjectId !== undefined || value.currentEnvironment !== undefined || value.headlessMode !== undefined,
  { message: 'At least one settings field must be provided' },
);
