import { createCrudController } from '../../shared/crud.ts';
import { reportService } from './service.ts';

export const reportController = createCrudController(reportService);
