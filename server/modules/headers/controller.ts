import { createCrudController } from '../../shared/crud.ts';
import { headerService } from './service.ts';

export const headerController = createCrudController(headerService);
