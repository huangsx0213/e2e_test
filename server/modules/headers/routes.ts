import { createCrudRouter } from '../../shared/crud.ts';
import { headerController } from './controller.ts';

export const headerRoutes = createCrudRouter(headerController);
