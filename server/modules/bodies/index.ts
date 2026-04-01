import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeBodyTemplate } from './mapper.ts';
import { bodyRepository } from './repository.ts';
import { bodyPatchSchema, bodyPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: bodyRepository,
  normalize: normalizeBodyTemplate,
});

const bodyService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(bodyPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(bodyPatchSchema, payload)),
};

const bodyController = createCrudController(bodyService);

const bodyRoutes = createCrudRouter(bodyController);

export const bodiesModule = {
  basePath: '/api/bodies',
  router: bodyRoutes,
};
