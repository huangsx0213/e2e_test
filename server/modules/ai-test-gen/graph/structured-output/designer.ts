import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  arrayFromRecordValues,
  coerceNumber,
  formatZodValidationError,
  nullToEmptyArray,
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
      action: z.string(),
      // F18: step atomicity — same constraint Quality enforces. Splitting
      // bundled assertions into multiple steps makes failures localizable
      // and is enforced at the earliest possible layer.
      expected: z.string().superRefine((val, ctx) => {
        const v = String(val ?? '');
        if (v.length > 200) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `expected must be a single observable outcome (<= 200 chars), got ${v.length} chars. Split into multiple steps.`,
          });
          return;
        }
        const segments = v.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
        if (segments.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `expected must contain a single assertion (found ${segments.length} semicolon-separated segments). Split into multiple steps.`,
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

  const coveredConditionIds = new Set(parsed.draftTestCases.map((testCase) => testCase.conditionId));
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
  expectedReqByCondition?: Map<string, string>,
): Record<string, unknown> {
  const tc = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const expectedReqId = expectedReqByCondition?.get(String(tc.conditionId ?? ''));
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
  const selfReview = tc.selfReview && typeof tc.selfReview === 'object'
    ? tc.selfReview as Record<string, unknown>
    : {};

  const rawLevel = tc.testLevel;
  const testLevel = typeof rawLevel === 'string' ? rawLevel.toLowerCase() : rawLevel;

  return {
    ...tc,
    conditionId: String(tc.conditionId ?? ''),
    requirementId: expectedReqId ?? String(tc.requirementId ?? ''),
    // F10 / F11: normalize the new traceability arrays. Empty / missing arrays
    // are preserved (validateFlowCaseReferences will backfill coveredConditions
    // and reject integration cases that lack component references).
    coveredConditions: nullToEmptyArray(tc.coveredConditions as string[] | null | undefined),
    referencedComponentConditions: nullToEmptyArray(tc.referencedComponentConditions as string[] | null | undefined),
    testLevel,
    preconditions: nullToEmptyArray(tc.preconditions as string[] | null | undefined),
    testData: nullToEmptyArray(tc.testData as string[] | null | undefined),
    steps,
    postconditions: nullToEmptyArray(tc.postconditions as string[] | null | undefined),
    tags: nullToEmptyArray(tc.tags as string[] | null | undefined),
    selfReview: {
      ...selfReview,
      score: coerceNumber(selfReview.score, 1),
      strengths: nullToEmptyArray(selfReview.strengths as string[] | null | undefined),
      suggestions: nullToEmptyArray(selfReview.suggestions as string[] | null | undefined),
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
): DesignerRuntimeOutput {
  if (expectedConditions.length === 0) return parsed;

  const byId = new Map(expectedConditions.map((c) => [c.id, c]));

  for (const testCase of parsed.draftTestCases) {
    // Backfill coveredConditions: if the LLM forgot to list the primary
    // conditionId, do it for them so traceability is not lost.
    if (testCase.coveredConditions.length === 0 && testCase.conditionId) {
      testCase.coveredConditions = [testCase.conditionId];
    }

    if (testCase.testLevel !== 'integration') continue;

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
    for (const refId of testCase.referencedComponentConditions) {
      const ref = byId.get(refId);
      if (!ref) {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['draftTestCases'],
            message: `Draft test case ${testCase.id} references unknown condition "${refId}" in referencedComponentConditions. Reference must be an id that appears in the Analyst's approved conditions.`,
            input: testCase,
          },
        ]);
      }
      if (ref.conditionType && ref.conditionType !== 'component') {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['draftTestCases'],
            message: `Draft test case ${testCase.id} references condition "${refId}" of type "${ref.conditionType}" in referencedComponentConditions, but only component-typed conditions may be referenced as integration-case preconditions.`,
            input: testCase,
          },
        ]);
      }
    }
  }

  return parsed;
}

export function createDesignerOutputProfile(expectedConditions: ConditionInfo[] = []): StructuredOutputProfile<DesignerRuntimeOutput> {
  const expectedReqByCondition = new Map(expectedConditions.map((c) => [c.id, c.requirementId]));
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(DesignerRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      return !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && 'draftTestCases' in (raw as Record<string, unknown>);
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
      return validateFlowCaseReferences(parsed, expectedConditions);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        draftTestCases: 'Provide draftTestCases as a non-empty array of test cases and ensure every input conditionId is covered by at least one case.',
        'draftTestCases.testLevel': 'Each draft test case must declare testLevel as either "component" or "integration".',
        'draftTestCases.coveredConditions': 'Each draft test case must list the Analyst conditionIds it covers (use [conditionId] if unsure).',
        'draftTestCases.referencedComponentConditions': 'Integration (testLevel="integration") cases MUST list at least one component condition they assume as a precondition.',
        'draftTestCases.steps': 'Each draft test case needs a non-empty steps array.',
        'draftTestCases.postconditions': 'Use an array, not null, for postconditions.',
        'draftTestCases.tags': 'Use an array, not null, for tags.',
      });
    },
  };
}

export const designerOutputProfile: StructuredOutputProfile<DesignerRuntimeOutput> = createDesignerOutputProfile();
