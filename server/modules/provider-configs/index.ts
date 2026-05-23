import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { providerConfigRepo } from './repository.ts';
import { normalizeProviderConfig } from './mapper.ts';
import { providerConfigPayloadSchema, providerConfigPatchSchema } from './schema.ts';
import { createAIProvider } from '../../../shared/ai/provider.ts';
import crypto from 'node:crypto';

function decryptApiKey(encrypted: string): string {
  if (!encrypted) return '';
  if (encrypted.startsWith('sk-') || encrypted.startsWith('nv-')) return encrypted;
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev-key-change-in-production-32b', 'salt', 32);
    const parts = encrypted.split(':');
    if (parts.length !== 3) return encrypted;
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    return (decipher.update(enc) as Buffer).toString('utf-8') + decipher.final('utf-8');
  } catch {
    throw new Error('Failed to decrypt API key. Check ENCRYPTION_KEY environment variable.');
  }
}

const crudModule = createCrudModule({
  basePath: '/api/provider-configs',
  repository: providerConfigRepo,
  normalize: normalizeProviderConfig,
  createSchema: providerConfigPayloadSchema,
  patchSchema: providerConfigPatchSchema,
});

crudModule.router.post('/:id/set-active', withErrorHandling((req, res) => {
  const id = req.params.id as string;
  const existing = providerConfigRepo.get(id);
  if (!existing) { res.status(404).json({ error: 'Provider config not found' }); return; }
  providerConfigRepo.setActive(id);
  res.json({ success: true });
}));

crudModule.router.post('/:id/copy', withErrorHandling((req, res) => {
  const id = req.params.id as string;
  const existing = providerConfigRepo.get(id);
  if (!existing) { res.status(404).json({ error: 'Provider config not found' }); return; }
  const copied = providerConfigRepo.save({
    ...existing,
    id: undefined,
    name: `${existing.name} (copy)`,
    isActive: false,
  });
  res.json(copied);
}));

crudModule.router.post('/:id/test', withErrorHandling(async (req, res) => {
  const id = req.params.id as string;
  const existing = providerConfigRepo.get(id);
  if (!existing) { res.status(404).json({ error: 'Provider config not found' }); return; }

  try {
    const provider = createAIProvider({
      type: existing.type,
      endpoint: existing.endpoint,
      apiKey: decryptApiKey(existing.encryptedApiKey),
      deployment: existing.deployment,
      apiVersion: existing.apiVersion,
      model: existing.model || undefined,
    } as any);

    const start = Date.now();
    const response = await provider.chat(
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      { maxTokens: 32, temperature: 0 }
    );
    const latency = Date.now() - start;

    res.json({
      success: true,
      latencyMs: latency,
      model: existing.model,
      response: response.content.slice(0, 100),
      tokenUsage: response.usage,
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: err.message || 'Connection failed',
    });
  }
}));

export const providerConfigsModule = crudModule;