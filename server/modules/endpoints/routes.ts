import { createCrudRouter } from '../../shared/crud.ts';
import { endpointController } from './controller.ts';

export const endpointRoutes = createCrudRouter(endpointController);
