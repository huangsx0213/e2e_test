import { Router } from 'express';
import { startRecording, stopRecording } from './engine.ts';
import { getProject, saveProject } from '../projects/repository.ts';
import { broadcast } from '../../shared/services/websocketService.ts';

const router = Router();

router.post('/start', async (req, res) => {
  const { targetUrl, projectId, pageId } = req.body;
  
  if (!targetUrl || !projectId || !pageId) {
    return res.status(400).json({ error: 'targetUrl, projectId, and pageId are required' });
  }

  try {
    await startRecording(targetUrl, projectId, async (element) => {
      console.log('New element recorded:', element);
      
      // Save element to database
      const project = getProject(projectId);
      if (project) {
        const page = project.pages?.find(p => p.id === pageId);
        if (page) {
          if (!page.elements) {
            page.elements = [];
          }
          page.elements.push(element);
          saveProject(project);
          
          // Broadcast to frontend to refresh
          broadcast('element-recorded', { projectId, pageId, element });
        }
      }
    });
    
    res.json({ success: true, message: 'Recording started' });
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await stopRecording();
    res.json({ success: true, message: 'Recording stopped' });
  } catch (error: any) {
    console.error('Failed to stop recording:', error);
    res.status(500).json({ error: error.message });
  }
});

export const recordingModule = {
  basePath: '/api/recording',
  router,
};
