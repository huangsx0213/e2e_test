import { Router } from 'express';
import { agentRegistry } from '../agent/registry.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/http/errors.ts';
import { randomId } from '../../shared/utils/index.ts';
import { saveSuite } from '../suites/repository.ts';
import { Log } from '../../shared/services/logger';
import type { TestSuite } from '../../../shared/contracts/index.ts';

const router = Router();

router.post('/start', withErrorHandling(async (req, res) => {
  const { targetUrl, projectId, apiFilter, apiFilterConfig, environment, agentId, caseId: reqCaseId, suiteId: reqSuiteId, mode } = req.body;

  if (!targetUrl || !projectId) {
    throw new ValidationError('targetUrl and projectId are required');
  }

  if (!agentId) {
    throw new ValidationError('agentId is required. Local server recording is not supported.');
  }

  const agent = agentRegistry.get(agentId);
  if (!agent?.ws || agent.ws.readyState !== 1) {
    throw new NotFoundError(`Agent '${agentId}' is not connected`);
  }
  if (agent.status !== 'idle') {
    throw new ConflictError(`Agent '${agentId}' is currently busy`);
  }

  // 创建 draft suite + case（如未提供）
  let caseId = reqCaseId;
  let suiteId = reqSuiteId;
  if (!caseId || !suiteId) {
    suiteId = randomId('draft-suite');
    caseId = randomId('draft-case');
    const suite: TestSuite = {
      id: suiteId,
      projectId,
      name: `Manual Recording (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      description: `Manual recording session started ${new Date().toISOString()}`,
      cases: [{ id: caseId, name: 'Recorded Steps', description: '', steps: [] }],
      position: 0,
    };
    saveSuite(suite);
    Log.for('recording').info(`Created draft suite ${suiteId} / case ${caseId} for manual recording`);
  }

  Log.for('recording').info(`Dispatching remote recording to agent ${agentId} for case ${caseId}`);
  agent.ws.send(JSON.stringify({
    event: 'RECORDING_START',
    data: {
      targetUrl,
      projectId,
      apiFilter: apiFilter?.trim(),
      apiFilterConfig,
      environment,
      caseId,
      suiteId,
      mode,
    },
  }), (err) => {
    if (err) Log.for('recording').error(`Failed to send recording start to agent ${agentId}: ${err}`);
  });

  res.json({ success: true, message: 'Recording started on agent', suiteId, caseId });
}));

router.post('/stop', withErrorHandling(async (req, res) => {
  const { agentId } = req.body || {};

  if (!agentId) {
    throw new ValidationError('agentId is required. Local server recording is not supported.');
  }

  const agent = agentRegistry.get(agentId);
  if (!agent?.ws || agent.ws.readyState !== 1) {
    throw new NotFoundError(`Agent '${agentId}' is not connected`);
  }

  Log.for('recording').info(`Dispatching recording stop to agent ${agentId}`);
  agent.ws.send(JSON.stringify({
    event: 'RECORDING_STOP',
    data: { agentId },
  }), (err) => {
    if (err) Log.for('recording').error(`Failed to send recording stop to agent ${agentId}: ${err}`);
  });

  res.json({ success: true, message: 'Recording stop sent to agent' });
}));

export const recordingRouter = router;
