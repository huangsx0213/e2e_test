import type { WebSocket } from 'ws';
import { globalEventBus, type WsEventHandler } from '../../shared/services/eventBus.ts';
import { broadcastToProject } from '../../shared/services/websocketService.ts';
import { getProject, saveProject } from '../projects/repository.ts';
import { saveApiEndpoint, listApiEndpoints } from '../endpoints/repository.ts';
import { saveHeaderProfile, listHeaderProfiles } from '../headers/repository.ts';
import { saveBodyTemplate, listBodyTemplates } from '../bodies/repository.ts';
import { randomId, nullableText } from '../../shared/utils/index.ts';
import { db } from '../../shared/db/client.ts';
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
    page = { id: randomId('pg'), name: pName, elements: [] };
    project.pages.push(page);
  }

  if (!page.elements) page.elements = [];
  return page;
}

function insertCaseStep(caseId: string, step: TestStep): void {
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS pos FROM case_steps WHERE case_id = ? AND step_group = ?'
  ).get(caseId, 'main') as { pos: number } | undefined;
  const nextPos = (maxPos?.pos ?? -1) + 1;

  db.prepare(
    `INSERT INTO case_steps (id, case_id, step_group, action, target, data, description,
      header_profile_id, body_template_id, endpoint_id, screenshot, enabled,
      extractors, assertions, wait_for_network, network_mocks, position)
     VALUES (?, ?, 'main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    step.id,
    caseId,
    step.action,
    step.target || '',
    step.data || '',
    step.description || '',
    nullableText(step.headerProfileId),
    nullableText(step.bodyTemplateId),
    nullableText(step.endpointId),
    step.screenshot ? 1 : null,
    step.enabled === false ? 0 : 1,
    step.extractors ? JSON.stringify(step.extractors) : null,
    step.assertions ? JSON.stringify(step.assertions) : null,
    step.waitForNetwork ? JSON.stringify(step.waitForNetwork) : null,
    step.networkMocks ? JSON.stringify(step.networkMocks) : null,
    nextPos,
  );
}

function handleStepRecorded(data: any) {
  const { projectId, stepInfo, caseId, suiteId } = data || {};
  console.log(`[RECORDER WS] handleStepRecorded: action=${stepInfo?.action} caseId=${caseId} suiteId=${suiteId}`);
  const project = getProject(projectId);
  if (!project || !stepInfo) return;

  const { action, element, dataValue } = stepInfo;
  if (action === 'NAVIGATE' || action === 'PAGE_LOAD') {
    const navigationUrl = element?.pageUrl || element?.value || dataValue || '';
    if (!navigationUrl) return;

    const page = getOrCreatePage(project, navigationUrl);
    const step: TestStep = {
      id: randomId('step'),
      action,
      target: '',
      data: navigationUrl,
      description: action === 'PAGE_LOAD' ? `Page loaded: ${navigationUrl}` : `Navigated to ${navigationUrl}`,
      isVerified: true,
      metadata: {
        navigation: element?.metadata?.navigation,
        snapshot: element?.metadata?.snapshot,
        page: page.name,
      },
    };

    if (caseId) {
      try {
        insertCaseStep(caseId, step);
        console.log(`[RECORDER WS] Nav step inserted: ${step.id} into case ${caseId}`);
      } catch (err) {
        console.error(`[RECORDER WS] Nav step insert FAILED for case ${caseId}:`, err);
      }
    }

    broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'UI', caseId, suiteId });
    return;
  }

  try {
    const page = getOrCreatePage(project, element?.pageUrl);

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
      existingEl = { ...element, id: randomId('el') };
      page.elements!.push(existingEl);
    }

    saveProject(project);

    const step: TestStep = {
      id: randomId('step'),
      action,
      target: `${page.name}.${existingEl.name}`,
      data: dataValue || '',
      description: `Recorded: ${action} on ${existingEl.name}`,
      isVerified: element.isVerified ?? existingEl.isVerified,
    };

    if (caseId) {
      try {
        insertCaseStep(caseId, step);
        console.log(`[RECORDER WS] UI step inserted: ${step.id} action=${action} into case ${caseId}`);
      } catch (err) {
        console.error(`[RECORDER WS] UI step insert FAILED for case ${caseId}:`, err);
      }
    }

    broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'UI', caseId, suiteId });
  } catch (err) {
    console.error(`[RECORDER WS] handleStepRecorded (non-nav) FAILED:`, err);
  }
}

function handleElementRecorded(data: any) {
  const { projectId, pageId, element } = data || {};
  const project = getProject(projectId);
  if (!project || !element) return;

  const page = getOrCreatePage(project, element.pageUrl);
  const existingEl = page.elements!.find(e =>
    e.value === element.value ||
    (e.locators && e.locators.some(l => element.locators?.some((sl: any) => sl.value === l.value)))
  );

  if (!existingEl) {
    element.id = randomId('el');
    page.elements!.push(element);
    saveProject(project);
  }

  broadcastToProject(projectId, 'element-recorded', { projectId, pageId: page.id, element: existingEl || element });
}

function handleApiRecorded(data: any) {
  const { projectId, environment, apiInfo, caseId, suiteId } = data || {};
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
      id: randomId('ep'),
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
          id: randomId('hp'),
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
        id: randomId('bt'),
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
      id: randomId('ast'),
      source: 'API_STATUS',
      operator: 'EQUALS',
      expectedValue: String(status)
    });
  }

  const step: TestStep = {
    id: randomId('step'),
    action: `API_${actionMethod}`,
    target: basePath,
    data: '',
    description: `Recorded API: ${method} ${basePath}`,
    endpointId: endpoint.id,
    headerProfileId,
    bodyTemplateId,
    assertions: stepAssertions,
  };

  if (caseId) {
    insertCaseStep(caseId, step);
  }

  broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'API', caseId, suiteId });
}

function handleRecordingEvent(data: any, ws: WebSocket) {
  const { event, data: innerData } = data || {};
  if (!event) return;

  if (event === 'step-recorded') {
    handleStepRecorded(innerData);
    return;
  }

  if (event === 'element-recorded') {
    handleElementRecorded(innerData);
    return;
  }

  if (event === 'api-recorded') {
    handleApiRecorded(innerData);
    return;
  }

  broadcastToProject(innerData?.projectId || '', event, innerData);
}

export function registerRecordingWsHandlers() {
  globalEventBus.on('RECORDING_EVENT', handleRecordingEvent);
}
