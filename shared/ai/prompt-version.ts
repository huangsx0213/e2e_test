import { skillCache } from './skill-cache.ts';

export function computePromptVersion(): string {
  return skillCache.computeVersion();
}