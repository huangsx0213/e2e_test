import { createCrudModule } from '../../shared/http/crud.ts';
import { testConditionRepo } from './repository.ts';
import { normalizeTestCondition } from './mapper.ts';
import { testConditionPayloadSchema, testConditionPatchSchema } from './schema.ts';

export const testConditionsModule = createCrudModule({
  basePath: '/api/test-conditions',
  repository: testConditionRepo,
  normalize: normalizeTestCondition,
  createSchema: testConditionPayloadSchema,
  patchSchema: testConditionPatchSchema,
});