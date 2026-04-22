import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

import { agentRegistry } from '../../modules/agent/registry.ts';
import { agentDispatcherEvents, checkQueue } from '../../modules/agent/dispatcher.ts';
import { getActiveRunLogger } from '../../modules/execution/runner.ts';
import { agentLogBuffer } from '../../modules/agent/log-buffer.ts';
import { getProject, saveProject } from '../../modules/projects/repository.ts';
import { saveApiEndpoint, listApiEndpoints } from '../../modules/endpoints/repository.ts';
import { saveHeaderProfile, listHeaderProfiles } from '../../modules/headers/repository.ts';
import { saveBodyTemplate, listBodyTemplates } from '../../modules/bodies/repository.ts';
import type { Page, Project, TestStep } from '../../shared/contracts/index.ts';

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

export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server });
  const AGENT_SECRET = process.env.AGENT_SECRET || '';
  console.log(`[WS_SERVER] Initialized. Agent Security: ${AGENT_SECRET ? 'ENABLED' : 'DISABLED'}`);

  wss.on('connection', (ws, req) => {
    const incomingSecret = req.headers['x-agent-secret'];
    if (AGENT_SECRET && incomingSecret && incomingSecret !== AGENT_SECRET) {
        ws.terminate();
        return;
    }

    clients.add(ws);
    // console.log('WS Client connected');

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());

        if (parsed.event === 'AGENT_REGISTER') {
          const { agentId, platform, version } = parsed.data;
          agentRegistry.registerOrUpdate(agentId, platform, version, 'idle', ws);
          checkQueue();
        } else if (parsed.event === 'AGENT_HEARTBEAT') {
          const { agentId, status } = parsed.data;
          const existing = agentRegistry.get(agentId);
          if (existing) {
            if (existing.status !== status && status === 'idle') {
                agentRegistry.markIdle(agentId);
                checkQueue();
            } else if (status === 'busy') {
                // Keep it busy without overriding report ID if it exists
                agentRegistry.markBusy(agentId, existing.currentReportId || '');
            }
          }
        } else if (parsed.event === 'LOG_STREAM') {
          const { reportId, log } = parsed.data;
          const logger = getActiveRunLogger(reportId);
          if (logger && log) {
             logger.log(log);
          }
        } else if (parsed.event === 'PROGRESS_STREAM') {
          const { reportId, progress } = parsed.data;
          const logger = getActiveRunLogger(reportId);
          if (logger) logger.progress(progress);
        } else if (parsed.event === 'EXECUTION_COMPLETE') {
          // Fire dispatcher event
          agentDispatcherEvents.emit(`COMPLETE_${parsed.data.runId || parsed.data.reportId}`, parsed.data);
        } else if (parsed.event === 'TASK_REJECTED') {
          // Forward rejection to dispatcher
          agentDispatcherEvents.emit(`REJECTED_${parsed.data.reportId}`, parsed.data);
        } else if (parsed.event === 'AGENT_LOG') {
          // Push agent console output into the ring buffer
          const { agentId, timestamp, level, message } = parsed.data;
          if (agentId && message) {
            agentLogBuffer.push(agentId, { timestamp, level, message });
          }
        } else if (parsed.event === 'RECORDING_EVENT') {
          const { event, data } = parsed.data || {};
          if (!event) return;

          if (event === 'step-recorded') {
            const { projectId, stepInfo } = data || {};
            const project = getProject(projectId);
            if (!project || !stepInfo) return;

            const { action, element, dataValue } = stepInfo;
            const page = getOrCreatePage(project, element.pageUrl);

            let existingEl = page.elements!.find(e => {
              if (e.selectorType === element.selectorType && e.value === element.value) return true;
              const incomingLocs = element.locators || [];
              const savedLocs = e.locators || [];
              return incomingLocs.some((il: any) =>
                savedLocs.some((sl: any) => sl.selectorType === il.selectorType && sl.value === il.value) ||
                (e.selectorType === il.selectorType && e.value === il.value)
              );
            });

            if (!existingEl) {
              existingEl = { ...element, id: `el-${Date.now()}` };
              page.elements!.push(existingEl);
            }

            saveProject(project);

            const step: TestStep = {
              id: `step-${Date.now()}`,
              action,
              target: `${page.name}.${existingEl.name}`,
              data: dataValue || '',
              description: `Recorded: ${action} on ${existingEl.name}`,
              isVerified: element.isVerified ?? existingEl.isVerified,
            };

            broadcast('step-recorded', { projectId, step, type: 'UI' });
            return;
          }

          if (event === 'element-recorded') {
            const { projectId, pageId, element } = data || {};
            const project = getProject(projectId);
            if (!project || !element) return;

            const page = getOrCreatePage(project, element.pageUrl);
            const existingEl = page.elements!.find(e =>
              e.value === element.value ||
              (e.locators && e.locators.some(l => element.locators?.some((sl: any) => sl.value === l.value)))
            );

            if (!existingEl) {
              element.id = `el-${Date.now()}`;
              page.elements!.push(element);
              saveProject(project);
            }

            broadcast('element-recorded', { projectId, pageId: page.id, element: existingEl || element });
            return;
          }

          if (event === 'api-recorded') {
            const { projectId, environment, apiInfo } = data || {};
            const { url, method, headers, postData, status } = apiInfo || {};

            let urlObj;
            try { urlObj = new URL(url); } catch(e) { return; }
            const basePath = urlObj.pathname;
            const endpointName = `[${method}] ${basePath}`;
            const allEndpoints = listApiEndpoints();
            const currentOrigin = urlObj.origin;
            const envKey = environment || 'default';
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
              let needsUpdate = false;
              if (!endpoint.baseUrls) endpoint.baseUrls = {};
              if (endpoint.baseUrls[envKey] !== currentOrigin) {
                endpoint.baseUrls[envKey] = currentOrigin;
                needsUpdate = true;
              }

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
            const methodUpper = String(method || '').toUpperCase();
            const actionMethod = validMethods.includes(methodUpper) ? methodUpper : 'GET';
            const stepAssertions = [] as any[];
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
              target: basePath,
              data: '',
              description: `Recorded API: ${method} ${basePath}`,
              endpointId: endpoint.id,
              headerProfileId,
              bodyTemplateId,
              assertions: stepAssertions,
            };

            broadcast('step-recorded', { projectId, step, type: 'API' });
            return;
          }

          broadcast(event, data);
        }
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      agentRegistry.remove(ws);
      // console.log('WS Client disconnected');
    });
  });

  return wss;
}

export function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
