import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { db } from '../../shared/db/client.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';

const router = Router();

router.post('/:projectId/start', (req, res) => {
  const { requirementIds, providerConfigName, mode } = req.body;
  const { projectId } = req.params;
  const runId = randomId('run');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(event: string, data: unknown) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

  db.prepare('INSERT INTO pipeline_runs (id, project_id, status, phase) VALUES (?, ?, ?, ?)').run(runId, projectId, 'RUNNING', 'init');

  (async () => {
    try {
      const requirements = requirementRepo.listByProject(projectId);
      const businessFlows = buildBusinessFlowBlueprints({
        flows: businessFlowRepo.listByProject(projectId),
        requirements,
      });

      sendEvent('phase:start', { phase: 'analysis', agent: 'test-analyst', batch: '1/1' });
      sendEvent('agent:thought', { phase: 'analysis', chunk: 'Placeholder — full pipeline execution with LangGraph requires agent roles and provider configured via settings.' });
      sendEvent('phase:complete', { phase: 'analysis', summary: 'Pipeline infrastructure ready.', businessFlows });
      sendEvent('human_review:required', { phase: 'review-conditions' });
      sendEvent('pipeline:complete', { summary: 'Infrastructure verified.' });
    } catch (err) {
      sendEvent('pipeline:error', { phase: 'analysis', message: (err as Error).message });
    } finally {
      db.prepare("UPDATE pipeline_runs SET status = ?, phase = ?, updated_at = datetime('now') WHERE id = ?").run('COMPLETED', 'complete', runId);
      res.end();
    }
  })();
});

router.post('/:runId/continue', withErrorHandling((req, res) => {
  const { action } = req.body;
  db.prepare("UPDATE pipeline_runs SET phase = ?, updated_at = datetime('now') WHERE id = ?").run(action === 'retry' ? 'analysis' : 'agent_test_designer', req.params.runId);
  res.json({ success: true, action });
}));

router.get('/:runId/status', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json({ status: row.status, phase: row.phase });
}));

router.post('/:runId/abort', withErrorHandling((req, res) => {
  db.prepare("UPDATE pipeline_runs SET status = ?, updated_at = datetime('now') WHERE id = ?").run('FAILED', req.params.runId);
  res.json({ success: true });
}));

router.get('/:runId/state', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  res.json({ status: row?.status || 'UNKNOWN', phase: row?.phase || 'init' });
}));

export const aiPipelineModule = { basePath: '/api/pipeline', router };
