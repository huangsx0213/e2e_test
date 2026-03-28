import type { Settings } from '../../../client/types';
import { asId, asText } from '../../utils.ts';

export function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    id: asId(input.id, 'settings'),
    currentProjectId: asText(input.currentProjectId),
    currentEnvironment: asText(input.currentEnvironment),
  };
}
