import { createCrudRouter } from '../../shared/crud.ts';
import { settingsController } from './controller.ts';

export const settingsRoutes = createCrudRouter(settingsController);
