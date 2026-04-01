import { createCrudController, createCrudRouter, createCrudService } from '../../shared/http/crud.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { normalizeProject } from './mapper.ts';
import { projectRepository } from './repository.ts';
import { projectPatchSchema, projectPayloadSchema } from './schema.ts';

const baseService = createCrudService({
  repository: projectRepository,
  normalize: normalizeProject,
});

const projectService = {
  ...baseService,
  create: (payload: unknown) =>
    baseService.create(validateWithSchema(projectPayloadSchema, payload)),
  update: (id: string, payload: unknown) =>
    baseService.update(id, validateWithSchema(projectPatchSchema, payload)),
};

const projectController = createCrudController(projectService);

const projectRoutes = createCrudRouter(projectController);

export const projectsModule = {
  basePath: '/api/projects',
  router: projectRoutes,
};
