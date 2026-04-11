import { Router } from 'express';
import { startRecording, stopRecording } from './engine.ts';
import { getProject, saveProject } from '../projects/repository.ts';
import { saveApiEndpoint, listApiEndpoints } from '../endpoints/repository.ts';
import { saveHeaderProfile, listHeaderProfiles } from '../headers/repository.ts';
import { saveBodyTemplate, listBodyTemplates } from '../bodies/repository.ts';
import { broadcast } from '../../shared/services/websocketService.ts';
import type { UIElement, Page, Project, TestStep } from '../../shared/contracts/index.ts';

const router = Router();

/**
 * Helper to resolve the correct Page object for a given URL
 */
function getOrCreatePage(project: Project, url: string): Page {
  let pName = 'Home';
  try {
    const urlObj = new URL(url);
    pName = urlObj.pathname === '/' ? 'Home' : urlObj.pathname.substring(1).replace(/\//g, '_');
  } catch(e) {}

  if (!project.pages) project.pages = [];
  let page = project.pages.find(pg => pg.name === pName);
  
  if (!page) {
    page = { id: `pg-${Date.now()}`, name: pName, elements: [] };
    project.pages.push(page);
  }
  
  if (!page.elements) page.elements = [];
  return page;
}

router.post('/start', async (req, res) => {
  const { targetUrl, projectId, apiFilter } = req.body;
  
  if (!targetUrl || !projectId) {
    return res.status(400).json({ error: 'targetUrl and projectId are required' });
  }

  try {
    await startRecording(targetUrl, projectId, apiFilter, async (elementRecord: any) => {
      // 1. Right Click Element Recorder
      const project = getProject(projectId);
      if (!project) return;
      
      const page = getOrCreatePage(project, elementRecord.pageUrl);
      
      // Look for existing element by locator
      const existingEl = page.elements!.find(e => 
        e.value === elementRecord.value || 
        (e.locators && e.locators.some(l => elementRecord.locators?.some((sl: any) => sl.value === l.value)))
      );

      if (!existingEl) {
        elementRecord.id = `el-${Date.now()}`;
        page.elements!.push(elementRecord);
        saveProject(project);
      }
      
      broadcast('element-recorded', { projectId, pageId: page.id, element: existingEl || elementRecord });
    }, async (stepInfo: { action: string, element: any, dataValue: any }) => {
      // 2. Left Click Step Recorder
      const project = getProject(projectId);
      if (!project) return;
      
      const { action, element: capturedEl, dataValue } = stepInfo;
      const page = getOrCreatePage(project, capturedEl.pageUrl);
      
      // Match element by locators to avoid duplicates and ensure reuse
      let existingEl = page.elements!.find(e => {
        if (e.selectorType === capturedEl.selectorType && e.value === capturedEl.value) return true;
        const incomingLocs = capturedEl.locators || [];
        const savedLocs = e.locators || [];
        return incomingLocs.some((il: any) => 
          savedLocs.some((sl: any) => sl.selectorType === il.selectorType && sl.value === il.value) ||
          (e.selectorType === il.selectorType && e.value === il.value)
        );
      });

      if (!existingEl) {
        existingEl = { ...capturedEl, id: `el-${Date.now()}` };
        page.elements!.push(existingEl);
      }
      
      saveProject(project);
      
      const step: TestStep = {
        id: `step-${Date.now()}`,
        action,
        target: `${page.name}.${existingEl.name}`,
        data: dataValue || '',
        description: `Recorded: ${action} on ${existingEl.name}`,
        isVerified: capturedEl.isVerified ?? existingEl.isVerified
      };
      
      console.log('✨ [Recorder API] Emitting step to UI:', step);
      broadcast('step-recorded', { projectId, step, type: 'UI' });

    }, async (apiInfo: any) => {
      // 3. Network API Recorder
      const { url, method, headers, postData } = apiInfo;
      
      let urlObj;
      try { urlObj = new URL(url); } catch(e) { return; }
      const basePath = urlObj.pathname;
      const endpointName = `[${method}] ${basePath}`;
      
      // Auto-create Endpoint
      const allEndpoints = listApiEndpoints();
      let endpoint = allEndpoints.find(e => e.projectId === projectId && e.name === endpointName);
      if (!endpoint) {
        endpoint = saveApiEndpoint({
          id: `ep-${Date.now()}`,
          projectId,
          name: endpointName,
          method: method as any,
          baseUrls: { "default": urlObj.origin },
          parameters: []
        });
      }
      
      // Auto-create Headers
      const allHeaders = listHeaderProfiles();
      let headerProfileId = undefined;
      if (headers && Object.keys(headers).length > 0) {
         const profileName = `Recorded Headers - ${urlObj.hostname}`;
         let profile = allHeaders.find(h => h.projectId === projectId && h.name === profileName);
         if (!profile) {
            const cleanHeaders = Object.entries(headers).filter(([k]) => {
              const klow = k.toLowerCase();
              return !['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'accept-encoding', 'origin', 'referer', 'user-agent', 'cookie', 'host', 'connection'].includes(klow);
            }).map(([k, v]) => ({ key: k, value: String(v), enabled: true }));
            
            if (cleanHeaders.length > 0) {
               profile = saveHeaderProfile({
                 id: `hp-${Date.now()}`,
                 projectId,
                 name: profileName,
                 headers: cleanHeaders
               });
            }
         }
         if (profile) headerProfileId = profile.id;
      }
      
      // Auto-create Body
      const allBodies = listBodyTemplates();
      let bodyTemplateId = undefined;
      if (postData) {
         const bodyName = `Recorded Body - ${basePath.substring(basePath.lastIndexOf('/') + 1) || 'Root'}`;
         let bodyTemplate = allBodies.find(b => b.projectId === projectId && b.name === bodyName && b.content === postData);
         if (!bodyTemplate) {
            let contentType = 'text/plain';
            try { JSON.parse(postData); contentType = 'application/json'; } catch(e) {}
            bodyTemplate = saveBodyTemplate({
               id: `bt-${Date.now()}`,
               projectId,
               name: bodyName,
               contentType,
               content: postData
            });
         }
         bodyTemplateId = bodyTemplate.id;
      }
      
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
      const methodUpper = method.toUpperCase();
      const actionMethod = validMethods.includes(methodUpper) ? methodUpper : 'GET';

      const step = {
        id: `step-${Date.now()}`,
        action: `API_${actionMethod}`,
        target: '',
        data: '',
        description: `Recorded API: ${method} ${basePath}`,
        endpointId: endpoint.id,
        headerProfileId: headerProfileId,
        bodyTemplateId: bodyTemplateId
      };
      
      broadcast('step-recorded', { projectId, step, type: 'API' });
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
