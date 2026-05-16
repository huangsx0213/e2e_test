import { createCrudModule } from '../../shared/http/crud.ts';
import { nlCaseRepo } from './repository.ts';
import { normalizeNlCase } from './mapper.ts';
import { nlCasePayloadSchema, nlCasePatchSchema } from './schema.ts';

export const nlCasesModule = createCrudModule({
  basePath: '/api/nl-cases',
  repository: nlCaseRepo,
  normalize: normalizeNlCase,
  createSchema: nlCasePayloadSchema,
  patchSchema: nlCasePatchSchema,
});