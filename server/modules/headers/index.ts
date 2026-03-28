import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeHeaderProfile } from './mapper.ts';
import { headerRepository } from './repository.ts';
import { headerPatchSchema, headerPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: headerRepository,
  normalize: normalizeHeaderProfile,
});

const headerService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(headerPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(headerPatchSchema, payload)),
};

const headerController = createCrudController(headerService);

const headerRoutes = createCrudRouter(headerController);

export const headersModule = {
  basePath: '/api/headers',
  router: headerRoutes,
};
