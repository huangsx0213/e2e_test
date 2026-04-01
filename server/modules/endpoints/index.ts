import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeApiEndpoint } from './mapper.ts';
import { endpointRepository } from './repository.ts';
import { endpointPatchSchema, endpointPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: endpointRepository,
  normalize: normalizeApiEndpoint,
});

const endpointService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(endpointPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(endpointPatchSchema, payload)),
};

const endpointController = createCrudController(endpointService);

const endpointRoutes = createCrudRouter(endpointController);

export const endpointsModule = {
  basePath: '/api/endpoints',
  router: endpointRoutes,
};
