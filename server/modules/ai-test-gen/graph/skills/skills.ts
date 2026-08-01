import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { SkillDefinition } from '../nodes/types.ts';
import type { BatchRequirement } from '../state.ts';
import {
  requirementDetailQuery,
  makeRequirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  crossEpicImpactQuery,
  makePreviousBatchConditionsQuery,
  makePreviousBatchCasesQuery,
} from './data-skills.ts';
import { Log } from '../../../../shared/services/logger.ts';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

// ============================================================
// Knowledge Skill Factory
// ============================================================

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns the frontmatter fields and the body (content after the closing `---`).
 * If no frontmatter is present, returns an empty object and the original content.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const [, rawFm, body] = match;
  const frontmatter: Record<string, string> = {};
  for (const line of rawFm.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

/**
 * Create a Knowledge Skill from a Markdown file following Anthropic's
 * standard SKILL.md format. The file name becomes the skill name
 * (stripped of .md suffix, hyphens → underscores). The description is
 * read from the YAML frontmatter; if absent, a generic one is generated
 * from the file name. The frontmatter is stripped from the body before
 * returning the content to the LLM.
 */
function createKnowledgeSkill(mdFilePath: string): SkillDefinition {
  const fileName = basename(mdFilePath, '.md');
  const skillName = fileName.replace(/-/g, '_');

  // Read once at registration time: extract frontmatter for description,
  // cache the body (without frontmatter) for runtime invocation.
  const rawContent = readFileSync(mdFilePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(rawContent);

  // Use frontmatter description if available; otherwise generate from filename
  const description = frontmatter.description ?? (() => {
    const label = fileName
      .replace(/^istqb_/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `Load the "${label}" knowledge guide. Use when you need detailed methodology, steps, examples, or common mistakes for this technique or domain topic.`;
  })();

  return {
    name: skillName,
    description,
    schema: z.object({
      context: z
        .string()
        .optional()
        .describe('Brief context of what you are testing, to get tailored guidance'),
    }),
    func: async ({ context }) => {
      Log.for(`skill:${skillName}`).info(`Loaded (${body.length} chars)${context ? `, context: ${String(context).slice(0, 60)}` : ''}`);
      return context ? `${body}\n\n---\nApplying to your context: ${context}` : body;
    },
  };
}

/**
 * Scan the knowledge directory and auto-register all .md files as Knowledge Skills.
 * Excludes individual ISTQB technique guides (already merged into the unified istqb_guide).
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
 * Combined ISTQB technique guides: loads all ISTQB technique documents in one call.
 */
const ISTQB_GUIDE_FILES = [
  'istqb-equivalence-partitioning.md',
  'istqb-boundary-value-analysis.md',
  'istqb-decision-table.md',
  'istqb-state-transition.md',
  'istqb-use-case-testing.md',
  'istqb-integration-testing.md',
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

// Cache ISTQB guide file contents at registration time — files are static,
// avoids repeated readFileSync on every LLM skill invocation.
const _istqbKnowledgeDir = join(__dirname, 'knowledge');
const _istqbOverviewBody = parseFrontmatter(readFileSync(join(_istqbKnowledgeDir, 'istqb-overview.md'), 'utf-8')).body;
const _istqbGuideBodies: Record<string, string> = {};
for (const f of ISTQB_GUIDE_FILES) {
  _istqbGuideBodies[f] = parseFrontmatter(readFileSync(join(_istqbKnowledgeDir, f), 'utf-8')).body;
}

const istqbGuideSkill: SkillDefinition = {
  name: 'istqb_guide',
  description: 'Load ALL ISTQB technique guides combined (Equivalence Partitioning, Boundary Value Analysis, Decision Table, State Transition, Use Case Testing) PLUS the Integration Testing test-level guide (component vs integration test level decision). Use when you need methodology, steps, examples, or common mistakes for any test design technique or test level.',
  schema: z.object({
    techniques: z
      .array(z.string())
      .optional()
      .describe('Specific techniques or test levels to focus on (omit to load all)'),
    context: z
      .string()
      .optional()
      .describe('Brief context of what you are testing'),
  }),
  func: async ({ techniques, context }) => {
    const requestedTechniqueAliases = Array.isArray(techniques)
      ? techniques.flatMap((technique) => buildTechniqueAliases(String(technique)))
      : [];

    // P1: When no techniques specified, return only the compact overview
    // (decision table + selection rules). The LLM should call again with
    // specific techniques after deciding which ones to apply.
    if (!Array.isArray(techniques) || techniques.length === 0) {
      const overview = _istqbOverviewBody;
      Log.for('skill:istqb_guide').info(`Loaded overview only (${overview.length} chars) — call again with techniques for detailed guides`);
      return context
        ? `${overview}\n\n---\nApplying to your context: ${context}`
        : overview;
    }

    const selectedFiles = ISTQB_GUIDE_FILES.filter((f) => {
      const fileTechniqueName = f.replace(/^istqb-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
      const fileAliases = buildTechniqueAliases(fileTechniqueName);
      return requestedTechniqueAliases.some((requested) => fileAliases.includes(requested));
    });
    const parts = selectedFiles.map((f) => _istqbGuideBodies[f]);
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

/**
 * Skills bound to the Analyst: Data + ISTQB Guide + Knowledge Base.
 * Requires runId so previous_batch_conditions_query can look up historical agent logs.
 * Passes batchRequirements for requirement_detail_query fallback.
 */
export function buildAnalystSkills(runId: string, batchRequirements?: BatchRequirement[]): SkillDefinition[] {
  return [
    makeRequirementDetailQuery(batchRequirements),
    requirementGraphQuery,
    flowDetailQuery,
    crossEpicImpactQuery,
    makePreviousBatchConditionsQuery(runId),
    istqbGuideSkill,
    ...knowledgeSkills.filter((s) => s.name === 'analyst_rules'),
  ];
}

/**
 * Skills bound to the Designer: Data (subset) + ISTQB Guide + Knowledge Base.
 * Requires runId so previous_batch_cases_query can look up historical agent logs.
 * Passes batchRequirements for requirement_detail_query fallback.
 */
export function buildDesignerSkills(runId: string, batchRequirements?: BatchRequirement[]): SkillDefinition[] {
  return [
    makeRequirementDetailQuery(batchRequirements),
    requirementGraphQuery,
    flowDetailQuery,
    makePreviousBatchCasesQuery(runId),
    istqbGuideSkill,
    ...knowledgeSkills.filter((s) => s.name === 'designer_rules'),
  ];
}

/**
 * Skills bound to the Quality Manager: Data + Knowledge Base.
 * Requires runId so previous_batch_cases_query can look up historical agent logs for D2 cross-batch redundancy.
 * Passes batchRequirements for requirement_detail_query fallback.
 */
export function buildQualitySkills(runId: string, batchRequirements?: BatchRequirement[]): SkillDefinition[] {
  return [
    makeRequirementDetailQuery(batchRequirements),
    flowDetailQuery,
    makePreviousBatchCasesQuery(runId),
    istqbGuideSkill,
    ...knowledgeSkills.filter((s) => s.name === 'quality_rules'),
  ];
}

/** Skills for contexts without runId/batch (e.g. ALL_SKILLS, debugging) */
export const QUALITY_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  flowDetailQuery,
  ...knowledgeSkills.filter((s) => s.name === 'quality_rules'),
];

/** All skills (for debugging/logging) */
export const ALL_SKILLS: SkillDefinition[] = [
  requirementDetailQuery,
  requirementGraphQuery,
  flowDetailQuery,
  ...knowledgeSkills,
];
