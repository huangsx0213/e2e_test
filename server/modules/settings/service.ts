import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { settingsRepository } from './repository.ts';
import { normalizeSettings } from './settings.mapper.ts';
import { settingsPatchSchema, settingsPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: settingsRepository,
  normalize: normalizeSettings,
});

export const settingsService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(settingsPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(settingsPatchSchema, payload)),
};
