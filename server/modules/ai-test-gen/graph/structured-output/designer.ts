import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  arrayFromRecordValues,
  formatZodValidationError,
  wrapSingleObjectInArray,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';

const DesignerRuntimeSchema = z.object({
  draftTestCases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    conditionId: z.string(),
    requirementId: z.string(),
    // F10: explicit list of Analyst condition ids this case covers.
    // Replaces the old single-string conditionId as the primary traceability field;
    // conditionId is kept as the "primary" condition for backward compat.
    coveredConditions: z.array(z.string()).default([]),
    // F11: for testLevel=integration cases, the component conditions this case assumes.
    // Validated at parse time (see validateFlowCaseReferences).
    referencedComponentConditions: z.array(z.string()).default([]),
    priority: z.string(),
    category: z.string(),
    testLevel: z.enum(['component', 'integration']),
    techniqueApplied: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(z.object({
      stepNumber: z.number(),
      // F18-action: step atomicity for the `action` field. Unlike `expected`
      // (which is auto-split in normalizeDraftTestCase), compound `action`
      // patterns are rejected at the schema level — the LLM gets a clear
      // rejection message and self-corrects in Phase 2 retry. This is the
      // source-level enforcement: splitting a compound ACTION correctly is
      // semantic (the LLM must decide how to decompose "Enter X while leaving
      // Y empty" into separate steps), so deterministic auto-fix is not viable.
      action: z.string().superRefine((val, ctx) => {
        const v = String(val ?? '').trim();
        if (v.length > 200) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `action must be a single operation (<= 200 chars), got ${v.length} chars. Split into multiple steps. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`,
          });
          return;
        }
        // High-precision compound-action signals drawn from observed LLM
        // violations. Each indicates 2+ actions bundled into one step.
        // "while" is narrowed to action-gerund patterns to avoid false positives
        // on state qualifiers like "while authenticated session is active".
        // NOTE: "both" is excluded from schema rejection — the LLM consistently
        // fails to self-correct it in Phase 2 (e.g. "Ensure both X and Y are
        // empty"). The rules doc and extractionHints still flag it as wrong.
        const compoundSignals: ReadonlyArray<readonly [RegExp, string]> = [
          [/\bwhile\s+(leaving|entering|typing|clicking|submitting|selecting|filling|pressing|choosing|checking|unchecking|ensuring|setting|clearing|providing|keeping|maintaining)\b/i, '"while <gerund>" (do X while doing Y)'],
          [/,\s*then\b/i, '", then" (sequential actions)'],
          [/\bbut\s+(leave|don.?t|do\s+not|without)\b/i, '"but leave/without" (contrast bundling)'],
        ];
        for (const [pattern, label] of compoundSignals) {
          if (pattern.test(v)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `action must contain a SINGLE operation — detected compound pattern ${label}. Split into multiple steps — one action per step. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`,
            });
          }
        }
      }),
      // F18: step atomicity — same constraint Quality enforces. Splitting
      // bundled assertions into multiple steps makes failures localizable
      // and is enforced at the earliest possible layer.
      expected: z.string().superRefine((val, ctx) => {
        const v = String(val ?? '');
        if (v.length > 200) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `expected must be a single observable outcome (<= 200 chars), got ${v.length} chars. Split into multiple steps. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`,
          });
          return;
        }
        const segments = v.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
        if (segments.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `expected must contain a single assertion (found ${segments.length} semicolon-separated segments). Split into multiple steps — one assertion per step. Value: "${v.slice(0, 80)}${v.length > 80 ? '...' : ''}"`,
          });
        }
      }),
    })).min(1),
    postconditions: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    selfReview: z.object({
      score: z.number().min(1).max(10),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      suggestions: z.array(z.string()),
    }),
  })).min(1),
});

type DesignerRuntimeOutput = z.infer<typeof DesignerRuntimeSchema>;

interface ConditionInfo {
  id: string;
  requirementId: string;
  expectedTestLevel?: 'component' | 'integration';
  conditionType?: 'component' | 'flow';
}

function validateConditionCoverage(
  parsed: DesignerRuntimeOutput,
  expectedConditions: ConditionInfo[],
): DesignerRuntimeOutput {
  if (expectedConditions.length === 0) return parsed;

  const coveredConditionIds = new Set<string>();
  for (const tc of parsed.draftTestCases) {
    if (tc.conditionId) coveredConditionIds.add(tc.conditionId);
    for (const cid of tc.coveredConditions ?? []) coveredConditionIds.add(cid);
  }
  const missingConditionIds = expectedConditions
    .filter((c) => !coveredConditionIds.has(c.id))
    .map((c) => c.id);

  if (missingConditionIds.length > 0) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['draftTestCases'],
        message: `Missing draft test cases for conditionIds: ${missingConditionIds.join(', ')}`,
        input: parsed,
      },
    ]);
  }

  const expectedByCondition = new Map(expectedConditions.map((c) => [c.id, c]));
  for (const testCase of parsed.draftTestCases) {
    const expected = expectedByCondition.get(testCase.conditionId);
    if (!expected) continue;
    if (testCase.requirementId !== expected.requirementId) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['draftTestCases'],
          message: `Draft test case ${testCase.id} has requirementId "${testCase.requirementId}" but condition ${testCase.conditionId} belongs to requirement "${expected.requirementId}"`,
          input: testCase,
        },
      ]);
    }
    if (expected.expectedTestLevel && testCase.testLevel !== expected.expectedTestLevel) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['draftTestCases'],
          message: `Draft test case ${testCase.id} has testLevel "${testCase.testLevel}" but condition ${testCase.conditionId} was tagged "${expected.expectedTestLevel}" by the Analyst. Honor the Analyst's tag.`,
          input: testCase,
        },
      ]);
    }
  }

  return parsed;
}

function wrapDesignerRoot(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const input = raw as Record<string, unknown>;
    if ('draftTestCases' in input) return input;
    if ('steps' in input || 'conditionId' in input || 'title' in input) {
      return { draftTestCases: wrapSingleObjectInArray(input) };
    }
  }
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
}

function normalizeDraftTestCase(
  value: unknown,
): Record<string, unknown> {
  const tc = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  // NOTE: No silent auto-fixes on purpose. This function previously renumbered
  // steps, lowercased `testLevel`, coerced `selfReview.score`, and force-filled
  // null arrays — all of which MASKED the LLM's actual mistakes and prevented
  // the schema from surfacing them. We now pass values through verbatim and let
  // the Zod schema be the single strict source of truth. Fix the model's
  // behavior at the source (see the Designer system prompt's "Strict schema
  // constraints" section) instead of patching its output after the fact.
  const steps = Array.isArray(tc.steps)
    ? tc.steps.map((step) => {
        const s = step && typeof step === 'object' ? step as Record<string, unknown> : {};
        return {
          stepNumber: s.stepNumber,
          action: s.action,
          expected: s.expected,
        };
      })
    : [];

  const selfReview = tc.selfReview && typeof tc.selfReview === 'object'
    ? tc.selfReview as Record<string, unknown>
    : {};

  return {
    ...tc,
    // Minimal type coercion only — ensure the two critical traceability ids are
    // strings (undefined -> "") so the schema receives a well-typed value. This
    // is NOT masking a semantic violation; a wrong/id-less id is still rejected
    // by validateConditionCoverage below.
    conditionId: String(tc.conditionId ?? ''),
    requirementId: String(tc.requirementId ?? ''),
    steps,
    selfReview: {
      score: selfReview.score,
      strengths: selfReview.strengths,
      weaknesses: selfReview.weaknesses,
      suggestions: selfReview.suggestions,
    },
  };
}

/**
 * F11 / F12 — Anti-redundancy hard check at the Designer layer.
 *
 * For every `testLevel: "integration"` case:
 * 1. `coveredConditions` MUST list at least one condition id (backfilled
 *    to `[conditionId]` if the LLM only provided the primary conditionId).
 * 2. `referencedComponentConditions` MUST be non-empty (the integration case
 *    must name which component conditions it assumes as preconditions).
 * 3. Each id in `referencedComponentConditions` must refer to a real
 *    condition in the expected set AND that condition must be of type
 *    `component` (integration cases cannot reference other flow conditions
 *    as their preconditions — that would be flow-on-flow, which is a
 *    different design pattern).
 */
function validateFlowCaseReferences(
  parsed: DesignerRuntimeOutput,
  expectedConditions: ConditionInfo[],
  externalComponentReferenceIds: string[],
): DesignerRuntimeOutput {
  if (expectedConditions.length === 0) return parsed;

  const byId = new Map(expectedConditions.map((c) => [c.id, c]));
  const externalComponentReferences = new Set(externalComponentReferenceIds);
  const log = Log.for('designer:auto-fix');

  for (const testCase of parsed.draftTestCases) {
    // Backfill coveredConditions: if the LLM forgot to list the primary
    // conditionId, do it for them so traceability is not lost.
    if (testCase.coveredConditions.length === 0 && testCase.conditionId) {
      testCase.coveredConditions = [testCase.conditionId];
    }

    if (testCase.testLevel !== 'integration') continue;

    // Auto-fix: the LLM frequently places flow-typed condition IDs in
    // referencedComponentConditions (intending "assumed already verified"),
    // but the schema only allows component-typed conditions there. Move any
    // flow-typed IDs to coveredConditions. This mirrors the analyst.ts
    // auto-fix philosophy: normalize during parse to prevent Phase 2 retries
    // that the LLM consistently fails to self-correct across all 3 attempts.
    const movedToCovered: string[] = [];
    const droppedUnknown: string[] = [];
    const validComponentRefs: string[] = [];
    for (const rawRefId of testCase.referencedComponentConditions) {
      // LLM sometimes writes compound references like
      // "component:req-aut-auth-session-happy:C-007" instead of just "C-007".
      // Try the raw value first (for cross-batch qualified refs), then fall
      // back to the last segment after ":" as the plain condition ID.
      const candidates = [rawRefId];
      if (rawRefId.includes(':')) {
        const lastSegment = rawRefId.split(':').pop()?.trim();
        if (lastSegment && lastSegment !== rawRefId) candidates.push(lastSegment);
      }

      let matchedId: string | null = null;
      let ref = null;
      for (const candidate of candidates) {
        if (externalComponentReferences.has(candidate)) { matchedId = candidate; break; }
        const found = byId.get(candidate);
        if (found) { matchedId = candidate; ref = found; break; }
      }

      if (!matchedId) {
        // Unknown id (e.g. LLM shorthand "I001" instead of the real condition
        // id). Drop it — the backfill below will supply real component
        // conditions if the array becomes empty. Auto-fix philosophy: normalize
        // during parse to prevent Phase 2 retries the LLM consistently fails
        // to self-correct across all 3 attempts.
        droppedUnknown.push(rawRefId);
        continue;
      }
      if (ref && ref.conditionType && ref.conditionType !== 'component') {
        movedToCovered.push(matchedId);
        if (!testCase.coveredConditions.includes(matchedId)) {
          testCase.coveredConditions.push(matchedId);
        }
      } else {
        validComponentRefs.push(matchedId);
      }
    }
    if (movedToCovered.length > 0 || droppedUnknown.length > 0) {
      testCase.referencedComponentConditions = validComponentRefs;
      if (movedToCovered.length > 0) {
        log.warn(`Auto-fixed ${testCase.id}: moved flow-typed condition(s) [${movedToCovered.join(', ')}] from referencedComponentConditions to coveredConditions`);
      }
      if (droppedUnknown.length > 0) {
        log.warn(`Auto-fixed ${testCase.id}: dropped unknown referencedComponentConditions reference(s) [${droppedUnknown.join(', ')}] (will backfill if empty)`);
      }
    }

    // Auto-populate: if referencedComponentConditions is empty after the
    // move (or was empty to begin with), backfill with component conditions
    // from the same requirement as the primary conditionId.
    if (testCase.referencedComponentConditions.length === 0) {
      const primaryCond = byId.get(testCase.conditionId);
      const reqId = primaryCond?.requirementId;
      if (reqId) {
        const sameReqComponentIds = expectedConditions
          .filter(c => c.conditionType === 'component' && c.requirementId === reqId)
          .map(c => c.id);
        if (sameReqComponentIds.length > 0) {
          testCase.referencedComponentConditions = sameReqComponentIds;
          log.warn(`Auto-fixed ${testCase.id}: backfilled referencedComponentConditions with same-requirement component conditions [${sameReqComponentIds.join(', ')}]`);
        }
      }
    }

    // F11: integration cases must declare at least one referenced component condition.
    if (testCase.referencedComponentConditions.length === 0) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['draftTestCases'],
          message: `Draft test case ${testCase.id} has testLevel="integration" but referencedComponentConditions is empty. Integration cases must explicitly list the component conditions they assume as preconditions (use coveredConditions to record which flow condition this case covers, referencedComponentConditions to record the component behaviors it depends on).`,
          input: testCase,
        },
      ]);
    }

    // F12: every referenced component condition must exist and be type=component.
    // After auto-fix, flow-typed IDs have already been moved to coveredConditions,
    // so only unknown IDs remain as errors here.
    for (const refId of testCase.referencedComponentConditions) {
      if (externalComponentReferences.has(refId)) continue;
      const ref = byId.get(refId);
      if (!ref) {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['draftTestCases'],
            message: `Draft test case ${testCase.id} references unknown condition "${refId}" in referencedComponentConditions. Reference must be a current-batch component condition id or an injected qualified component reference.`,
            input: testCase,
          },
        ]);
      }
      if (ref.conditionType && ref.conditionType !== 'component') {
        const componentConditionIds = expectedConditions
          .filter(c => c.conditionType === 'component')
          .map(c => c.id);
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['draftTestCases'],
            message: `Draft test case ${testCase.id} references condition "${refId}" of type "${ref.conditionType}" in referencedComponentConditions, but only component-typed conditions may be referenced as integration-case preconditions. FIX: (1) Remove "${refId}" from referencedComponentConditions and add it to coveredConditions instead. (2) Add one or more of these component-typed condition ids to referencedComponentConditions: [${componentConditionIds.join(', ')}].`,
            input: testCase,
          },
        ]);
      }
    }
  }

  return parsed;
}

export function createDesignerOutputProfile(
  expectedConditions: ConditionInfo[] = [],
  externalComponentReferenceIds: string[] = [],
): StructuredOutputProfile<DesignerRuntimeOutput> {
  const expectedReqByCondition = new Map(expectedConditions.map((c) => [c.id, c.requirementId]));
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(DesignerRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
      const obj = raw as Record<string, unknown>;
      // Accept the standard wrapper OR a bare single test case object.
      // wrapDesignerRoot (called in normalize) handles wrapping a bare
      // {id, title, conditionId, ...} into {draftTestCases: [...]}.
      return 'draftTestCases' in obj
        || 'conditionId' in obj
        || 'steps' in obj;
    },
    normalize(raw: unknown): unknown {
      const input = wrapDesignerRoot(raw);
      return {
        draftTestCases: arrayFromRecordValues<unknown>(input.draftTestCases).map(
          (tc) => normalizeDraftTestCase(tc, expectedReqByCondition),
        ),
      };
    },
    parse(normalized: unknown): DesignerRuntimeOutput {
      const parsed = validateConditionCoverage(DesignerRuntimeSchema.parse(normalized), expectedConditions);
      return validateFlowCaseReferences(parsed, expectedConditions, externalComponentReferenceIds);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        draftTestCases: 'Provide draftTestCases as a non-empty array of test cases and ensure every input conditionId is covered by at least one case.',
        'draftTestCases.testLevel': 'Each draft test case must declare testLevel as either "component" or "integration".',
        'draftTestCases.coveredConditions': 'Each draft test case must list the Analyst conditionIds it covers (use [conditionId] if unsure).',
        'draftTestCases.referencedComponentConditions': 'Integration (testLevel="integration") cases MUST list at least one component condition they assume as a precondition. Use PLAIN condition IDs only (e.g. "C-007"), NOT compound formats like "component:flowId:C-007" or "req-flow:C-007".',
        'draftTestCases.steps': 'Each draft test case needs a non-empty steps array.',
        'draftTestCases.steps.action': 'action must be a SINGLE operation (<= 200 chars). NO "while <gerund>", ", then", or "but leave/without" — these signal 2+ bundled actions and are schema-rejected. "both" (e.g. "Ensure both X and Y are empty") should also be split into separate steps per field/target.',
        'draftTestCases.preconditions': 'preconditions must be concrete, settable system states (data exists, page is loaded) — NOT behavior assertions ("validation works", "UI is functional"). Use referencedComponentConditions for behavior dependencies.',
        'draftTestCases.postconditions': 'Use an array, not null, for postconditions.',
        'draftTestCases.tags': 'Use an array, not null, for tags.',
      });
    },
    extractionHints: [
      'Step atomicity (HARD constraint — schema validation will reject violations):',
      '- Each step must have exactly ONE action and ONE observable expected result.',
      '- `action` must be a SINGLE operation (<= 200 chars). The schema REJECTS these compound signals:',
      '  "while" + gerund — WRONG: "Enter password while leaving username empty" → split: step 1 "Leave the username field empty", step 2 "Enter \'test123\' into the password field". (Note: "while" with a state qualifier like "while authenticated session is active" is OK — only "while" + action gerund is compound.)',
      '  ", then" — WRONG: "Enter username, then click submit" → split: step 1 "Enter username", step 2 "Click submit".',
      '  "but leave/without" — WRONG: "Enter a username but leave password empty" → split: step 1 "Enter username", step 2 "Leave the password field empty".',
      '  "both" — WRONG: "Ensure both username and password fields are empty" → split: step 1 "Ensure the username field is empty", step 2 "Ensure the password field is empty".',
      '- `expected` must be ≤ 200 chars and contain NO semicolons separating multiple assertions.',
      '  WRONG: "button is disabled; error message appears" (two assertions)',
      '  RIGHT: split into two steps — step A expected "button is disabled", step B expected "error message appears".',
      'Precondition quality (F12-precondition):',
      '- `preconditions` must be CONCRETE, settable system states — NOT behavior assertions.',
      '  WRONG: "Client-side validation passes (per C-005)" — this is a behavior, not a settable state.',
      '  RIGHT: "User account admin/admin123 exists in the user store" — this is a concrete data state.',
      '  WRONG: "Login page UI is functional (per C-001)" — vague behavior.',
      '  RIGHT: "Login page is loaded at /login with all form fields rendered" — concrete state.',
      '- Component behaviors the integration case assumes are declared via `referencedComponentConditions` ONLY — do NOT restate them in `preconditions`.',
    ].join('\n'),
  };
}

export const designerOutputProfile: StructuredOutputProfile<DesignerRuntimeOutput> = createDesignerOutputProfile();
