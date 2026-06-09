import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { z } from 'zod';
import type { SkillDefinition } from '../nodes/types.ts';
import {
  requirementDetailQuery,
  relatedRequirementsQuery,
  flowDetailQuery,
} from './data-skills.ts';

const __dirname = import.meta.dirname;

// ============================================================
// Knowledge Skill Factory
// ============================================================

/**
 * 从 Markdown 文件创建 Knowledge Skill。
 * 文件名即 skill name（去掉 .md 后缀，连字符转下划线）。
 */
function createKnowledgeSkill(mdFilePath: string): SkillDefinition {
  const fileName = basename(mdFilePath, '.md');
  const skillName = fileName.replace(/-/g, '_');

  // 从文件名推断简短描述
  const label = fileName
    .replace(/^istqb_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    name: skillName,
    description: `Load the "${label}" knowledge guide. Use when you need detailed methodology, steps, examples, or common mistakes for this technique or domain topic.`,
    schema: z.object({
      context: z
        .string()
        .optional()
        .describe('Brief context of what you are testing, to get tailored guidance'),
    }),
    func: async ({ context }) => {
      const content = readFileSync(mdFilePath, 'utf-8');
      console.log(`[skill:${skillName}] Loaded knowledge (${content.length} chars)${context ? `, context: ${String(context).slice(0, 60)}` : ''}`);
      return context ? `${content}\n\n---\nApplying to your context: ${context}` : content;
    },
  };
}

/**
 * 扫描 knowledge 目录，自动注册所有 .md 文件为 Knowledge Skill。
 */
function loadKnowledgeSkills(): SkillDefinition[] {
  const knowledgeDir = join(__dirname, 'knowledge');
  try {
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
    console.log(`[skills] Loaded ${files.length} knowledge files from ${knowledgeDir}: ${files.join(', ')}`);
    return files.map((f) => createKnowledgeSkill(join(knowledgeDir, f)));
  } catch (err: any) {
    console.warn(`[skills] Knowledge directory not found or empty (${knowledgeDir}): ${err.message}`);
    return [];
  }
}

// ============================================================
// Skill Groups
// ============================================================

const knowledgeSkills = loadKnowledgeSkills();

/** Analyst 绑定的 skills：Data + ISTQB + Knowledge Base */
export const ANALYST_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  relatedRequirementsQuery,
  flowDetailQuery,
  ...knowledgeSkills,
];

/** Designer 绑定的 skills：Data (subset) + ISTQB + Knowledge Base */
export const DESIGNER_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  flowDetailQuery,
  ...knowledgeSkills.filter(
    (s) => s.name.startsWith('istqb_') || s.name === 'knowledge_base',
  ),
];

/** Quality Manager 绑定的 skills：Data (minimal) + Knowledge Base */
export const QUALITY_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  ...knowledgeSkills.filter((s) => s.name === 'knowledge_base'),
];

/** 所有 skills（用于调试/日志） */
export const ALL_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  relatedRequirementsQuery,
  flowDetailQuery,
  ...knowledgeSkills,
];
