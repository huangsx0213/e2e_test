import { createCrudService } from '../../shared/crud.ts';
import { validateWithSchema } from '../../shared/validation.ts';
import { normalizeProject } from './project.mapper.ts';
import { projectRepository } from './repository.ts';
import { projectPatchSchema, projectPayloadSchema } from './validator.ts';

const baseService = createCrudService({
  repository: projectRepository,
  normalize: normalizeProject,
});

export const projectService = {
  ...baseService,
  create: (payload: unknown) => baseService.create(validateWithSchema(projectPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(projectPatchSchema, payload)),
};
