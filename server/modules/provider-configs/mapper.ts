import type { ProviderConfig } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeProviderConfig(input: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: asId(input.id, 'prov'),
    projectId: asText(input.projectId) || '',
    name: asText(input.name),
    type: (input.type || 'azure-openai') as ProviderConfig['type'],
    endpoint: input.endpoint || '',
    encryptedApiKey: input.encryptedApiKey || '',
    deployment: input.deployment || '',
    apiVersion: input.apiVersion || '',
    model: input.model || '',
    fallbackConfigIds: input.fallbackConfigIds || [],
    monthlyTokenLimit: input.monthlyTokenLimit ?? null,
    isActive: input.isActive !== undefined ? input.isActive : false,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}