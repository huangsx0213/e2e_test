import { Router } from 'express';
import { agentRegistry } from '../agent/registry.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/http/errors.ts';

const router = Router();

router.post('/start', withErrorHandling(async (req, res) => {
  const { targetUrl, projectId, apiFilter, apiFilterConfig, environment, agentId, caseId, suiteId, mode } = req.body;

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

  console.log(`[Recorder] Dispatching remote recording to agent ${agentId} for case ${caseId}`);
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
    if (err) console.error(`[Recorder] Failed to send recording start to agent ${agentId}:`, err);
  });

  res.json({ success: true, message: 'Recording started on agent' });
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

  console.log(`[Recorder] Dispatching recording stop to agent ${agentId}`);
  agent.ws.send(JSON.stringify({
    event: 'RECORDING_STOP',
    data: { agentId },
  }), (err) => {
    if (err) console.error(`[Recorder] Failed to send recording stop to agent ${agentId}:`, err);
  });

  res.json({ success: true, message: 'Recording stop sent to agent' });
}));

export const recordingRouter = router;
