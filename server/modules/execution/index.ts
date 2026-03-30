import { Router } from 'express';
import type { ExecutionRequest } from '../../shared/contracts/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { ValidationError, NotFoundError } from '../../shared/http/errors.ts';
import { startExecution, getActiveRunLogger, isRunActive, abortActiveRun } from './runner.ts';
import { db } from '../../shared/db/client.ts';

const router = Router();

// POST /api/runners/execute — Start a new execution
router.post('/execute', withErrorHandling(async (req, res) => {
  const body = req.body as Partial<ExecutionRequest>;

  if (!body.type || !body.projectId || !body.environment) {
    throw new ValidationError('Missing required fields: type, projectId, environment');
  }

  if (body.type === 'case' && (!body.suiteId || !body.caseId)) {
    throw new ValidationError('Case execution requires suiteId and caseId');
  }

  if (body.type === 'suite' && !body.suiteId) {
    throw new ValidationError('Suite execution requires suiteId');
  }

  if (body.type === 'scenario' && !body.scenarioId) {
    throw new ValidationError('Scenario execution requires scenarioId');
  }

  if (isRunActive()) {
    res.status(409).json({ error: 'An execution is already running. Abort it first or wait for it to finish.' });
    return;
  }

  const request: ExecutionRequest = {
    type: body.type,
    projectId: body.projectId,
    environment: body.environment,
    suiteId: body.suiteId,
    caseId: body.caseId,
    scenarioId: body.scenarioId,
  };

  const { reportId, runId } = await startExecution(request);

  res.json({ reportId, runId, status: 'STARTED' });
}));

// GET /api/runners/stream/:reportId — SSE log stream
router.get('/stream/:reportId', (req, res) => {
  const reportId = req.params.reportId as string;
  const logger = getActiveRunLogger(reportId);

  if (!logger) {
    // Execution might have already finished — send a done event
    const run = db.prepare(
      'SELECT status FROM execution_runs WHERE report_id = ?'
    ).get(reportId) as { status: string } | undefined;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    if (run) {
      res.write(`event: done\ndata: ${JSON.stringify({ reportId, status: run.status, passRate: 0 })}\n\n`);
    } else {
      res.write(`event: done\ndata: ${JSON.stringify({ reportId, status: 'NOT_FOUND', passRate: 0 })}\n\n`);
    }
    res.end();
    return;
  }

  logger.addClient(res);
});

// GET /api/runners/status/:reportId — Check execution status
router.get('/status/:reportId', withErrorHandling((req, res) => {
  const reportId = req.params.reportId as string;

  const run = db.prepare(
    'SELECT id, report_id, type, status, started_at, finished_at, error_message FROM execution_runs WHERE report_id = ?'
  ).get(reportId) as {
    id: string;
    report_id: string;
    type: string;
    status: string;
    started_at: number | null;
    finished_at: number | null;
    error_message: string | null;
  } | undefined;

  if (!run) {
    throw new NotFoundError(`Execution run for report ${reportId} not found`);
  }

  res.json({
    runId: run.id,
    reportId: run.report_id,
    type: run.type,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    errorMessage: run.error_message,
  });
}));

// POST /api/runners/abort/:reportId — Abort a running execution
router.post('/abort/:reportId', withErrorHandling((req, res) => {
  if (!isRunActive()) {
    res.status(404).json({ error: 'No active execution to abort' });
    return;
  }

  const success = abortActiveRun();
  res.json({ success, message: success ? 'Abort signal sent' : 'No active run' });
}));

export const executionModule = {
  basePath: '/api/runners',
  router,
};
