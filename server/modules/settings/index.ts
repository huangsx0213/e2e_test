import { createCrudModule } from '../../shared/http/crud.ts';
import { normalizeSettings } from './mapper.ts';
import { settingsRepository } from './repository.ts';
import { settingsPatchSchema, settingsPayloadSchema } from './schema.ts';

export const settingsModule = createCrudModule({
  basePath: '/api/settings',
  repository: settingsRepository,
  normalize: normalizeSettings,
  createSchema: settingsPayloadSchema,
  patchSchema: settingsPatchSchema,
});
