import { createCrudController } from '../../shared/crud.ts';
import { endpointService } from './service.ts';

export const endpointController = createCrudController(endpointService);
