import { Router } from 'express';
import { agentRegistry } from './registry.ts';
import { getAgent, deleteAgent, saveAgent } from './repository.ts';

const router = Router();

// GET /api/agents - List all registered agents
router.get('/', (req, res) => {
  res.json(agentRegistry.list());
});

// PUT /api/agents/:id/status - Update agent status (e.g. enable/disable)
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  const agent = getAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Update DB
  const updated = saveAgent({ ...agent, status, lastSeen: Date.now() });

  // Update active connection if present
  const activeConn = (agentRegistry as any).activeConnections as Map<string, any>;
  if (activeConn.has(req.params.id)) {
      activeConn.get(req.params.id).status = status;
  }

  res.json(updated);
});

// PUT /api/agents/:id/labels - Update agent labels
router.put('/:id/labels', (req, res) => {
  const { labels } = req.body;
  if (!Array.isArray(labels)) {
    return res.status(400).json({ error: 'Labels must be an array of strings' });
  }

  const agent = getAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Update DB
  const updated = saveAgent({ ...agent, labels, lastSeen: Date.now() });

  // Update active connection if present
  const activeConn = (agentRegistry as any).activeConnections as Map<string, any>;
  if (activeConn.has(req.params.id)) {
      activeConn.get(req.params.id).labels = labels;
  }

  res.json(updated);
});

// DELETE /api/agents/:id - Remove agent from DB entirely
router.delete('/:id', (req, res) => {
  deleteAgent(req.params.id);
  
  // also terminate WS if present
  const activeConn = (agentRegistry as any).activeConnections as Map<string, any>;
  if (activeConn.has(req.params.id)) {
      const agent = activeConn.get(req.params.id);
      if (agent.ws) agent.ws.close();
      activeConn.delete(req.params.id);
  }

  res.json({ success: true });
});

export const agentsModule = {
  basePath: '/api/agents',
  router: router,
};

