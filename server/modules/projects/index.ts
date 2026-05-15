import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeProject } from './mapper.ts';
import { projectRepository } from './repository.ts';
import { projectPatchSchema, projectPayloadSchema } from './schema.ts';

export const projectsModule = createCrudModule({
  basePath: '/api/projects',
  repository: projectRepository,
  normalize: normalizeProject,
  createSchema: projectPayloadSchema,
  patchSchema: projectPatchSchema,
});
