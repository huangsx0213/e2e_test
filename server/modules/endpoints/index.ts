import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeApiEndpoint } from './mapper.ts';
import { endpointRepository } from './repository.ts';
import { endpointPatchSchema, endpointPayloadSchema } from './schema.ts';

export const endpointsModule = createCrudModule({
  basePath: '/api/endpoints',
  repository: endpointRepository,
  normalize: normalizeApiEndpoint,
  createSchema: endpointPayloadSchema,
  patchSchema: endpointPatchSchema,
});
