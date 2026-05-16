import { Router } from 'express';
import { dynamicVariableRepository } from './repository';
import { dynamicVariableSchema } from '../../shared/validation/schemas';
import { interpolate } from '../../shared/utils/interpolate';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { ValidationError } from '../../shared/http/errors.ts';
import { getParam } from '../../shared/http/crud.ts';

const router = Router();

// All routes use /api/ prefix to match apiFetch() client convention

// GET list
router.get('/api/projects/:projectId/dynamic-variables', withErrorHandling(async (req, res) => {
  const variables = dynamicVariableRepository.findByProjectId(getParam(req.params.projectId));
  res.json(variables);
}));

// POST create
router.post('/api/projects/:projectId/dynamic-variables', withErrorHandling(async (req, res) => {
  const data = dynamicVariableSchema.parse(req.body);
  const variable = dynamicVariableRepository.create(getParam(req.params.projectId), data);
  res.status(201).json(variable);
}));

// PATCH update
router.patch('/api/dynamic-variables/:id', withErrorHandling(async (req, res) => {
  const data = dynamicVariableSchema.partial().parse(req.body);
  const variable = dynamicVariableRepository.update(getParam(req.params.id), data);
  res.json(variable);
}));

// DELETE
router.delete('/api/dynamic-variables/:id', withErrorHandling(async (req, res) => {
  dynamicVariableRepository.delete(getParam(req.params.id));
  res.status(204).send();
}));

// preview (via apiFetch)
router.post('/api/dynamic-variables/preview', withErrorHandling((req, res) => {
  const { expression } = req.body;
  if (!expression) throw new ValidationError('Expression is required');
  const samples = [];
  for (let i = 0; i < 3; i++) {
    samples.push(interpolate(expression, {}));
  }
  res.json({ samples });
}));

export const dynamicVariableRouter = router;
