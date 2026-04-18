import { Router } from 'express';
import { agentRegistry } from './registry.ts';

const router = Router();

// GET /api/agents - List all registered agents
router.get('/', (req, res) => {
  res.json(agentRegistry.list());
});

export const agentsModule = {
  basePath: '/api/agents',
  router: router,
};
