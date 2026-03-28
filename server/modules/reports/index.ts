import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeExecutionReport } from './mapper.ts';
import { reportRepository } from './repository.ts';
import { reportPatchSchema, reportPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: reportRepository,
  normalize: normalizeExecutionReport,
});

const reportService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(reportPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(reportPatchSchema, payload)),
};

const reportController = createCrudController(reportService);

const reportRoutes = createCrudRouter(reportController);

export const reportsModule = {
  basePath: '/api/reports',
  router: reportRoutes,
};
