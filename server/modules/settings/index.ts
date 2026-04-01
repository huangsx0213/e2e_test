import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeSettings } from './mapper.ts';
import { settingsRepository } from './repository.ts';
import { settingsPatchSchema, settingsPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: settingsRepository,
  normalize: normalizeSettings,
});

const settingsService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(settingsPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(settingsPatchSchema, payload)),
};

const settingsController = createCrudController(settingsService);

const settingsRoutes = createCrudRouter(settingsController);

export const settingsModule = {
  basePath: '/api/settings',
  router: settingsRoutes,
};
