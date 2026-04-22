import { Router } from 'express';
import { startRecording, stopRecording } from './engine.ts';
import { getProject, saveProject } from '../projects/repository.ts';
import { saveApiEndpoint, listApiEndpoints } from '../endpoints/repository.ts';
import { saveHeaderProfile, listHeaderProfiles } from '../headers/repository.ts';
import { saveBodyTemplate, listBodyTemplates } from '../bodies/repository.ts';
import { agentRegistry } from '../agent/registry.ts';
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
  let { targetUrl, projectId, apiFilter, environment, agentId, pageId } = req.body;
  if (apiFilter) apiFilter = apiFilter.trim();
  
  if (!targetUrl || !projectId) {
    return res.status(400).json({ error: 'targetUrl and projectId are required' });
  }

  try {
    if (agentId) {
      const agent = agentRegistry.get(agentId);
      if (!agent?.ws || agent.ws.readyState !== 1) {
        return res.status(404).json({ error: `Agent '${agentId}' is not connected` });
      }
      if (agent.status !== 'idle') {
        return res.status(409).json({ error: `Agent '${agentId}' is currently busy` });
      }

      console.log(`[Recorder] Dispatching remote recording to agent ${agentId}`);
      agent.ws.send(JSON.stringify({
        event: 'RECORDING_START',
        data: {
          targetUrl,
          projectId,
          apiFilter,
          environment,
          pageId,
        },
      }), (err) => {
        if (err) {
          console.error(`[Recorder] Failed to send recording start to agent ${agentId}:`, err);
        } else {
          console.log(`[Recorder] Recording start message sent to agent ${agentId}`);
        }
      });

      return res.json({ success: true, message: 'Recording started on agent' });
    }

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
      const { url, method, headers, postData, status } = apiInfo;
      
      let urlObj;
      try { urlObj = new URL(url); } catch(e) { return; }
      const basePath = urlObj.pathname;
      const endpointName = `[${method}] ${basePath}`;
      
      // Auto-create or Update Endpoint
      const allEndpoints = listApiEndpoints();
      const currentOrigin = urlObj.origin;
      const envKey = environment || "default";
      const currentParams = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({ key, value, enabled: true }));

      let endpoint = allEndpoints.find(e => e.projectId === projectId && e.name === endpointName);
      
      if (!endpoint) {
        endpoint = saveApiEndpoint({
          id: `ep-${Date.now()}`,
          projectId,
          name: endpointName,
          method: method as any,
          baseUrls: { [envKey]: currentOrigin },
          parameters: currentParams
        });
      } else {
        // Check for updates (new environment URL or new parameters)
        let needsUpdate = false;
        
        // 1. Update Base URL for current environment if missing or different
        if (!endpoint.baseUrls) endpoint.baseUrls = {};
        if (endpoint.baseUrls[envKey] !== currentOrigin) {
          endpoint.baseUrls[envKey] = currentOrigin;
          needsUpdate = true;
        }

        // 2. Merge Parameters
        if (!endpoint.parameters) endpoint.parameters = [];
        for (const p of currentParams) {
          if (!endpoint.parameters.find(ep => ep.key === p.key)) {
            endpoint.parameters.push(p);
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          endpoint = saveApiEndpoint(endpoint);
        }
      }
      
      // Auto-create Headers
      const allHeaders = listHeaderProfiles();
      let headerProfileId = undefined;
      if (headers && Object.keys(headers).length > 0) {
         const cleanHeaders = Object.entries(headers).filter(([k]) => {
           const klow = k.toLowerCase();
           return !['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'accept-encoding', 'accept', 'accept-language', 'dnt', 'origin', 'referer', 'user-agent', 'cookie', 'host', 'connection', 'content-length'].includes(klow);
         }).map(([k, v]) => ({ key: k, value: String(v), enabled: true }));

         if (cleanHeaders.length > 0) {
            const cleanHeadersStr = JSON.stringify(cleanHeaders.sort((a,b) => a.key.localeCompare(b.key)));
            let profile = allHeaders.find(h => {
               if (h.projectId !== projectId) return false;
               const hStr = JSON.stringify(h.headers.sort((a,b) => a.key.localeCompare(b.key)));
               return hStr === cleanHeadersStr;
            });

            if (!profile) {
               const profileName = `Headers: ${urlObj.hostname}${basePath !== '/' ? ' ' + basePath.split('/').pop() : ''}`;
               profile = saveHeaderProfile({
                 id: `hp-${Date.now()}`,
                 projectId,
                 name: profileName,
                 headers: cleanHeaders
               });
            }
            headerProfileId = profile.id;
         }
      }
      
      // Auto-create Body
      const allBodies = listBodyTemplates();
      let bodyTemplateId = undefined;
      if (postData) {
         let finalContent = postData;
         let contentType = 'text/plain';
         try { 
            const parsed = JSON.parse(postData); 
            contentType = 'application/json';
            finalContent = JSON.stringify(parsed, null, 2);
         } catch(e) {}
         
         let bodyTemplate = allBodies.find(b => b.projectId === projectId && b.content === finalContent);
         if (!bodyTemplate) {
            const bodyName = `Body: ${basePath.split('/').pop() || 'Root'} (${method})`;
            bodyTemplate = saveBodyTemplate({
               id: `bt-${Date.now()}`,
               projectId,
               name: bodyName,
               contentType,
               content: finalContent
            });
         }
         bodyTemplateId = bodyTemplate.id;
      }
      
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
      const methodUpper = method.toUpperCase();
      const actionMethod = validMethods.includes(methodUpper) ? methodUpper : 'GET';

      const stepAssertions = [];
      if (status && status !== 0) {
         stepAssertions.push({
            id: `ast-${Date.now()}`,
            source: 'API_STATUS',
            operator: 'EQUALS',
            expectedValue: String(status)
         });
      }

      const step: TestStep = {
        id: `step-${Date.now()}`,
        action: `API_${actionMethod}`,
        target: basePath, // Critical: executor needs the path, not the display name
        data: '',
        description: `Recorded API: ${method} ${basePath}`,
        endpointId: endpoint.id,
        headerProfileId: headerProfileId,
        bodyTemplateId: bodyTemplateId,
        assertions: stepAssertions
      };
      
      broadcast('step-recorded', { projectId, step, type: 'API' });
    }, (state) => {
      broadcast('recorder-state-changed', { state });
    });

    res.json({ success: true, message: 'Recording started' });
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  const { agentId } = req.body || {};
  try {
    if (agentId) {
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
    }

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
