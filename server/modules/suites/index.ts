import { createCrudModule } from '../../shared/http/crud.ts';
import { suiteRepository } from './repository.ts';
import { normalizeSuite } from './mapper.ts';
import { suitePatchSchema, suitePayloadSchema } from './schema.ts';

export const suitesModule = createCrudModule({
  basePath: '/api/suites',
  repository: suiteRepository,
  normalize: normalizeSuite,
  createSchema: suitePayloadSchema,
  patchSchema: suitePatchSchema,
});
