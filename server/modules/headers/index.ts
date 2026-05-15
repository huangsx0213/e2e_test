import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeHeaderProfile } from './mapper.ts';
import { headerRepository } from './repository.ts';
import { headerPatchSchema, headerPayloadSchema } from './schema.ts';

export const headersModule = createCrudModule({
  basePath: '/api/headers',
  repository: headerRepository,
  normalize: normalizeHeaderProfile,
  createSchema: headerPayloadSchema,
  patchSchema: headerPatchSchema,
});
