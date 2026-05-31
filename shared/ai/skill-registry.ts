import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  module: string;
  allowedTools: string[];
}

function parseSimpleYaml(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner.length === 0) {
        result[key] = [];
      } else {
        result[key] = inner.split(',').map(s => s.trim());
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class SkillRegistry {
  private skillsDir: string;
  private metadataCache: Map<string, SkillMetadata> | null = null;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async initialize(): Promise<void> {
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    const meta = new Map<string, SkillMetadata>();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(this.skillsDir, entry.name, 'SKILL.md');
      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        const parsed = this.parseFrontmatter(content);
        if (parsed) {
          meta.set(entry.name, parsed);
        }
      } catch {
      }
    }
    this.metadataCache = meta;
  }

  private parseFrontmatter(content: string): SkillMetadata | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const doc = parseSimpleYaml(match[1]);
    return {
      name: doc.name ?? '',
      description: doc.description ?? '',
      tags: Array.isArray(doc.tags) ? doc.tags : (doc.tags ? [doc.tags] : []),
      module: doc.module ?? '',
      allowedTools: Array.isArray(doc.allowedTools) ? doc.allowedTools : (doc.allowedTools ? [doc.allowedTools] : []),
    };
  }

  search(query: string): SkillMetadata[] {
    if (!this.metadataCache) return [];
    const q = query.toLowerCase();
    return [...this.metadataCache.values()].filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  getMetadata(name: string): SkillMetadata | undefined {
    return this.metadataCache?.get(name);
  }

  async loadContent(name: string): Promise<string> {
    const skillPath = path.join(this.skillsDir, name, 'SKILL.md');
    return fs.readFileSync(skillPath, 'utf8');
  }

  async loadModule(name: string): Promise<Record<string, any>> {
    const meta = this.getMetadata(name);
    if (!meta || !meta.module) {
      throw new Error(`No module defined for skill: ${name}`);
    }
    const modulePath = path.join(this.skillsDir, name, meta.module);
    return import(modulePath);
  }

  listByTag(tag: string): SkillMetadata[] {
    if (!this.metadataCache) return [];
    return [...this.metadataCache.values()].filter(s => s.tags.includes(tag));
  }

  getAllMetadata(): SkillMetadata[] {
    return this.metadataCache ? [...this.metadataCache.values()] : [];
  }
}

const SKILLS_ROOT = path.join(__dirname, 'skills');
export const globalSkillRegistry = new SkillRegistry(SKILLS_ROOT);