import { Router } from 'express';
import type { Request, Response } from 'express';

import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { environmentRepository } from './repository.ts';
import { environmentCreateSchema, environmentNameSchema } from './schema.ts';

function getName(req: Request): string {
  const value = req.params.name;
  return Array.isArray(value) ? value[0] || '' : value || '';
}

const environmentService = {
  list: () => environmentRepository.list(),
  create: (payload: unknown) => {
    const parsed = validateWithSchema(environmentCreateSchema, payload);
    return environmentRepository.create(parsed.name);
  },
  remove: (name: string) =>
    environmentRepository.remove(validateWithSchema(environmentNameSchema, name)),
};

const environmentController = {
  list: withErrorHandling((req: Request, res: Response) => {
    res.json(environmentService.list());
  }),
  create: withErrorHandling((req: Request, res: Response) => {
    res.json(environmentService.create(req.body));
  }),
  remove: withErrorHandling((req: Request, res: Response) => {
    environmentService.remove(getName(req));
    res.json({ success: true });
  }),
};

const environmentRoutes = Router();

environmentRoutes.get('/', (req, res) => {
  environmentController.list(req, res);
});

environmentRoutes.post('/', (req, res) => {
  environmentController.create(req, res);
});

environmentRoutes.delete('/:name', (req, res) => {
  environmentController.remove(req, res);
});

export const environmentsModule = {
  basePath: '/api/environments',
  router: environmentRoutes,
};
