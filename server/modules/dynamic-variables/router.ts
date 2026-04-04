import { Router } from 'express';
import { dynamicVariableRepository } from './repository';
import { dynamicVariableSchema } from '../../shared/validation/schemas';
import { interpolate } from '../execution/interpolator';

const router = Router();

// Get all dynamic variables for a project
router.get('/projects/:projectId/dynamic-variables', async (req, res) => {
  try {
    const variables = await dynamicVariableRepository.findByProjectId(req.params.projectId);
    res.json(variables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dynamic variables' });
  }
});

// Create a new dynamic variable
router.post('/projects/:projectId/dynamic-variables', async (req, res) => {
  try {
    const data = dynamicVariableSchema.parse(req.body);
    const variable = await dynamicVariableRepository.create(req.params.projectId, data);
    res.status(201).json(variable);
  } catch (error) {
    res.status(400).json({ error: 'Invalid data' });
  }
});

// Update a dynamic variable
router.put('/dynamic-variables/:id', async (req, res) => {
  try {
    const data = dynamicVariableSchema.partial().parse(req.body);
    const variable = await dynamicVariableRepository.update(req.params.id, data);
    res.json(variable);
  } catch (error) {
    res.status(400).json({ error: 'Invalid data' });
  }
});

// Delete a dynamic variable
router.delete('/dynamic-variables/:id', async (req, res) => {
  try {
    await dynamicVariableRepository.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete dynamic variable' });
  }
});

// Preview dynamic variable expression
router.post('/dynamic-variables/preview', (req, res) => {
  try {
    const { expression } = req.body;
    if (!expression) {
      return res.status(400).json({ error: 'Expression is required' });
    }
    
    const samples = [];
    for (let i = 0; i < 3; i++) {
      samples.push(interpolate(expression, {}));
    }
    
    res.json({ samples });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

export const dynamicVariableRouter = router;
