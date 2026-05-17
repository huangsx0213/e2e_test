import type { Requirement } from '../../shared/contracts/index.ts';
import { normalizeRequirement } from './mapper.ts';
import { requirementRepo } from './repository.ts';
import { randomId } from '../../shared/utils/index.ts';

interface ImportResult {
  imported: number;
  requirements: Requirement[];
}

const headingToLevel: Record<number, Requirement['level']> = {
  0: 'epic',
  1: 'feature',
  2: 'story',
  3: 'ac',
};

export function parseMarkdownRequirements(markdown: string, projectId: string): ImportResult {
  const lines = markdown.split('\n');
  const requirements: Requirement[] = [];
  const levelStack: { level: number; id: string }[] = [];
  let currentReq: Partial<Requirement> | null = null;
  let descriptionLines: string[] = [];

  function flushCurrent() {
    if (!currentReq) return;
    currentReq.description = descriptionLines.join('\n').trim();
    requirements.push(normalizeRequirement(currentReq));
    currentReq = null;
    descriptionLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushCurrent();
      const hashCount = headingMatch[1].length;
      const level = hashCount - 1;
      const title = headingMatch[2].trim();

      while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= level) {
        levelStack.pop();
      }
      const parentId = levelStack.length > 0 ? levelStack[levelStack.length - 1].id : undefined;

      let priority: Requirement['priority'] = 'MEDIUM';
      const priorityMatch = title.match(/\[(CRITICAL|HIGH|MEDIUM|LOW)\]/);
      if (priorityMatch) {
        priority = priorityMatch[1] as Requirement['priority'];
      }

      const id = randomId('req');
      currentReq = { id, projectId, parentId, title, priority, level: headingToLevel[level] || 'story' };
      levelStack.push({ level, id });
    } else if (currentReq && line.trim()) {
      descriptionLines.push(line.trim());
    }
  }
  flushCurrent();

  return { imported: requirements.length, requirements };
}

export function parseCsvRequirements(csvText: string, projectId: string): ImportResult {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { imported: 0, requirements: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const requirements: Requirement[] = [];
  const titleToId: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => { record[h] = values[idx] || ''; });

    const id = randomId('req');
    titleToId[record.title] = id;

    let parentId: string | undefined;
    if (record.parent_title && titleToId[record.parent_title]) {
      parentId = titleToId[record.parent_title];
    }

    const tags = record.tags
      ? record.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    requirements.push(normalizeRequirement({
      id,
      projectId,
      parentId,
      title: record.title,
      description: record.description || '',
      level: (record.level || 'story') as Requirement['level'],
      priority: (record.priority || 'MEDIUM') as Requirement['priority'],
      tags,
    }));
  }

  return { imported: requirements.length, requirements };
}