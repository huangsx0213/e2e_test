import { createCrudController } from '../../shared/crud.ts';
import { settingsService } from './service.ts';

export const settingsController = createCrudController(settingsService);
