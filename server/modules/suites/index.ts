import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { suiteRepository } from './repository.ts';
import { normalizeSuite } from './mapper.ts';
import { suitePatchSchema, suitePayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: suiteRepository,
  normalize: normalizeSuite,
});

const suiteService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(suitePayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(suitePatchSchema, payload)),
};

const suiteController = createCrudController(suiteService);

const suiteRoutes = createCrudRouter(suiteController);

export const suitesModule = {
  basePath: '/api/suites',
  router: suiteRoutes,
};
