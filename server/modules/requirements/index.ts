import { Router } from 'express';
import { createCrudModule, getParam } from '../../shared/http/crud.ts';
import { requirementRepo } from './repository.ts';
import { normalizeRequirement } from './mapper.ts';
import { requirementPayloadSchema, requirementPatchSchema } from './schema.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
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

export const requirementsModule = { basePath: '/api/requirements', router };