import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  arrayFromRecordValues,
  coerceNumber,
  formatZodValidationError,
  nullToEmptyArray,
  nullToUndefined,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';

// F19: step atomicity hard constraint — keep `expected` to a single observable
// outcome. Bundled assertions (containing ";" + conjunction, or > 200 chars) are
// rejected because the LLM is supposed to split them into separate steps.
const atomicExpected = (value: string): true | string => {
  const v = String(value ?? '');
  if (v.length > 200) {
    return `expected must be a single observable outcome (<= 200 chars), got ${v.length} chars. Split into multiple steps.`;
  }
  // Reject multiple semicolon-separated assertions in a single expected.
  const segments = v.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    return `expected must contain a single assertion (found ${segments.length} semicolon-separated segments). Split into multiple steps.`;
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
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['finalTestCases'],
        message: `Missing final reviewed cases for draft case ids: ${missingIds.join(', ')}`,
        input: parsed,
      },
    ]);
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
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['finalTestCases'],
          message: `Final reviewed case ${testCase.id} has testLevel "${testCase.testLevel}" but the draft case was "${expected.expectedTestLevel}". Preserve the Designer's testLevel; fix the steps instead of flipping the level.`,
          input: testCase,
        },
      ]);
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
    const summary = flags
      .slice(0, 3)
      .map((f) => `${f.integrationCaseId} ↔ ${f.componentCaseId} (overlap=${f.overlap.toFixed(2)})`)
      .join('; ');
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['finalTestCases'],
        message: `Redundancy detected: integration cases re-assert behavior already covered by sibling component cases. Examples: ${summary}. Move the overlapping assertion into the integration case's referencedComponentConditions (precondition) and keep only cross-component assertions in steps. Log the de-duplication in changeLog with a 'redundancy' reason.`,
        input: parsed,
      },
    ]);
  }
  return parsed;
}

function normalizeFinalTestCase(
  value: unknown,
  expectedById?: Map<string, ExpectedDraftCase>,
): Record<string, unknown> {
  const tc = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const expected = expectedById?.get(String(tc.id ?? ''));
  const steps = Array.isArray(tc.steps)
    ? tc.steps.map((step) => {
        const normalizedStep = step && typeof step === 'object' ? step as Record<string, unknown> : {};
        return {
          ...normalizedStep,
          stepNumber: coerceNumber(normalizedStep.stepNumber, 1),
          action: String(normalizedStep.action ?? ''),
          expected: String(normalizedStep.expected ?? ''),
        };
      })
    : [];
  const changeLog = nullToEmptyArray(tc.changeLog as Record<string, unknown>[] | null | undefined)
    .map((change) => {
      const normalizedChange = change && typeof change === 'object' ? change as Record<string, unknown> : {};
      return {
        ...normalizedChange,
        from: nullToUndefined(normalizedChange.from as string | null | undefined),
        to: nullToUndefined(normalizedChange.to as string | null | undefined),
      };
    });

  const rawLevel = tc.testLevel;
  const testLevel = typeof rawLevel === 'string' ? rawLevel.toLowerCase() : rawLevel;

  return {
    ...tc,
    conditionId: expected?.conditionId ?? tc.conditionId,
    requirementId: expected?.requirementId ?? tc.requirementId,
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
  };
}

export const qualityOutputProfile: StructuredOutputProfile<QualityRuntimeOutput> = createQualityOutputProfile();
