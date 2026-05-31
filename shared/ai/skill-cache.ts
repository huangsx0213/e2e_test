import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.join(__dirname, 'skills');

export interface SkillContext {
  systemPrompt: string;
  referenceFiles: { name: string; skillName: string; content: string }[];
  skillContents: Record<string, string>;
  cachedSkillContents: Record<string, string>;
}

export class SkillCache {
  private contexts = new Map<string, SkillContext>();
  private _version: string | null = null;

  load(skillNames: string[]): SkillContext {
    const key = skillNames.sort().join(',');
    const cached = this.contexts.get(key);
    if (cached) return cached;

    const prompts: string[] = [];
    const referenceFiles: SkillContext['referenceFiles'] = [];
    const skillContents: Record<string, string> = {};
    const cachedSkillContents: Record<string, string> = {};
    for (const skillName of skillNames) {
      const skillDir = path.join(SKILLS_ROOT, skillName);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        prompts.push(content);
        skillContents[skillName] = content;
      }
      const refsDir = path.join(skillDir, 'references');
      if (fs.existsSync(refsDir)) {
        for (const file of fs.readdirSync(refsDir)) {
          const filePath = path.join(refsDir, file);
          if (fs.statSync(filePath).isFile()) {
            referenceFiles.push({ name: file, skillName, content: fs.readFileSync(filePath, 'utf-8') });
          }
        }
      }
    }
    const ctx: SkillContext = { systemPrompt: prompts.join('\n\n---\n\n'), referenceFiles, skillContents, cachedSkillContents };
    this.contexts.set(key, ctx);
    return ctx;
  }

  computeVersion(): string {
    if (this._version) return this._version;
    const hash = createHash('sha256');
    const skillDirs = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const skillName of skillDirs.sort()) {
      const md = path.join(SKILLS_ROOT, skillName, 'SKILL.md');
      if (fs.existsSync(md)) hash.update(fs.readFileSync(md, 'utf-8'));
      const refsDir = path.join(SKILLS_ROOT, skillName, 'references');
      if (fs.existsSync(refsDir)) {
        for (const ref of fs.readdirSync(refsDir).sort()) {
          hash.update(fs.readFileSync(path.join(refsDir, ref), 'utf-8'));
        }
      }
    }
    this._version = hash.digest('hex').slice(0, 12);
    return this._version;
  }

  invalidate(): void {
    this.contexts.clear();
    this._version = null;
  }
}

export const skillCache = new SkillCache();
