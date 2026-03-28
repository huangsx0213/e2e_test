import { createCrudRouter } from '../../shared/crud.ts';
import { reportController } from './controller.ts';

export const reportRoutes = createCrudRouter(reportController);
