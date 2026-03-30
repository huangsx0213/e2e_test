import type { Settings } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    id: asId(input.id, 'settings'),
    currentProjectId: asText(input.currentProjectId),
    currentEnvironment: asText(input.currentEnvironment),
    headlessMode: input.headlessMode !== undefined ? input.headlessMode : true,
  };
}

export function deserializeSettings(input: any): Settings {
  return normalizeSettings({
    id: input.id,
    currentProjectId: input.currentProjectId,
    currentEnvironment: input.currentEnvironment,
    headlessMode: input.headlessMode,
  });
}
