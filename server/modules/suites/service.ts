import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { suiteRepository } from './repository.ts';
import { normalizeSuite } from './suite.mapper.ts';
import { suitePatchSchema, suitePayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: suiteRepository,
  normalize: normalizeSuite,
});

export const suiteService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(suitePayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(suitePatchSchema, payload)),
};
