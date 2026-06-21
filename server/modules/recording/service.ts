import { randomId } from '../../shared/utils/index.ts';
import type { Page, Project, TestStep, UIElement, StepAssertion, ApiEndpoint } from '../../shared/contracts/index.ts';
import type { StepRecordedEvent, ElementRecordedEvent, ApiRecordedEvent } from '../../../shared/recording/protocol.ts';
import { Log } from '../../shared/services/logger';
import type { RecordingIngestService, BroadcastService } from './ingest-service.ts';

function getPageNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname === '/' ? 'Home' : urlObj.pathname.substring(1).replace(/\//g, '_');
  } catch { return 'Home'; }
}

function getOrCreatePage(project: Project, url: string): Page {
  if (!project.pages) project.pages = [];
  const pName = getPageNameFromUrl(url);
  let page = project.pages.find(pg => pg.name === pName);
  if (!page) {
    page = { id: randomId('pg'), name: pName, elements: [] };
    project.pages.push(page);
  }
  if (!page.elements) page.elements = [];
  return page;
}

export class RecordingService {
  constructor(
    private ingest: RecordingIngestService,
    private broadcast: BroadcastService,
  ) {}

  handleStepRecorded(data: StepRecordedEvent['data']) {
    const { projectId, stepInfo, caseId, suiteId } = data || {};
    Log.for('recording').info(`handleStepRecorded: action=${stepInfo?.action} caseId=${caseId} suiteId=${suiteId}`);
    const project = this.ingest.getProject(projectId);
    if (!project || !stepInfo) return;

    const { action, element, dataValue } = stepInfo;
    const structured = stepInfo.step;
    if (action === 'goto' || action === 'navigate' || action === 'pageLoad') {
      const navigationUrl = element?.pageUrl || element?.value || dataValue || '';
      if (!navigationUrl) return;

      const page = getOrCreatePage(project, navigationUrl);
      const step: TestStep = {
        id: randomId('step'),
        action,
        target: '',
        data: navigationUrl,
        description: action === 'goto' ? `Navigated to ${navigationUrl}` : `Page loaded: ${navigationUrl}`,
        isVerified: true,
        metadata: {
          ...(structured?.metadata || {}),
          navigation: element?.metadata?.navigation,
          snapshot: element?.metadata?.snapshot,
          page: page.name,
        },
      };

      if (caseId) {
        try {
          this.ingest.addStepToCase(caseId, step);
          Log.for('recording').info(`Nav step inserted: ${step.id} into case ${caseId}`);
        } catch (err) {
          Log.for('recording').error(`Nav step insert FAILED for case ${caseId}: ${err}`);
        }
      }

      this.broadcast.broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'UI' as const, caseId, suiteId });
      return;
    }

    try {
      const page = getOrCreatePage(project, element?.pageUrl);

      let existingEl = page.elements!.find(e => {
        if (e.selectorType === element!.selectorType && e.value === element!.value) return true;
        const incomingLocs = element!.locators || [];
        const savedLocs = e.locators || [];
        return incomingLocs.some(il =>
          savedLocs.some(sl => sl.selectorType === il.selectorType && sl.value === il.value) ||
          (e.selectorType === il.selectorType && e.value === il.value)
        );
      });

      if (!existingEl) {
        existingEl = { ...element!, id: randomId('el') };
        page.elements!.push(existingEl);
      }

      this.ingest.saveProject(project);

      const step: TestStep = {
        id: randomId('step'),
        action,
        target: `${page.name}.${existingEl.name}`,
        data: dataValue || '',
        description: structured?.description || `Recorded: ${action} on ${existingEl.name}`,
        isVerified: element?.isVerified ?? existingEl.isVerified,
        metadata: {
          ...(structured?.metadata || {}),
          recorder: structured?.metadata?.recorder || stepInfo.step?.metadata?.recorder || undefined,
        },
      };

      if (caseId) {
        try {
          this.ingest.addStepToCase(caseId, step);
          Log.for('recording').info(`UI step inserted: ${step.id} action=${action} into case ${caseId}`);
        } catch (err) {
          Log.for('recording').error(`UI step insert FAILED for case ${caseId}: ${err}`);
        }
      }

      this.broadcast.broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'UI' as const, caseId, suiteId });
    } catch (err) {
      Log.for('recording').error(`handleStepRecorded (non-nav) FAILED: ${err}`);
    }
  }

  handleElementRecorded(data: ElementRecordedEvent['data']) {
    const { projectId, element } = data || {};
    const project = this.ingest.getProject(projectId);
    if (!project || !element) return;

    const page = getOrCreatePage(project, element.pageUrl);
    const existingEl = page.elements!.find(e =>
      e.value === element.value ||
      (e.locators && e.locators.some(l => element.locators?.some(sl => sl.value === l.value)))
    );

    if (!existingEl) {
      element.id = randomId('el');
      page.elements!.push(element);
      this.ingest.saveProject(project);
    }

    this.broadcast.broadcastToProject(projectId, 'element-recorded', { projectId, pageId: page.id, element: existingEl || element });
  }

  handleApiRecorded(data: ApiRecordedEvent['data']) {
    const { projectId, environment, apiInfo, caseId, suiteId } = data || {};
    const { url, method, headers, postData, status } = apiInfo;
    Log.for('recording').info(`${method} ${url} -> ${status} (project=${projectId}, case=${caseId})`);

    let urlObj: URL;
    try { urlObj = new URL(url); } catch(e) { return; }
    const basePath = urlObj.pathname;
    const pageName = getPageNameFromUrl(url);
    const endpointName = `[${method}] ${basePath}`;
    const allEndpoints = this.ingest.listApiEndpoints();
    const currentOrigin = urlObj.origin;
    const envKey = environment || 'default';
    const currentParams = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({ key, value, enabled: true }));

    let endpoint = allEndpoints.find(e => e.projectId === projectId && e.name === endpointName);
    if (!endpoint) {
      endpoint = this.ingest.saveApiEndpoint({
        id: randomId('ep'),
        projectId,
        name: endpointName,
        method: method as ApiEndpoint['method'],
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
        endpoint = this.ingest.saveApiEndpoint(endpoint);
      }
    }

    const allHeaders = this.ingest.listHeaderProfiles();
    let headerProfileId: string | undefined;
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
          const profileShort = basePath.split('/').filter(Boolean).slice(-2).join('/');
          const profileName = profileShort
            ? `${method} /${profileShort} (Headers)`
            : `${method} / (Headers)`;
          profile = this.ingest.saveHeaderProfile({
            id: randomId('hp'),
            projectId,
            name: profileName,
            headers: cleanHeaders
          });
        }
        headerProfileId = profile.id;
      }
    }

    const allBodies = this.ingest.listBodyTemplates();
    let bodyTemplateId: string | undefined;
    if (postData) {
      let finalContent = postData;
      let contentType: string = 'text/plain';

      try {
        const parsed = JSON.parse(postData);
        contentType = 'application/json';
        finalContent = JSON.stringify(parsed, null, 2);
      } catch {
        if (/^\s*<\?xml|<[\w:]+/.test(postData)) {
          contentType = 'application/xml';
          finalContent = postData;
        } else {
          finalContent = postData;
        }
      }

      let bodyTemplate = allBodies.find(b => {
        if (b.projectId !== projectId) return false;
        if (b.contentType === 'application/json') {
          try { return JSON.stringify(Object.keys(JSON.parse(b.content)).sort()) === JSON.stringify(Object.keys(JSON.parse(finalContent)).sort()); } catch { return b.content === finalContent; }
        }
        if (b.contentType === 'application/xml') {
          const existingTags = Array.from(b.content.matchAll(/<(\/?[\w:]+)/g), m => m[1].replace(/^\//, ''));
          const incomingTags = Array.from(finalContent.matchAll(/<(\/?[\w:]+)/g), m => m[1].replace(/^\//, ''));
          return JSON.stringify([...new Set(existingTags)].sort()) === JSON.stringify([...new Set(incomingTags)].sort());
        }
        return b.content === finalContent;
      });
      if (!bodyTemplate) {
        const bodyShort = basePath.split('/').filter(Boolean).slice(-2).join('/');
        const bodyName = bodyShort
          ? `${method} /${bodyShort} (Body)`
          : `${method} / (Body)`;
        bodyTemplate = this.ingest.saveBodyTemplate({
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
    const methodUpper = method.toUpperCase();
    const actionMethod = validMethods.includes(methodUpper) ? methodUpper : 'GET';
    const apiActionMap: Record<string, string> = { 'GET': 'apiGet', 'POST': 'apiPost', 'PUT': 'apiPut', 'DELETE': 'apiDelete' };
    const stepAssertions: StepAssertion[] = [];
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
      action: apiActionMap[actionMethod],
      target: basePath,
      data: '',
      description: pageName && pageName !== 'Home' ? `${pageName}.${method} ${basePath}` : `${method} ${basePath}`,
      endpointId: endpoint.id,
      headerProfileId,
      bodyTemplateId,
      assertions: stepAssertions,
    };

    if (caseId) {
      this.ingest.addStepToCase(caseId, step);
    }

    this.broadcast.broadcastToProject(projectId, 'step-recorded', { projectId, step, type: 'API' as const, caseId, suiteId });
  }
}
