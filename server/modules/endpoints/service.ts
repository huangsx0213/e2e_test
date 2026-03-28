import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { endpointRepository } from './repository.ts';
import { normalizeApiEndpoint } from './endpoint.mapper.ts';
import { endpointPatchSchema, endpointPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: endpointRepository,
  normalize: normalizeApiEndpoint,
});

export const endpointService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(endpointPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(endpointPatchSchema, payload)),
};
