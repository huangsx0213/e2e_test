import type { HeaderProfile } from '../../../client/types';
import { asArray, asId, asOptionalText, asText } from '../../utils.ts';

export function normalizeHeaderProfile(input: Partial<HeaderProfile>): HeaderProfile {
  return {
    id: asId(input.id, 'header'),
    projectId: asOptionalText(input.projectId),
    name: asText(input.name, 'New Header Profile'),
    description: asText(input.description),
    headers: asArray<{ key: string; value: string; enabled: boolean }>(input.headers).map((header) => ({
      key: asText(header.key),
      value: asText(header.value),
      enabled: Boolean(header.enabled),
    })),
  };
}
