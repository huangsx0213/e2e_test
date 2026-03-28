import { createCrudRouter } from '../../shared/crud.ts';
import { bodyController } from './controller.ts';

export const bodyRoutes = createCrudRouter(bodyController);
