import { createCrudRouter } from '../../shared/crud.ts';
import { projectController } from './controller.ts';

export const projectRoutes = createCrudRouter(projectController);
