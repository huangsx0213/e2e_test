import type { TestStep, HeaderProfile, BodyTemplate, ApiEndpoint, LogLevel } from '../../shared/contracts/index.ts';
import { ExecutionContext } from './context.ts';
import { interpolate } from './interpolator.ts';
import { JSONPath } from 'jsonpath-plus';
import { evaluateAssertions } from './assertions.ts';
import { ExecutionLogger } from './logger.ts';

import { environmentRepository } from '../environments/repository.ts';

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
  assertionLogs: { status: string; level: LogLevel; message: string }[];
  extractionLogs: { status: string; level: LogLevel; message: string }[];
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
  logger?: ExecutionLogger,
  indent: string = '  ',
): Promise<ApiExecutionResult> {
  const allVars = context.resolveAll();
  let resolvedTarget = context.interpolate(step.target || '');
  let resolvedData = context.interpolate(step.data || '');

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
          val = resolveTemplateVars(val, apiVars, context);
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
  resolvedTarget = resolveTemplateVars(resolvedTarget, apiVars, context);

  // ─── 2. Resolve Headers ───
  const requestHeaders: Record<string, string> = {};

  if (step.headerProfileId) {
    const profile = assets.headers.find(h => h.id === step.headerProfileId);
    if (profile?.headers) {
      for (const h of profile.headers) {
        if (h.enabled === false) continue;
        requestHeaders[h.key] = resolveTemplateVars(h.value, apiVars, context);
      }
    }
  }

  // ─── 3. Resolve Body ───
  let requestBody = '';

  if (step.bodyTemplateId) {
    const template = assets.bodies.find(b => b.id === step.bodyTemplateId);
    if (template) {
      const bodyContent = template.content || '';
      // Priority: apiVars > template.defaultValues > allVars
      const mergedForBody = { ...allVars, ...template.defaultValues, ...apiVars };
      requestBody = interpolate(bodyContent, mergedForBody, (k, v, s) => context.setRuntimeVar(k, v, s as any));
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

  const assertionLogs: { status: string; level: LogLevel; message: string }[] = [];
  const extractionLogs: { status: string; level: LogLevel; message: string }[] = [];

  // ─── 4.5. Process Assertions ───
  if (step.assertions && step.assertions.length > 0) {
    const results = evaluateAssertions({
      body: responseBody,
      headers: responseHeaders,
      status: response.status,
    }, step.assertions);
    
    results.forEach(res => {
      const { assertion, actualValue, passed, message } = res;
      const source = assertion.source;
      const expr = assertion.expression ? ` ${assertion.expression}` : '';
      const op = assertion.operator;
      
      const expectedStr = assertion.expectedValue !== undefined ? `Expected: '${assertion.expectedValue}'` : '';
      const actualStr = actualValue !== undefined ? `Actual: '${typeof actualValue === 'object' ? JSON.stringify(actualValue) : actualValue}'` : '';
      const detailParts = [expectedStr, actualStr].filter(Boolean);
      const logSuffix = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';

      if (passed) {
        assertionLogs.push({
          status: 'PASS',
          level: 'success',
          message: `${indent}  ✅ Assertion Passed: [${source}]${expr} ${op}${logSuffix}`
        });
      } else {
        // If message is just a value mismatch, we don't need to append it as it's already in logSuffix
        const isMismatch = message.includes('Expected') && message.includes('but got');
        const errorDetail = isMismatch ? '' : ` — ${message}`;
        assertionLogs.push({
          status: 'FAIL',
          level: 'error',
          message: `${indent}  ❌ Assertion Failed: [${source}]${expr} ${op}${logSuffix}${errorDetail}`
        });
      }
    });
  }

  // ─── 5. Process Extractors ───
  if (step.extractors && step.extractors.length > 0) {
    let parsedJsonBody: any = null;
    let jsonParsed = false;

    for (const extractor of step.extractors) {
      if (!extractor.name) continue;
      let extractedValue: string | undefined;

      try {
        if ((extractor.source === 'API_BODY_JSON' || extractor.source === 'API_BODY_XML') && extractor.expression) {
          if (!jsonParsed) {
            try {
              parsedJsonBody = JSON.parse(responseBody);
            } catch {
              // If JSON parsing fails, try XML parsing
              if (responseBody.trim().startsWith('<')) {
                try {
                  const { XMLParser } = require('fast-xml-parser');
                  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
                  parsedJsonBody = parser.parse(responseBody);
                } catch (xmlErr) {
                  // ignore xml parse error
                }
              }
            }
            jsonParsed = true;
          }
          if (parsedJsonBody) {
            const result = JSONPath({ path: extractor.expression, json: parsedJsonBody });
            if (result && result.length > 0) {
              extractedValue = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0]);
            }
          }
        } else if (extractor.source === 'API_HEADER' && extractor.expression) {
          const headerKey = extractor.expression.toLowerCase();
          const foundKey = Object.keys(responseHeaders).find(k => k.toLowerCase() === headerKey);
          if (foundKey) {
            extractedValue = responseHeaders[foundKey];
          }
        } else if (extractor.source === 'API_BODY_REGEX' && extractor.expression) {
          const regex = new RegExp(extractor.expression);
          const match = responseBody.match(regex);
          if (match && match.length > 1) {
            extractedValue = match[1]; // First capture group
          } else if (match && match.length === 1) {
            extractedValue = match[0]; // Full match if no capture groups
          }
        }

        if (extractedValue !== undefined) {
          context.setRuntimeVar(extractor.name, extractedValue, extractor.scope);
          if (extractor.scope === 'ENVIRONMENT') {
            const currentVars = environmentRepository.getVariables(environment);
            currentVars[extractor.name] = extractedValue;
            environmentRepository.updateVariables(environment, currentVars);
          }
          extractionLogs.push({
            status: 'INFO',
            level: 'info',
            message: `${indent}  📥 Extracted Variable: ${extractor.name} = ${extractedValue.length > 50 ? extractedValue.substring(0, 50) + '...' : extractedValue}`
          });
        } else {
          extractionLogs.push({
            status: 'WARN',
            level: 'warn',
            message: `${indent}  ⚠️ Extractor failed to find value for: ${extractor.name}`
          });
        }
      } catch (err) {
        console.error(`Extractor ${extractor.name} failed:`, err);
        extractionLogs.push({
          status: 'WARN',
          level: 'warn',
          message: `${indent}  ⚠️ Extractor error for ${extractor.name}: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  }

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
    assertionLogs,
    extractionLogs,
  };
}

/**
 * Resolve {{key}} in a value using API vars first, then context vars.
 */
function resolveTemplateVars(
  value: string,
  apiVars: Record<string, string>,
  context: ExecutionContext,
): string {
  if (!value) return '';
  // Priority: apiVars > contextVars
  const merged = { ...context.resolveAll(), ...apiVars };
  return interpolate(value, merged, (k, v, s) => context.setRuntimeVar(k, v, s as any));
}
