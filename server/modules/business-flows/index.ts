import { Router } from 'express';

import { createCrudModule, getParam } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { businessFlowRepo } from './repository.ts';
import { normalizeBusinessFlow } from './mapper.ts';
import { businessFlowPatchSchema, businessFlowPayloadSchema } from './schema.ts';
import { validateBusinessFlowForApproval } from './validation.ts';

const baseModule = createCrudModule({
  basePath: '/api/business-flows',
  repository: businessFlowRepo,
  normalize: normalizeBusinessFlow,
  createSchema: businessFlowPayloadSchema,
  patchSchema: businessFlowPatchSchema,
});

const router = baseModule.router as Router;

router.get('/by-project/:projectId', withErrorHandling(async (req, res) => {
  const projectId = getParam(req.params.projectId);
  res.json(businessFlowRepo.listByProject(projectId));
}));

router.post('/:id/approve', withErrorHandling(async (req, res) => {
  const flow = businessFlowRepo.get(getParam(req.params.id));
  if (!flow) {
    res.status(404).json({ error: 'Business flow not found' });
    return;
  }

  validateBusinessFlowForApproval(flow, requirementRepo.listByProject(flow.projectId));

  res.json(businessFlowRepo.save({ ...flow, status: 'APPROVED' }));
}));

router.post('/:id/unapprove', withErrorHandling(async (req, res) => {
  const flow = businessFlowRepo.get(getParam(req.params.id));
  if (!flow) {
    res.status(404).json({ error: 'Business flow not found' });
    return;
  }

  res.json(businessFlowRepo.save({ ...flow, status: 'DRAFT' }));
}));

export const businessFlowsModule = { basePath: '/api/business-flows', router };
