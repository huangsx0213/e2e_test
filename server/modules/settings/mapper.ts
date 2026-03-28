import type { Settings } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    id: asId(input.id, 'settings'),
    currentProjectId: asText(input.currentProjectId),
    currentEnvironment: asText(input.currentEnvironment),
  };
}
