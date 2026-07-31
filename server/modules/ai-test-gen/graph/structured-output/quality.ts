import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  arrayFromRecordValues,
  formatZodValidationError,
  nullToEmptyArray,
  nullToUndefined,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';
import { Log } from '../../../../shared/services/logger.ts';

// F19: step atomicity hard constraint — keep `expected` to a single observable
// outcome. Bundled assertions (containing ";" + conjunction, or > 200 chars) are
// rejected because the LLM is supposed to split them into separate steps.
const atomicExpected = (value: string): true | string => {
  const v = String(value ?? '');
  if (v.length > 200) {
    return `expected must be a single observable outcome (<= 200 chars), got ${v.length} chars. Split into multiple steps. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`;
  }
  // Reject multiple semicolon-separated assertions in a single expected.
  const segments = v.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    return `expected must contain a single assertion (found ${segments.length} semicolon-separated segments). Split into multiple steps — one assertion per step. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`;
  }
  return true;
};

const QualityRuntimeSchema = z.object({
  finalTestCases: z.preprocess(
    (value) => Array.isArray(value) ? value : [],
    z.array(z.object({
      id: z.string(),
      title: z.string(),
      conditionId: z.string(),
      requirementId: z.string(),
      // F10 / F11 carried through from draft cases. Quality preserves them.
      coveredConditions: z.array(z.string()).default([]),
      referencedComponentConditions: z.array(z.string()).default([]),
      priority: z.string(),
      category: z.string(),
      testLevel: z.enum(['component', 'integration']),
      techniqueApplied: z.string(),
      preconditions: z.array(z.string()),
      testData: z.array(z.string()),
      steps: z.array(z.object({
        stepNumber: z.number(),
        action: z.string(),
        // F19: refine each step's `expected` for atomicity.
        expected: z.string().superRefine((val, ctx) => {
          const r = atomicExpected(val);
          if (r !== true) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: r,
            });
          }
        }),
      })),
      tags: z.array(z.string()).default([]),
      status: z.string().default('approved'),
      reviewSummary: z.string(),
      changeLog: z.array(z.object({
        field: z.string(),
        from: z.string().optional(),
        to: z.string().optional(),
        reason: z.string(),
      })).default([]),
    })).min(1),
  ),
  // Coverage matrix: F27 — REQUIRED for new runs (was optional for backward compat).
  // The LLM is the source of truth: one row per Analyst conditionId.
  // Marked optional in the schema so legacy/older runs that pre-date F27 still
  // parse. The Quality prompt makes the field MANDATORY for new runs.
  coverageMatrix: z.object({
    rows: z.array(z.object({
      conditionId: z.string(),
      conditionSummary: z.string(),
      requirementId: z.string(),
      testLevel: z.string(),
      primaryTechnique: z.string(),
      category: z.string(),
      conditionType: z.enum(['component', 'flow']).optional(),
      flowStepRef: z.object({
        flowId: z.string(),
        sequence: z.number(),
        actionSummary: z.string().optional(),
      }).optional(),
      coveredByCaseIds: z.array(z.string()),
      coverageStatus: z.enum(['covered', 'missing']),
      notes: z.string().optional(),
    })),
    summary: z.object({
      totalConditions: z.number(),
      coveredConditions: z.number(),
      missingConditions: z.number(),
      byTestLevel: z.record(z.string(), z.number()),
      byTechnique: z.record(z.string(), z.number()),
      byCategory: z.record(z.string(), z.number()),
      // F29: condition-type breakdown so the UI can show component vs flow counts.
      byConditionType: z.record(z.string(), z.number()).optional(),
    }),
  }).optional(),
});

type QualityRuntimeOutput = z.infer<typeof QualityRuntimeSchema>;

interface ExpectedDraftCase {
  id: string;
  conditionId: string;
  requirementId: string;
  expectedTestLevel?: 'component' | 'integration';
  coveredConditions?: string[];
  referencedComponentConditions?: string[];
}

function validateDraftCaseCoverage(
  parsed: QualityRuntimeOutput,
  expectedDraftCases: ExpectedDraftCase[],
): QualityRuntimeOutput {
  if (expectedDraftCases.length === 0) return parsed;

  const expectedById = new Map(expectedDraftCases.map((draftCase) => [draftCase.id, draftCase]));
  const coveredIds = new Set(parsed.finalTestCases.map((testCase) => testCase.id));
  const missingIds = expectedDraftCases
    .map((draftCase) => draftCase.id)
    .filter((draftCaseId) => !coveredIds.has(draftCaseId));

  if (missingIds.length > 0) {
    // Auto-fix: instead of failing the entire Quality node, auto-add missing
    // cases as "rejected". This prevents a single LLM omission from crashing
    // the pipeline and making the run unrecoverable via retry. The auto-repair
    // loop (checkpoint_3) or manual review can address the gap later.
    const log = Log.for('quality:auto-fix');
    log.warn(`LLM omitted ${missingIds.length} draft case(s) [${missingIds.join(', ')}] — auto-adding as rejected`);
    for (const missingId of missingIds) {
      const expected = expectedById.get(missingId);
      if (!expected) continue;
      parsed.finalTestCases.push({
        id: expected.id,
        title: `Auto-rejected: omitted by Quality LLM`,
        conditionId: expected.conditionId,
        requirementId: expected.requirementId,
        coveredConditions: expected.coveredConditions ?? [],
        referencedComponentConditions: expected.referencedComponentConditions ?? [],
        priority: 'medium',
        category: 'functional',
        testLevel: expected.expectedTestLevel ?? 'component',
        techniqueApplied: 'Unknown',
        preconditions: [],
        testData: [],
        steps: [{
          stepNumber: 1,
          action: 'N/A — case auto-rejected by validation',
          expected: 'Case was omitted by Quality LLM and requires manual review.',
        }],
        tags: ['auto-rejected'],
        status: 'rejected',
        reviewSummary: 'Auto-rejected: case was omitted from Quality LLM output. Requires manual review or re-generation.',
        changeLog: [],
      });
    }
  }

  for (const testCase of parsed.finalTestCases) {
    const expected = expectedById.get(testCase.id);
    if (!expected) continue;
    if (testCase.conditionId !== expected.conditionId || testCase.requirementId !== expected.requirementId) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['finalTestCases'],
          message: `Final reviewed case ${testCase.id} changed conditionId or requirementId`,
          input: testCase,
        },
      ]);
    }
    if (expected.expectedTestLevel && testCase.testLevel !== expected.expectedTestLevel) {
      // Auto-fix: the LLM occasionally flips testLevel (e.g. integration ->
      // component) when it thinks the steps don't warrant cross-component
      // scope. Restore the Designer's testLevel — the coverage matrix depends
      // on it. Auto-fix philosophy: normalize during parse to prevent Phase 2
      // retries the LLM consistently fails to self-correct.
      const log = Log.for('quality:auto-fix');
      log.warn(`Auto-fixed ${testCase.id}: restored testLevel "${testCase.testLevel}" -> "${expected.expectedTestLevel}" (LLM must not flip testLevel)`);
      testCase.testLevel = expected.expectedTestLevel;
    }
    // F15: integration cases must still declare referencedComponentConditions.
    if (testCase.testLevel === 'integration' && testCase.referencedComponentConditions.length === 0) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['finalTestCases'],
          message: `Final reviewed case ${testCase.id} is testLevel="integration" but referencedComponentConditions is empty. Integration cases must explicitly name the component conditions they assume as preconditions.`,
          input: testCase,
        },
      ]);
    }
  }

  return parsed;
}

/**
 * F16: anti-redundancy hard check at the Quality layer. For every pair
 * (componentCase, integrationCase) sharing the same requirementId, scan the
 * integration case's `steps[].expected` for verbatim / near-verbatim overlaps
 * with the component case's `steps[].expected`. If substantial overlap is
 * found, the integration case has re-asserted what a sibling component case
 * already covers — a redundancy defect.
 *
 * Heuristic: tokenize each expected into lowercase word-tokens, drop short
 * stopwords, and compute Jaccard overlap. > 0.55 overlap = redundancy signal.
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'and', 'or', 'but', 'if', 'then', 'than', 'so', 'to', 'of', 'in', 'on',
  'at', 'for', 'with', 'by', 'from', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

interface RedundancyFlag {
  integrationCaseId: string;
  componentCaseId: string;
  componentExpected: string;
  integrationExpected: string;
  overlap: number;
}

function detectRedundancy(
  finalTestCases: QualityRuntimeOutput['finalTestCases'],
): RedundancyFlag[] {
  const componentCases = finalTestCases.filter((tc) => tc.testLevel === 'component');
  const integrationCases = finalTestCases.filter((tc) => tc.testLevel === 'integration');
  const flags: RedundancyFlag[] = [];
  for (const ic of integrationCases) {
    const icExpecteds = ic.steps.map((s) => s.expected);
    const icTokens = icExpecteds.map(tokenize);
    for (const cc of componentCases) {
      if (cc.requirementId !== ic.requirementId) continue;
      for (let i = 0; i < cc.steps.length; i++) {
        const ccTokens = tokenize(cc.steps[i].expected);
        for (let j = 0; j < icExpecteds.length; j++) {
          const overlap = jaccard(ccTokens, icTokens[j]);
          if (overlap > 0.55) {
            flags.push({
              integrationCaseId: ic.id,
              componentCaseId: cc.id,
              componentExpected: cc.steps[i].expected,
              integrationExpected: icExpecteds[j],
              overlap,
            });
          }
        }
      }
    }
  }
  return flags;
}

function validateAntiRedundancy(
  parsed: QualityRuntimeOutput,
): QualityRuntimeOutput {
  // Only run the check when the LLM did NOT log a `Redundancy` fix in changeLog.
  // If the LLM has already addressed redundancy for a case, we trust it.
  const changedCaseIds = new Set<string>();
  for (const tc of parsed.finalTestCases) {
    for (const change of tc.changeLog) {
      const reason = String(change.reason ?? '').toLowerCase();
      if (reason.includes('redundan') || reason.includes('overlap') || reason.includes('non-overlap')) {
        changedCaseIds.add(tc.id);
      }
    }
  }
  const flags = detectRedundancy(parsed.finalTestCases).filter(
    (f) => !changedCaseIds.has(f.integrationCaseId),
  );
  if (flags.length > 0) {
    // Auto-fix: instead of blocking the entire batch with a hard validation
    // error (which the LLM often fails to self-correct across all 3 Phase 2
    // retries), auto-add changeLog entries for the unresolved redundancy.
    // The changeLog entry makes the redundancy visible to the reviewer, who
    // can decide whether to fix it (move to preconditions) or accept it.
    // This is consistent with the D2 cross-batch redundancy pattern: flag,
    // don't delete, let the reviewer decide.
    const log = Log.for('quality:auto-redundancy');
    const byId = new Map(parsed.finalTestCases.map(c => [c.id, c]));
    for (const flag of flags) {
      const tc = byId.get(flag.integrationCaseId);
      if (tc) {
        tc.changeLog.push({
          field: 'steps',
          reason: `redundancy: auto-detected overlap with ${flag.componentCaseId} (overlap=${flag.overlap.toFixed(2)}) — integration step "${flag.integrationExpected}" duplicates component step "${flag.componentExpected}". Reviewer should move to preconditions if needed.`,
        });
        if (tc.status === 'approved') {
          tc.status = 'approved_with_changes';
        }
      }
    }
    const summary = flags
      .slice(0, 5)
      .map((f) => `${f.integrationCaseId} ↔ ${f.componentCaseId} (overlap=${f.overlap.toFixed(2)})`)
      .join('; ');
    log.warn(`Auto-flagged ${flags.length} redundancy issue(s): ${summary}`);
  }
  return parsed;
}

/**
 * Coerce a changeLog from/to value to string. The LLM frequently returns
 * arrays (e.g. when the changed field is coveredConditions), which causes
 * schema validation to fail because from/to are typed as string.
 */
function coerceChangeLogValue(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function normalizeFinalTestCase(
  value: unknown,
  expectedById?: Map<string, ExpectedDraftCase>,
): Record<string, unknown> {
  const tc = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const expected = expectedById?.get(String(tc.id ?? ''));
  const log = Log.for('quality:auto-fix');
  const steps: Record<string, unknown>[] = Array.isArray(tc.steps)
    ? tc.steps.flatMap((step) => {
        const normalizedStep = step && typeof step === 'object' ? step as Record<string, unknown> : {};
        const action = String(normalizedStep.action ?? '');
        const expectedText = String(normalizedStep.expected ?? '');
        // F19 auto-repair: split steps whose `expected` joins multiple
        // assertions with semicolons into one step per assertion (same as
        // designer.ts). The LLM consistently violates the one-assertion-per-step
        // rule even after 3 Phase 2 retries.
        const segments = expectedText.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
        if (segments.length <= 1) {
          return [{ ...normalizedStep, action, expected: expectedText }];
        }
        log.warn(`Auto-split ${String(tc.id ?? '?')}: step "${action.slice(0, 60)}" had ${segments.length} semicolon-joined assertions -> ${segments.length} atomic steps`);
        return segments.map((seg) => ({ ...normalizedStep, action, expected: seg }));
      })
    : [];
  // Renumber sequentially — splitting invalidates the original stepNumber.
  steps.forEach((s, i) => { s.stepNumber = i + 1; });
  const changeLog = nullToEmptyArray(tc.changeLog as Record<string, unknown>[] | null | undefined)
    .map((change) => {
      const normalizedChange = change && typeof change === 'object' ? change as Record<string, unknown> : {};
      return {
        ...normalizedChange,
        from: coerceChangeLogValue(normalizedChange.from),
        to: coerceChangeLogValue(normalizedChange.to),
      };
    });

  const rawLevel = tc.testLevel;
  const testLevel = typeof rawLevel === 'string' ? rawLevel.toLowerCase() : rawLevel;

  return {
    ...tc,
    conditionId: expected?.conditionId ?? tc.conditionId,
    requirementId: expected?.requirementId ?? tc.requirementId,
    reviewSummary: typeof tc.reviewSummary === 'string' ? tc.reviewSummary : '',
    testLevel,
    // F10 / F11: preserve traceability arrays. If the LLM omits them, fall back
    // to the expected draft case's values, then to safe empty arrays.
    coveredConditions: nullToEmptyArray(tc.coveredConditions as string[] | null | undefined).length > 0
      ? (tc.coveredConditions as string[])
      : (expected?.coveredConditions ?? []),
    referencedComponentConditions: nullToEmptyArray(tc.referencedComponentConditions as string[] | null | undefined).length > 0
      ? (tc.referencedComponentConditions as string[])
      : (expected?.referencedComponentConditions ?? []),
    preconditions: nullToEmptyArray(tc.preconditions as string[] | null | undefined),
    testData: nullToEmptyArray(tc.testData as string[] | null | undefined),
    steps,
    tags: nullToEmptyArray(tc.tags as string[] | null | undefined),
    changeLog,
  };
}

/**
 * Normalize the coverageMatrix produced by the Quality Manager.
 * Tolerates missing/malformed fields so a partial matrix still parses.
 * F27: the LLM is now the source of truth; we just sanitize.
 */
function normalizeCoverageMatrix(raw: Record<string, unknown>): Record<string, unknown> {
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  const rows = rowsRaw.map((r) => {
    const row = r && typeof r === 'object' ? r as Record<string, unknown> : {};
    const status = typeof row.coverageStatus === 'string' ? row.coverageStatus : 'covered';
    const flowStepRaw = row.flowStepRef && typeof row.flowStepRef === 'object'
      ? row.flowStepRef as Record<string, unknown>
      : null;
    const flowStepRef = flowStepRaw
      ? {
          flowId: String(flowStepRaw.flowId ?? ''),
          sequence: typeof flowStepRaw.sequence === 'number' ? flowStepRaw.sequence : 0,
          actionSummary: typeof flowStepRaw.actionSummary === 'string' ? flowStepRaw.actionSummary : undefined,
        }
      : undefined;
    const conditionType = typeof row.conditionType === 'string'
      && (row.conditionType === 'component' || row.conditionType === 'flow')
        ? row.conditionType
        : undefined;
    return {
      ...row,
      conditionId: String(row.conditionId ?? ''),
      conditionSummary: String(row.conditionSummary ?? ''),
      requirementId: String(row.requirementId ?? ''),
      testLevel: typeof row.testLevel === 'string' ? row.testLevel : 'component',
      primaryTechnique: String(row.primaryTechnique ?? ''),
      category: String(row.category ?? ''),
      conditionType,
      flowStepRef,
      coveredByCaseIds: nullToEmptyArray(row.coveredByCaseIds as string[] | null | undefined),
      coverageStatus: status === 'missing' ? 'missing' : 'covered',
      notes: nullToUndefined(row.notes as string | null | undefined),
    };
  });

  const summaryRaw = raw.summary && typeof raw.summary === 'object' ? raw.summary as Record<string, unknown> : {};
  const numOrZero = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const recordOfNumbers = (v: unknown): Record<string, number> => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, number> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = numOrZero(val);
      return out;
    }
    return {};
  };

  return {
    rows,
    summary: {
      totalConditions: numOrZero(summaryRaw.totalConditions),
      coveredConditions: numOrZero(summaryRaw.coveredConditions),
      missingConditions: numOrZero(summaryRaw.missingConditions),
      byTestLevel: recordOfNumbers(summaryRaw.byTestLevel),
      byTechnique: recordOfNumbers(summaryRaw.byTechnique),
      byCategory: recordOfNumbers(summaryRaw.byCategory),
      byConditionType: recordOfNumbers(summaryRaw.byConditionType),
    },
  };
}

export function createQualityOutputProfile(expectedDraftCases: ExpectedDraftCase[] = []): StructuredOutputProfile<QualityRuntimeOutput> {
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(QualityRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      return !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && 'finalTestCases' in (raw as Record<string, unknown>);
    },
    normalize(raw: unknown): unknown {
      const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const expectedById = new Map(expectedDraftCases.map((draftCase) => [draftCase.id, draftCase]));
      const normalized: Record<string, unknown> = {
        finalTestCases: arrayFromRecordValues<unknown>(input.finalTestCases).map((testCase) => normalizeFinalTestCase(testCase, expectedById)),
      };
      // Preserve coverageMatrix if the LLM produced one
      if (input.coverageMatrix && typeof input.coverageMatrix === 'object') {
        normalized.coverageMatrix = normalizeCoverageMatrix(input.coverageMatrix as Record<string, unknown>);
      }
      return normalized;
    },
    parse(normalized: unknown): QualityRuntimeOutput {
      const parsed = validateDraftCaseCoverage(QualityRuntimeSchema.parse(normalized), expectedDraftCases);
      return validateAntiRedundancy(parsed);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        finalTestCases: 'Provide finalTestCases as a non-empty array of reviewed test cases, and preserve every input draft case id exactly once.',
        'finalTestCases.testLevel': 'Each final test case must declare testLevel as either "component" or "integration" (preserve from draft).',
        'finalTestCases.coveredConditions': 'Each final test case must list the Analyst conditionIds it covers.',
        'finalTestCases.referencedComponentConditions': 'Integration (testLevel="integration") cases MUST list at least one component condition they assume as a precondition.',
        'finalTestCases.tags': 'Use an array, not null, for tags.',
        'finalTestCases.changeLog': 'Use an array, not null, for changeLog.',
        coverageMatrix: 'coverageMatrix is REQUIRED: one row per Analyst condition, plus a summary object. F27.',
        'coverageMatrix.rows': 'Each row must reference a real Analyst conditionId and list coveredByCaseIds from finalTestCases.',
        'coverageMatrix.summary': 'Provide totalConditions, coveredConditions, missingConditions, byTestLevel, byTechnique, byCategory. byConditionType is optional but recommended.',
      });
    },
    extractionHints: [
      'Step atomicity (HARD constraint — schema validation will reject violations):',
      '- Each step must have exactly ONE action and ONE observable expected result.',
      '- `expected` must be ≤ 200 chars and contain NO semicolons separating multiple assertions.',
      '  WRONG: "button is disabled; error message appears" (two assertions)',
      '  RIGHT: split into two steps — step A expected "button is disabled", step B expected "error message appears".',
      '- `action` must be a single operation (no "and"/"then"/"with X/Y" bundling).',
    ].join('\n'),
  };
}

export const qualityOutputProfile: StructuredOutputProfile<QualityRuntimeOutput> = createQualityOutputProfile();

// ============================================================
// D1: Hybrid Coverage Matrix Reconciliation
// TS computes deterministic mapping fields (coveredByCaseIds,
// coverageStatus, summary), LLM provides assessment fields
// (notes, conditionSummary). This eliminates LLM mapping errors
// while preserving semantic evaluation.
// ============================================================

interface ReconcileCondition {
  id: string;
  requirementId: string;
  conditionType?: 'component' | 'flow';
  primaryTechnique?: string;
  category?: string;
  condition: string;
  flowStepRefs?: Array<{ flowId: string; sequence: number; actionSummary?: string }>;
}

export function reconcileCoverageMatrix(
  llmMatrix: QualityRuntimeOutput['coverageMatrix'],
  finalTestCases: QualityRuntimeOutput['finalTestCases'],
  conditions: ReconcileCondition[],
): QualityRuntimeOutput['coverageMatrix'] {
  if (!llmMatrix || !conditions.length) return llmMatrix;

  // Build conditionId → testCaseIds mapping from finalTestCases
  const caseIdsByCondition = new Map<string, string[]>();
  for (const tc of finalTestCases) {
    const allCondIds = new Set<string>();
    if (tc.conditionId) allCondIds.add(tc.conditionId);
    for (const cid of tc.coveredConditions ?? []) allCondIds.add(cid);
    for (const cid of allCondIds) {
      if (!caseIdsByCondition.has(cid)) caseIdsByCondition.set(cid, []);
      caseIdsByCondition.get(cid)!.push(tc.id);
    }
  }

  // Build LLM row lookup (for notes, conditionSummary, flowStepRef)
  const llmRowByCond = new Map<string, any>();
  for (const row of llmMatrix.rows ?? []) {
    llmRowByCond.set(row.conditionId, row);
  }

  // Reconcile each row
  const rows = conditions.map(cond => {
    const llmRow = llmRowByCond.get(cond.id);
    const coveredBy = caseIdsByCondition.get(cond.id) ?? [];
    const conditionType = cond.conditionType ?? (llmRow?.conditionType as 'component' | 'flow' | undefined);
    return {
      conditionId: cond.id,
      conditionSummary: llmRow?.conditionSummary ?? cond.condition.slice(0, 120),
      requirementId: cond.requirementId,
      testLevel: conditionType === 'flow' ? 'integration' : (llmRow?.testLevel ?? 'component'),
      primaryTechnique: cond.primaryTechnique ?? llmRow?.primaryTechnique ?? '',
      category: cond.category ?? llmRow?.category ?? '',
      conditionType,
      flowStepRef: llmRow?.flowStepRef ?? (cond.flowStepRefs?.[0]
        ? { flowId: cond.flowStepRefs[0].flowId, sequence: cond.flowStepRefs[0].sequence, actionSummary: cond.flowStepRefs[0].actionSummary }
        : undefined),
      coveredByCaseIds: coveredBy,
      coverageStatus: (coveredBy.length > 0 ? 'covered' : 'missing') as 'covered' | 'missing',
      notes: llmRow?.notes ?? '',
    };
  });

  // Recompute summary
  const byTestLevel: Record<string, number> = {};
  const byTechnique: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byConditionType: Record<string, number> = {};
  let covered = 0;
  for (const row of rows) {
    byTestLevel[row.testLevel] = (byTestLevel[row.testLevel] ?? 0) + 1;
    if (row.primaryTechnique) byTechnique[row.primaryTechnique] = (byTechnique[row.primaryTechnique] ?? 0) + 1;
    if (row.category) byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    if (row.conditionType) byConditionType[row.conditionType] = (byConditionType[row.conditionType] ?? 0) + 1;
    if (row.coverageStatus === 'covered') covered++;
  }

  return {
    rows,
    summary: {
      totalConditions: rows.length,
      coveredConditions: covered,
      missingConditions: rows.length - covered,
      byTestLevel,
      byTechnique,
      byCategory,
      byConditionType,
    },
  } as any;
}
