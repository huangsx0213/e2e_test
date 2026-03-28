import { createCrudRouter } from '../../shared/crud.ts';
import { suiteController } from './controller.ts';

export const suiteRoutes = createCrudRouter(suiteController);
