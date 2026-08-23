import { createCrudModule } from '../../shared/http/crud.ts';
import { deleteProjectTestGenData } from '../ai-test-gen/runtime.ts';
import { normalizeProject } from './mapper.ts';
import { projectRepository } from './repository.ts';
import { projectPatchSchema, projectPayloadSchema } from './schema.ts';

export function createProjectRepositoryWithTestGenLifecycle(
  repository: typeof projectRepository,
  deleteTestGenData: (projectId: string) => Promise<void> = deleteProjectTestGenData,
) {
  return {
    ...repository,
    remove: (projectId: string) => deleteTestGenData(projectId),
  };
}

const projectRepositoryWithTestGenLifecycle =
  createProjectRepositoryWithTestGenLifecycle(projectRepository);

export const projectsModule = createCrudModule({
  basePath: '/api/projects',
  repository: projectRepositoryWithTestGenLifecycle,
  normalize: normalizeProject,
  createSchema: projectPayloadSchema,
  patchSchema: projectPatchSchema,
});
