import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { providerConfigRepo } from './repository.ts';
import { normalizeProviderConfig } from './mapper.ts';
import { providerConfigPayloadSchema, providerConfigPatchSchema } from './schema.ts';
import { createAIProvider } from '../ai-test-gen/infra/provider.ts';
import { decryptApiKey } from '../../shared/crypto.ts';

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
      model: existing.models && existing.models.length > 0 ? existing.models[0] : (existing.model || undefined),
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
      response: response.content?.slice(0, 100) ?? '(empty response)',
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