import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { reportRepository } from './repository.ts';
import { normalizeExecutionReport } from './report.mapper.ts';
import { reportPatchSchema, reportPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: reportRepository,
  normalize: normalizeExecutionReport,
});

export const reportService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(reportPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(reportPatchSchema, payload)),
};
