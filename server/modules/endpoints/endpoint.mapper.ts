import type { ApiEndpoint } from '../../../client/types';
import { asArray, asId, asOptionalText, asText, normalizeStringRecord } from '../../utils.ts';

export function normalizeApiEndpoint(input: Partial<ApiEndpoint>): ApiEndpoint {
  return {
    id: asId(input.id, 'endpoint'),
    projectId: asOptionalText(input.projectId),
    name: asText(input.name, 'New Endpoint'),
    description: asText(input.description),
    method: asOptionalText(input.method) as ApiEndpoint['method'],
    baseUrls: normalizeStringRecord(input.baseUrls),
    parameters: asArray<{ key: string; value: string; enabled: boolean }>(input.parameters).map((parameter) => ({
      key: asText(parameter.key),
      value: asText(parameter.value),
      enabled: Boolean(parameter.enabled),
    })),
  };
}
