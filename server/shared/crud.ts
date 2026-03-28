import { Router } from 'express';
import type { Request, Response } from 'express';

import type { WithId } from '../utils.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { handleApiError } from './http.ts';

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export type CrudRepository<T extends WithId> = {
  list: () => T[];
  get: (id: string) => T | undefined;
  save: (record: Partial<T>) => T;
  remove: (id: string) => void;
};

export type CrudService<T extends WithId> = {
  list: () => T[];
  get: (id: string) => T | undefined;
  create: (payload: unknown) => T;
  update: (id: string, payload: unknown) => T | undefined;
  remove: (id: string) => void;
};

export type CrudController = {
  list: (req: Request, res: Response) => void;
  get: (req: Request, res: Response) => void;
  create: (req: Request, res: Response) => void;
  update: (req: Request, res: Response) => void;
  remove: (req: Request, res: Response) => void;
};

export function createCrudService<T extends WithId>(options: {
  repository: CrudRepository<T>;
  normalize: (payload: Partial<T>) => T;
}): CrudService<T> {
  const { repository, normalize } = options;

  return {
    list: repository.list,
    get: repository.get,
    create: (payload) => {
      const record = normalize((payload || {}) as Partial<T>);
      if (repository.get(record.id)) {
        throw new ConflictError(`Resource with id '${record.id}' already exists`);
      }
      return repository.save(record);
    },
    update: (id, payload) => {
      const existing = repository.get(id);
      if (!existing) {
        throw new NotFoundError();
      }

      const merged = normalize({
        ...existing,
        ...((payload || {}) as Partial<T>),
        id,
      });

      return repository.save(merged);
    },
    remove: repository.remove,
  };
}

export function createCrudController<T extends WithId>(service: CrudService<T>): CrudController {
  return {
    list: (req, res) => {
      try {
        res.json(service.list());
      } catch (error) {
        handleApiError(res, error);
      }
    },
    get: (req, res) => {
      try {
        const record = service.get(getParam(req.params.id));
        if (!record) {
          throw new NotFoundError();
        }

        res.json(record);
      } catch (error) {
        handleApiError(res, error);
      }
    },
    create: (req, res) => {
      try {
        res.json(service.create(req.body));
      } catch (error) {
        handleApiError(res, error);
      }
    },
    update: (req, res) => {
      try {
        const record = service.update(getParam(req.params.id), req.body);

        res.json(record);
      } catch (error) {
        handleApiError(res, error);
      }
    },
    remove: (req, res) => {
      try {
        service.remove(getParam(req.params.id));
        res.json({ success: true });
      } catch (error) {
        handleApiError(res, error);
      }
    },
  };
}

export function createCrudRouter(controller: CrudController) {
  const router = Router();

  router.get('/', (req, res) => {
    controller.list(req, res);
  });

  router.get('/:id', (req, res) => {
    controller.get(req, res);
  });

  router.post('/', (req, res) => {
    controller.create(req, res);
  });

  router.patch('/:id', (req, res) => {
    controller.update(req, res);
  });

  router.delete('/:id', (req, res) => {
    controller.remove(req, res);
  });

  return router;
}
