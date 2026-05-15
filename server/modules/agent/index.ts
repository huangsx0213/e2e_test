import { Router } from 'express';
import { agentRegistry } from './registry.ts';
import { getAgent, deleteAgent, saveAgent } from './repository.ts';
import { agentLogBuffer } from './log-buffer.ts';
import { createAgentPackage } from './agent-bundler.ts';
import os from 'os';

const router = Router();

export function getInternalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// GET /api/agents - List all registered agents
router.get('/', (req, res) => {
  res.json(agentRegistry.list());
});

// GET /api/agents/server-info - Get server's internal IP and base URL
router.get('/server-info', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host') || '';
  const hostName = host.split(':')[0];
  const isLocalOrIp = hostName === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostName) || hostName === '127.0.0.1';
  
  const internalIp = getInternalIp();
  const port = host.includes(':') ? ':' + host.split(':')[1] : '';
  
  res.json({
    internalIp,
    host,
    isLocal: isLocalOrIp,
    baseUrl: isLocalOrIp ? `http://${internalIp}${port}` : `${protocol}://${host}`
  });
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
  agentRegistry.updateStatus(req.params.id, status as 'idle' | 'busy' | 'offline' | 'disabled');

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
  agentRegistry.updateLabels(req.params.id, labels);

  res.json(updated);
});

// GET /api/agents/:id/logs - Get buffered logs (snapshot)
router.get('/:id/logs', (req, res) => {
  const logs = agentLogBuffer.getBuffer(req.params.id);
  res.json(logs);
});

// GET /api/agents/:id/logs/stream - Live SSE stream of agent logs
router.get('/:id/logs/stream', (req, res) => {
  agentLogBuffer.addSSEClient(req.params.id, res);
});

// GET /api/agents/download - Generate and download pre-configured agent package
router.get('/download', async (req, res) => {
  try {
    // Determine the server URL
    // Rule: Use the protocol and host from the request (trusting proxy if configured)
    const protocol = req.protocol === 'https' ? 'wss' : 'ws';
    const host = req.get('host') || '';
    
    // Check if we are running in a local/internal environment
    const hostName = host.split(':')[0];
    const isLocalOrIp = hostName === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostName) || hostName === '127.0.0.1';
    
    let serverUrl: string;
    if (isLocalOrIp) {
      // For local development, use the internal IP to allow connection from other machines in the same network
      const internalIp = getInternalIp();
      const port = host.includes(':') ? ':' + host.split(':')[1] : ':3000';
      serverUrl = `ws://${internalIp}${port}`;
    } else {
      // In production/cloud (like Hugging Face), use the request host directly
      serverUrl = `${protocol}://${host}`;
    }

    console.log(`[AGENT_DOWNLOAD] Generating package for server: ${serverUrl}`);
    const zipBuffer = await createAgentPackage(serverUrl);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=quantum-qa-agent.zip');
    res.send(zipBuffer);
  } catch (err) {
    console.error('[AGENT_DOWNLOAD] Failed to generate package:', err);
    res.status(500).json({ error: 'Failed to generate agent package' });
  }
});

// DELETE /api/agents/:id - Remove agent from DB entirely
router.delete('/:id', (req, res) => {
  deleteAgent(req.params.id);
  agentLogBuffer.clear(req.params.id);
  
  // also terminate WS if present
  agentRegistry.removeById(req.params.id);

  res.json({ success: true });
});

export const agentsModule = {
  basePath: '/api/agents',
  router: router,
};

