import { createCrudController } from '../../shared/crud.ts';
import { bodyService } from './service.ts';

export const bodyController = createCrudController(bodyService);
