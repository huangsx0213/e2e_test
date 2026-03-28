import { createCrudController } from '../../shared/crud.ts';
import { projectService } from './service.ts';

export const projectController = createCrudController(projectService);
