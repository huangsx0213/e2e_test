import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeBodyTemplate } from './mapper.ts';
import { bodyRepository } from './repository.ts';
import { bodyPatchSchema, bodyPayloadSchema } from './schema.ts';

export const bodiesModule = createCrudModule({
  basePath: '/api/bodies',
  repository: bodyRepository,
  normalize: normalizeBodyTemplate,
  createSchema: bodyPayloadSchema,
  patchSchema: bodyPatchSchema,
});
