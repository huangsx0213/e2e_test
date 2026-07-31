import { Router } from 'express';
import { createCrudModule, getParam } from '../../shared/http/crud.ts';
import { requirementRepo } from './repository.ts';
import { normalizeRequirement } from './mapper.ts';
import { requirementPayloadSchema, requirementPatchSchema } from './schema.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { ValidationError } from '../../shared/http/errors.ts';
import { parseMarkdownRequirements, parseCsvRequirements } from './import.ts';

const baseModule = createCrudModule({
  basePath: '/api/requirements',
  repository: requirementRepo,
  normalize: normalizeRequirement,
  createSchema: requirementPayloadSchema,
  patchSchema: requirementPatchSchema,
});

const router = baseModule.router as Router;

router.get('/by-project/:projectId', withErrorHandling(async (req, res) => {
  const projectId = getParam(req.params.projectId);
  res.json(requirementRepo.listByProject(projectId));
}));

router.post('/:projectId/import', withErrorHandling(async (req, res) => {
  const projectId = getParam(req.params.projectId);
  const { content, format } = req.body;

  const result = format === 'csv'
    ? parseCsvRequirements(content, projectId)
    : parseMarkdownRequirements(content, projectId);

  for (const req of result.requirements) {
    requirementRepo.save(req);
  }

  res.json(result);
}));

// Update a requirement's primary key id with cascade updates for parentId
// and relatedRequirementIds references. Body: { newId: string }.
router.put('/:id/id', withErrorHandling(async (req, res) => {
  const oldId = getParam(req.params.id);
  const newId = String(req.body?.newId ?? '').trim();
  if (!newId) {
    throw new ValidationError('newId is required.');
  }
  if (!/^[a-z][a-z0-9_-]*$/i.test(newId)) {
    throw new ValidationError('newId must start with a letter and contain only letters, digits, hyphens, or underscores.');
  }
  const existing = requirementRepo.get(oldId);
  if (!existing) {
    throw new ValidationError(`Requirement ${oldId} not found.`);
  }
  if (newId === oldId) {
    res.json(existing);
    return;
  }
  const collision = requirementRepo.get(newId);
  if (collision) {
    throw new ValidationError(`ID "${newId}" is already used by another requirement.`);
  }
  requirementRepo.updateId(oldId, newId);
  res.json(requirementRepo.get(newId));
}));

export const requirementsModule = { basePath: '/api/requirements', router };