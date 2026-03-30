import type { TestStep, HeaderProfile, BodyTemplate, ApiEndpoint } from '../../shared/contracts/index.ts';
import { ExecutionContext } from './context.ts';
import { interpolate } from './interpolator.ts';

export interface ApiAssets {
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
}

export interface ApiExecutionResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  resolvedUrl: string;
  resolvedMethod: string;
  resolvedHeaders: Record<string, string>;
  resolvedBody: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Resolve API method from step action.
 * API_GET → GET, API_POST → POST, etc.
 */
function methodFromAction(action: string): string {
  return action.replace('API_', '');
}

/**
 * Execute an API step by making a real HTTP request.
 */
export async function executeApiStep(
  step: TestStep,
  context: ExecutionContext,
  assets: ApiAssets,
  environment: string,
): Promise<ApiExecutionResult> {
  const allVars = context.resolveAll();
  let resolvedTarget = interpolate(step.target || '', allVars);
  let resolvedData = interpolate(step.data || '', allVars);

  // Parse variable overrides from step data when using profiles/templates
  let apiVars: Record<string, string> = {};
  const isVariableMode = step.headerProfileId || step.bodyTemplateId || step.endpointId;

  if (isVariableMode) {
    try {
      apiVars = JSON.parse(resolvedData || '{}');
    } catch {
      // data is not JSON — use as raw body
    }
  }

  // ─── 1. Resolve Endpoint ───
  if (step.endpointId) {
    const endpoint = assets.endpoints.find(e => e.id === step.endpointId);
    if (endpoint) {
      const baseUrl = (endpoint.baseUrls?.[environment] || '').replace(/\/$/, '');
      const cleanPath = resolvedTarget.replace(/^\//, '');
      resolvedTarget = `${baseUrl}/${cleanPath}`;

      // Append URL parameters
      if (endpoint.parameters && endpoint.parameters.length > 0) {
        const params = new URLSearchParams();
        for (const p of endpoint.parameters) {
          if (!p.enabled) continue;
          let val = p.value;
          val = resolveTemplateVars(val, apiVars, allVars);
          params.append(p.key, val);
        }
        const qs = params.toString();
        if (qs) {
          resolvedTarget += resolvedTarget.includes('?') ? `&${qs}` : `?${qs}`;
        }
      }
    }
  }

  // Interpolate any remaining {{vars}} in the URL
  resolvedTarget = resolveTemplateVars(resolvedTarget, apiVars, allVars);

  // ─── 2. Resolve Headers ───
  const requestHeaders: Record<string, string> = {};

  if (step.headerProfileId) {
    const profile = assets.headers.find(h => h.id === step.headerProfileId);
    if (profile?.headers) {
      for (const h of profile.headers) {
        if (h.enabled === false) continue;
        requestHeaders[h.key] = resolveTemplateVars(h.value, apiVars, allVars);
      }
    }
  }

  // ─── 3. Resolve Body ───
  let requestBody = '';

  if (step.bodyTemplateId) {
    const template = assets.bodies.find(b => b.id === step.bodyTemplateId);
    if (template) {
      let bodyContent = template.content || '';
      // First try API vars, then template defaults, then context vars
      const matches = bodyContent.match(/\{\{([^}]+)\}\}/g);
      if (matches) {
        for (const m of matches) {
          const key = m.replace(/\{\{|\}\}/g, '').trim();
          const val = apiVars[key] !== undefined
            ? apiVars[key]
            : interpolate(template.defaultValues?.[key] || '', allVars);
          bodyContent = bodyContent.replaceAll(m, val);
        }
      }
      requestBody = bodyContent;
    }
  } else if (isVariableMode) {
    // Data was consumed as variable overrides, no raw body
    requestBody = '';
  } else {
    requestBody = resolvedData;
  }

  // Set Content-Type if we have a body and no explicit header
  if (requestBody && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  // ─── 4. Execute Request ───
  const method = methodFromAction(step.action);
  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (method !== 'GET' && method !== 'HEAD' && requestBody) {
    fetchOptions.body = requestBody;
  }

  const start = performance.now();
  const response = await fetch(resolvedTarget, fetchOptions);
  const durationMs = Math.round(performance.now() - start);

  const responseBody = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    durationMs,
    resolvedUrl: resolvedTarget,
    resolvedMethod: method,
    resolvedHeaders: requestHeaders,
    resolvedBody: requestBody,
  };
}

/**
 * Resolve {{key}} in a value using API vars first, then context vars.
 */
function resolveTemplateVars(
  value: string,
  apiVars: Record<string, string>,
  contextVars: Record<string, string>,
): string {
  if (!value) return '';
  return value.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    if (apiVars[trimmed] !== undefined) return apiVars[trimmed];
    if (contextVars[trimmed] !== undefined) return contextVars[trimmed];
    return match;
  });
}
