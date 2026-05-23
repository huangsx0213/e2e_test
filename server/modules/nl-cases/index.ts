import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { nlCaseRepo } from './repository.ts';
import { normalizeNlCase } from './mapper.ts';
import { nlCasePayloadSchema, nlCasePatchSchema } from './schema.ts';

const crudModule = createCrudModule({
  basePath: '/api/nl-cases',
  repository: nlCaseRepo,
  normalize: normalizeNlCase,
  createSchema: nlCasePayloadSchema,
  patchSchema: nlCasePatchSchema,
});

crudModule.router.get('/by-project/:projectId', withErrorHandling((req, res) => {
  const cases = nlCaseRepo.listByProject(req.params.projectId as string);
  res.json(cases);
}));

export const nlCasesModule = crudModule;