import { Router } from 'express';

import { environmentController } from './controller.ts';

const router = Router();

router.get('/', (req, res) => {
  environmentController.list(req, res);
});

router.post('/', (req, res) => {
  environmentController.create(req, res);
});

router.delete('/:name', (req, res) => {
  environmentController.remove(req, res);
});

export const environmentRoutes = router;
