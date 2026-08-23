import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';

import type { WithId } from '../utils/index.ts';
import { withErrorHandling } from './async-handler.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { validateWithSchema } from '../validation/validate.ts';

export function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export type CrudRepository<T extends WithId> = {
  list: () => T[];
  get: (id: string) => T | undefined;
  save: (record: Partial<T>) => T;
  remove: (id: string) => void | Promise<void>;
};

export type CrudService<T extends WithId> = {
  list: () => T[];
  get: (id: string) => T | undefined;
  create: (payload: unknown) => T;
  update: (id: string, payload: unknown) => T | undefined;
  remove: (id: string) => void | Promise<void>;
};

export type CrudController = {
  list: (req: Request, res: Response) => void;
  get: (req: Request, res: Response) => void;
  create: (req: Request, res: Response) => void;
  update: (req: Request, res: Response) => void;
  remove: (req: Request, res: Response) => void | Promise<void>;
};

export function createCrudService<T extends WithId>(options: {
  repository: CrudRepository<T>;
  normalize: (payload: Partial<T>) => T;
}): CrudService<T> {
  const { repository, normalize } = options;
  const list = repository.list.bind(repository);
  const get = repository.get.bind(repository);
  const remove = repository.remove.bind(repository);

  return {
    list,
    get,
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
        ...Object.fromEntries(
          Object.entries((payload || {}) as Record<string, unknown>).filter(([_, v]) => v !== undefined)
        ),
        id,
      });

      return repository.save(merged);
    },
    remove,
  };
}

export function createCrudController<T extends WithId>(service: CrudService<T>): CrudController {
  return {
    list: withErrorHandling((req, res) => {
      res.json(service.list());
    }),
    get: withErrorHandling((req, res) => {
      const record = service.get(getParam(req.params.id));
      if (!record) {
        throw new NotFoundError();
      }

      res.json(record);
    }),
    create: withErrorHandling((req, res) => {
      res.json(service.create(req.body));
    }),
    update: withErrorHandling((req, res) => {
      const record = service.update(getParam(req.params.id), req.body);
      res.json(record);
    }),
    remove: withErrorHandling(async (req, res) => {
      await service.remove(getParam(req.params.id));
      res.json({ success: true });
    }),
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

interface CrudModuleOptions<T extends WithId> {
  basePath: string;
  repository: CrudRepository<T>;
  normalize: (payload: Partial<T>) => T;
  createSchema?: ZodType<unknown>;
  patchSchema?: ZodType<unknown>;
}

export function createCrudModule<T extends WithId>(
  options: CrudModuleOptions<T>,
): { basePath: string; router: Router } {
  const baseService = createCrudService({ repository: options.repository, normalize: options.normalize });

  let service: CrudService<T> = baseService;
  if (options.createSchema || options.patchSchema) {
    service = {
      ...baseService,
      ...(options.createSchema ? {
        create: (payload: unknown) => baseService.create(validateWithSchema(options.createSchema!, payload)),
      } : {}),
      ...(options.patchSchema ? {
        update: (id: string, payload: unknown) => baseService.update(id, validateWithSchema(options.patchSchema!, payload)),
      } : {}),
    };
  }

  const controller = createCrudController(service);
  const router = createCrudRouter(controller);

  return { basePath: options.basePath, router };
}
