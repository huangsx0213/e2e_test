import { Router } from 'express';
import { agentRegistry } from '../agent/registry.ts';

const router = Router();

router.post('/start', async (req, res) => {
  const { targetUrl, projectId, apiFilter, apiFilterConfig, environment, agentId, caseId, suiteId, mode } = req.body;

  if (!targetUrl || !projectId) {
    return res.status(400).json({ error: 'targetUrl and projectId are required' });
  }

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required. Local server recording is not supported.' });
  }

  try {
    const agent = agentRegistry.get(agentId);
    if (!agent?.ws || agent.ws.readyState !== 1) {
      return res.status(404).json({ error: `Agent '${agentId}' is not connected` });
    }
    if (agent.status !== 'idle') {
      return res.status(409).json({ error: `Agent '${agentId}' is currently busy` });
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
      if (err) {
        console.error(`[Recorder] Failed to send recording start to agent ${agentId}:`, err);
      } else {
        console.log(`[Recorder] Recording start message sent to agent ${agentId}`);
      }
    });

    return res.json({ success: true, message: 'Recording started on agent' });
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  const { agentId } = req.body || {};

  if (!agentId) {
    return res.status(400).json({ error: 'agentId is required. Local server recording is not supported.' });
  }

  try {
    const agent = agentRegistry.get(agentId);
    if (!agent?.ws || agent.ws.readyState !== 1) {
      return res.status(404).json({ error: `Agent '${agentId}' is not connected` });
    }

    console.log(`[Recorder] Dispatching recording stop to agent ${agentId}`);
    agent.ws.send(JSON.stringify({
      event: 'RECORDING_STOP',
      data: { agentId },
    }), (err) => {
      if (err) {
        console.error(`[Recorder] Failed to send recording stop to agent ${agentId}:`, err);
      } else {
        console.log(`[Recorder] Recording stop message sent to agent ${agentId}`);
      }
    });

    return res.json({ success: true, message: 'Recording stop sent to agent' });
  } catch (error: any) {
    console.error('Failed to stop recording:', error);
    res.status(500).json({ error: error.message });
  }
});

export const recordingModule = {
  basePath: '/api/recording',
  router,
};
