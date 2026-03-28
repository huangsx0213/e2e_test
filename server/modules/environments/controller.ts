import type { Request, Response } from 'express';

import { handleApiError } from '../../shared/http.ts';
import { environmentService } from './service.ts';

function getName(req: Request): string {
  const value = req.params.name;
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export const environmentController = {
  list: (req: Request, res: Response) => {
    try {
      res.json(environmentService.list());
    } catch (error) {
      handleApiError(res, error);
    }
  },
  create: (req: Request, res: Response) => {
    try {
      res.json(environmentService.create(req.body));
    } catch (error) {
      handleApiError(res, error);
    }
  },
  remove: (req: Request, res: Response) => {
    try {
      environmentService.remove(getName(req));
      res.json({ success: true });
    } catch (error) {
      handleApiError(res, error);
    }
  },
};
