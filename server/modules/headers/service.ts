import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { headerRepository } from './repository.ts';
import { normalizeHeaderProfile } from './header.mapper.ts';
import { headerPatchSchema, headerPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: headerRepository,
  normalize: normalizeHeaderProfile,
});

export const headerService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(headerPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(headerPatchSchema, payload)),
};
