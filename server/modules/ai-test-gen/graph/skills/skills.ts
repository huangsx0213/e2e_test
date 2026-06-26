import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { SkillDefinition } from '../nodes/types.ts';
import {
  requirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  coverageCheckQuery,
} from './data-skills.ts';
import { Log } from '../../../../shared/services/logger.ts';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

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
      Log.for(`skill:${skillName}`).info(`Loaded (${content.length} chars)${context ? `, context: ${String(context).slice(0, 60)}` : ''}`);
      return context ? `${content}\n\n---\nApplying to your context: ${context}` : content;
    },
  };
}

/**
 * 扫描 knowledge 目录，自动注册所有 .md 文件为 Knowledge Skill。
 * 不包含 ISTQB 单个技术指南（已合并为统一的 istqb_guide）。
 */
function loadKnowledgeSkills(): SkillDefinition[] {
  const knowledgeDir = join(__dirname, 'knowledge');
  try {
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md') && !f.startsWith('istqb-'));
    return files.map((f) => createKnowledgeSkill(join(knowledgeDir, f)));
  } catch (err: any) {
    Log.for('skills').warn(`Knowledge directory not found or empty (${knowledgeDir}): ${err.message}`);
    return [];
  }
}

/**
 * 合并的 ISTQB 技术指南：一次加载所有 ISTQB 技术文档。
 */
const ISTQB_GUIDE_FILES = [
  'istqb-equivalence-partitioning.md',
  'istqb-boundary-value-analysis.md',
  'istqb-decision-table.md',
  'istqb-state-transition.md',
  'istqb-use-case-testing.md',
];

function normalizeTechniqueLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/^istqb[\s_-]*/, '')
    .replace(/\bguide\b/g, '')
    .replace(/\btechnique\b/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTechniqueAliases(value: string): string[] {
  const normalized = normalizeTechniqueLabel(value);
  const aliases = new Set<string>([normalized]);
  if (normalized.endsWith(' testing')) {
    aliases.add(normalized.slice(0, -' testing'.length).trim());
  }
  return Array.from(aliases);
}

const istqbGuideSkill: SkillDefinition = {
  name: 'istqb_guide',
  description: 'Load ALL ISTQB technique guides combined (Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case Testing). Use when you need methodology, steps, examples, or common mistakes for any test design technique.',
  schema: z.object({
    techniques: z
      .array(z.string())
      .optional()
      .describe('Specific techniques to focus on (omit to load all)'),
    context: z
      .string()
      .optional()
      .describe('Brief context of what you are testing'),
  }),
  func: async ({ techniques, context }) => {
    const knowledgeDir = join(__dirname, 'knowledge');
    const requestedTechniqueAliases = Array.isArray(techniques)
      ? techniques.flatMap((technique) => buildTechniqueAliases(String(technique)))
      : [];
    const selectedFiles = Array.isArray(techniques) && techniques.length > 0
      ? ISTQB_GUIDE_FILES.filter((f) => {
          const fileTechniqueName = f.replace(/^istqb-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
          const fileAliases = buildTechniqueAliases(fileTechniqueName);
          return requestedTechniqueAliases.some((requested) => fileAliases.includes(requested));
        })
      : ISTQB_GUIDE_FILES;
    const parts = selectedFiles.map((f) => {
      const content = readFileSync(join(knowledgeDir, f), 'utf-8');
      return content;
    });
    const combined = parts.join('\n\n---\n\n');
    Log.for('skill:istqb_guide').info(`Loaded ${selectedFiles.length}/${ISTQB_GUIDE_FILES.length} guides (${combined.length} chars)`);
    return context
      ? `${combined}\n\n---\nApplying to your context: ${context}`
      : combined;
  },
};

// ============================================================
// Skill Groups
// ============================================================

// Registry of knowledge .md files — lazily scanned at import time.
// File CONTENTS are read on-demand when the skill function is invoked.
const knowledgeSkills = loadKnowledgeSkills();

/** Analyst 绑定的 skills：Data + ISTQB Guide + Knowledge Base + Coverage Check */
export const ANALYST_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  coverageCheckQuery,
  istqbGuideSkill,
  ...knowledgeSkills,
];

/** Designer 绑定的 skills：Data (subset) + ISTQB Guide + Knowledge Base */
export const DESIGNER_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  istqbGuideSkill,
  ...knowledgeSkills.filter((s) => s.name === 'knowledge_base'),
];

/** Quality Manager 绑定的 skills：Data (minimal) + Knowledge Base */
export const QUALITY_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  ...knowledgeSkills.filter((s) => s.name === 'knowledge_base'),
];

/** 所有 skills（用于调试/日志） */
export const ALL_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  ...knowledgeSkills,
];
