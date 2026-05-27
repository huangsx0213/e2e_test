import { decryptApiKey } from '../../../shared/crypto.ts';

export function buildFallbackConfigs(pipelineRepo: {
  getProviderConfig: (id: string) => any;
}, fallbackConfigIds: string[]): Array<Record<string, any>> {
  return fallbackConfigIds
    .map((fid: string) => {
      const fb = pipelineRepo.getProviderConfig(fid);
      if (!fb) return null;
      return {
        type: fb.type,
        endpoint: fb.endpoint || undefined,
        apiKey: decryptApiKey(fb.encrypted_api_key),
        deployment: fb.deployment || undefined,
        apiVersion: fb.api_version || undefined,
        model: fb.model || undefined,
      };
    })
    .filter(Boolean) as Array<Record<string, any>>;
}
