import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { providerConfigRepo } from './repository.ts';
import { normalizeProviderConfig } from './mapper.ts';
import { providerConfigPayloadSchema, providerConfigPatchSchema } from './schema.ts';

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

export const providerConfigsModule = crudModule;