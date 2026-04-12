import type { Settings } from '../../shared/contracts/index.ts';
import { asId, asText } from '../../shared/utils/index.ts';

export function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    id: asId(input.id, 'settings'),
    currentProjectId: asText(input.currentProjectId),
    currentEnvironment: asText(input.currentEnvironment),
    headlessMode: input.headlessMode !== undefined ? input.headlessMode : true,
    viewportWidth: input.viewportWidth !== undefined ? Number(input.viewportWidth) : 1920,
    viewportHeight: input.viewportHeight !== undefined ? Number(input.viewportHeight) : 1080,
    recordVideo: input.recordVideo !== undefined ? input.recordVideo : true,
  };
}

export function deserializeSettings(input: any): Settings {
  return normalizeSettings({
    id: input.id,
    currentProjectId: input.currentProjectId,
    currentEnvironment: input.currentEnvironment,
    headlessMode: input.headlessMode,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    recordVideo: input.recordVideo,
  });
}
