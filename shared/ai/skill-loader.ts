import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = path.join(__dirname, 'skills');

export interface SkillContext {
  systemPrompt: string;
  referenceFiles: { name: string; skillName: string; content: string }[];
}

export function loadSkillContext(skillNames: string[]): SkillContext {
  const prompts: string[] = [];
  const referenceFiles: SkillContext['referenceFiles'] = [];
  for (const skillName of skillNames) {
    const skillDir = path.join(SKILLS_ROOT, skillName);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) { prompts.push(fs.readFileSync(skillMdPath, 'utf-8')); }
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir)) {
      for (const file of fs.readdirSync(refsDir)) {
        const filePath = path.join(refsDir, file);
        if (fs.statSync(filePath).isFile()) { referenceFiles.push({ name: file, skillName, content: fs.readFileSync(filePath, 'utf-8') }); }
      }
    }
  }
  return { systemPrompt: prompts.join('\n\n---\n\n'), referenceFiles };
}

export function readReferenceFile(skillName: string, referenceName: string): string {
  const filePath = path.join(SKILLS_ROOT, skillName, 'references', referenceName);
  if (!fs.existsSync(filePath)) throw new Error(`Reference file not found: ${filePath}`);
  return fs.readFileSync(filePath, 'utf-8');
}