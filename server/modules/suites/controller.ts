import { createCrudController } from '../../shared/crud.ts';
import { suiteService } from './service.ts';

export const suiteController = createCrudController(suiteService);
