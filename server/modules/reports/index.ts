import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeExecutionReport } from './mapper.ts';
import { reportRepository } from './repository.ts';
import { reportPatchSchema, reportPayloadSchema } from './schema.ts';

export const reportsModule = createCrudModule({
  basePath: '/api/reports',
  repository: reportRepository,
  normalize: normalizeExecutionReport,
  createSchema: reportPayloadSchema,
  patchSchema: reportPatchSchema,
});
