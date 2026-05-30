import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { validateWithSchema } from '../../shared/validation/validate.ts';
import { pipelineRepo } from './infrastructure/db/test-gen-repository.ts';
import { SSEGateway } from './infrastructure/sse/sse-gateway.ts';
import { TestGenService } from './application/test-gen-service.ts';
import { startPipelineSchema, resumePipelineSchema, checkpointUpdateSchema } from './schema.ts';
import { deduplicateTestCases } from './application/result-deduplicator.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';

const router = Router();
const sseGateway = new SSEGateway();
const pipelineService = new TestGenService(sseGateway);

// --- Test Gen Runs List ---
function p(param: string | string[]): string {
  return typeof param === 'string' ? param : param[0];
}

// --- Test Gen Runs List ---
router.get('/runs/:projectId', withErrorHandling((req, res) => {
  res.json(pipelineRepo.listRunsByProject(p(req.params.projectId)));
}));

// --- Active Run ---
router.get('/active/:projectId', withErrorHandling((req, res) => {
  const run = pipelineRepo.getActiveRun(p(req.params.projectId));
  res.json(run);
}));

// --- Test Gen Logs ---
router.get('/:runId/logs', withErrorHandling((req, res) => {
  const runId = p(req.params.runId);
  const { agent } = req.query;
  res.json(pipelineRepo.getAgentLogs(runId, agent as string | undefined));
}));

// --- Single Run ---
router.get('/:runId', withErrorHandling((req, res) => {
  const row = pipelineRepo.getRun(p(req.params.runId));
  if (!row) { res.status(404).json({ error: 'Test gen run not found' }); return; }
  const fullRow = pipelineRepo.getRunInfo(p(req.params.runId));
  if (!fullRow) { res.status(404).json({ error: 'Test gen run not found' }); return; }
  res.json(fullRow);
}));

// --- Test Gen Info ---
router.get('/:runId/info', withErrorHandling((req, res) => {
  const info = pipelineRepo.getRunInfo(p(req.params.runId));
  if (!info) { res.status(404).json({ error: 'Test gen run not found' }); return; }
  res.json(info);
}));

// --- Delete ---
router.delete('/:runId', withErrorHandling((req, res) => {
  const runId = p(req.params.runId);
  const row = pipelineRepo.getRun(runId);
  if (!row) { res.status(404).json({ error: 'Test gen run not found' }); return; }
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

// --- Save edits via updateState ---
router.post('/:runId/checkpoint-update', withErrorHandling(async (req, res) => {
    const { editedData, checkpointNumber } = validateWithSchema(checkpointUpdateSchema, req.body);
    await pipelineService.saveCheckpointEdits(p(req.params.runId), editedData, checkpointNumber);
    res.json({ success: true });
}));

// --- Export test cases to NL Cases table ---
router.post('/:runId/save-cases', withErrorHandling((req, res) => {
  const runId = p(req.params.runId);
  const run = pipelineRepo.getRun(runId);
  if (!run) { res.status(404).json({ error: 'Run not found' }); return; }

  const logs = pipelineRepo.getAgentLogs(runId, 'quality_manager');
  const allCases: any[] = [];
  for (const log of logs) {
    if (log.output_data?.finalTestCases) {
      allCases.push(...log.output_data.finalTestCases);
    }
  }
  if (allCases.length === 0) { res.status(400).json({ error: 'No test cases found to export' }); return; }

  const { allCases: deduped, removedCount } = deduplicateTestCases(allCases);
  for (const tc of deduped) {
    nlCaseRepo.save({ ...tc, projectId: run.project_id });
  }
  res.json({ saved: deduped.length, removed: removedCount });
}));

// --- Audit Log ---
router.get('/:runId/audit', withErrorHandling((req, res) => {
  res.json(pipelineRepo.getAuditLogs(p(req.params.runId)));
}));

// --- Get checkpoint state from LangGraph checkpointer ---
router.get('/:runId/checkpoint-state', withErrorHandling(async (req, res) => {
  const runId = p(req.params.runId);
  const result = await pipelineService.getCheckpointState(runId);
  res.json({ checkpointData: result });
}));

// --- Start Test Gen ---
router.post('/:projectId/start', withErrorHandling((req, res) => {
  const projectId = p(req.params.projectId);
  const body = validateWithSchema(startPipelineSchema, req.body);

  const runId = randomId('ai-pl');

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
    flowIds: body.flowIds ?? [],
    includeFlowCases: body.includeFlowCases,
    useCache: body.useCache,
  });
}));

// --- SSE Stream ---
router.get('/:runId/stream', (req, res) => {
  sseGateway.attachStream(p(req.params.runId), res);
});

export async function recoverInterruptedTestGenRuns(): Promise<void> {
  await pipelineService.recoverInterruptedRuns();
  pipelineService.startCheckpointTimeoutMonitor();
}

export const aiTestGenModule = { basePath: '/api/test-gen', router };
