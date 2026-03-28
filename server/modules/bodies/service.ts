import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { bodyRepository } from './repository.ts';
import { normalizeBodyTemplate } from './body.mapper.ts';
import { bodyPatchSchema, bodyPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: bodyRepository,
  normalize: normalizeBodyTemplate,
});

export const bodyService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(bodyPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(bodyPatchSchema, payload)),
};
