import { skillCache, type SkillContext } from './skill-cache.ts';

export type { SkillContext } from './skill-cache.ts';

export function loadSkillContext(skillNames: string[]): SkillContext {
  return skillCache.load(skillNames);
}

export function readReferenceFile(skillName: string, referenceName: string): string {
  const ctx = skillCache.load([skillName]);
  const ref = ctx.referenceFiles.find(r => r.name === referenceName);
  if (!ref) throw new Error(`Reference file not found: ${skillName}/references/${referenceName}`);
  return ref.content;
}