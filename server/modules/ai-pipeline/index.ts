import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { pipelineRepo } from './infrastructure/db/pipeline-repository.ts';
import { SSEGateway } from './infrastructure/sse/sse-gateway.ts';
import { PipelineService } from './application/pipeline-service.ts';
import { startPipelineSchema, resumePipelineSchema } from './schema.ts';

const router = Router();
const sseGateway = new SSEGateway();
const pipelineService = new PipelineService(sseGateway);

// --- Pipeline Runs List ---
function p(param: string | string[]): string {
  return typeof param === 'string' ? param : param[0];
}

// --- Pipeline Runs List ---
router.get('/runs/:projectId', withErrorHandling((req, res) => {
  res.json(pipelineRepo.listRunsByProject(p(req.params.projectId)));
}));

// --- Active Run ---
router.get('/active/:projectId', withErrorHandling((req, res) => {
  const run = pipelineRepo.getActiveRun(p(req.params.projectId));
  res.json(run);
}));

// --- Pipeline Logs ---
router.get('/:runId/logs', withErrorHandling((req, res) => {
  const runId = p(req.params.runId);
  const { agent } = req.query;
  res.json(pipelineRepo.getAgentLogs(runId, agent as string | undefined));
}));

// --- Single Run ---
router.get('/:runId', withErrorHandling((req, res) => {
  const row = pipelineRepo.getRun(p(req.params.runId));
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  const fullRow = pipelineRepo.getRunInfo(p(req.params.runId));
  if (!fullRow) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(fullRow);
}));

// --- Pipeline Info ---
router.get('/:runId/info', withErrorHandling((req, res) => {
  const info = pipelineRepo.getRunInfo(p(req.params.runId));
  if (!info) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(info);
}));

// --- Delete ---
router.delete('/:runId', withErrorHandling((req, res) => {
  const runId = p(req.params.runId);
  const row = pipelineRepo.getRun(runId);
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  pipelineService.deleteRun(runId);
  res.json({ success: true });
}));

// --- Abort ---
router.post('/:runId/abort', withErrorHandling((req, res) => {
  pipelineService.abortRun(p(req.params.runId));
  res.json({ success: true });
}));

// --- Resume (Interactive mode) ---
router.post('/:runId/resume', withErrorHandling((req, res) => {
  const { action, feedback, editedData } = validateWithSchema(resumePipelineSchema, req.body);
  pipelineService.resumeRun(p(req.params.runId), action, feedback, editedData);
  res.json({ success: true, action });
}));

// --- Start Pipeline ---
router.post('/:projectId/start', withErrorHandling((req, res) => {
  const projectId = p(req.params.projectId);
  const body = validateWithSchema(startPipelineSchema, req.body);

  const runId = randomId('run');

  pipelineRepo.createRun(runId, projectId, body.mode, {
    requirementIds: body.requirementIds,
    flowIds: body.flowIds ?? [],
    mode: body.mode,
    providerConfigName: body.providerConfigName,
    name: body.name,
  });

  res.json({ runId });

  pipelineService.startPipeline(runId, projectId, {
    requirementIds: body.requirementIds,
    providerConfigName: body.providerConfigName,
    mode: body.mode,
  });
}));

// --- SSE Stream ---
router.get('/:runId/stream', (req, res) => {
  sseGateway.attachStream(p(req.params.runId), res);
});

export const aiPipelineModule = { basePath: '/api/pipeline', router };
