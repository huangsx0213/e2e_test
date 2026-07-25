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
    priority: z.string(),
    category: z.string(),
    testLevel: z.enum(['component', 'integration']),
    techniqueApplied: z.string(),
    preconditions: z.array(z.string()),
    testData: z.array(z.string()),
    steps: z.array(z.object({
      stepNumber: z.number(),
      action: z.string(),
      expected: z.string(),
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

  const expectedReqByCondition = new Map(expectedConditions.map((c) => [c.id, c.requirementId]));
  for (const testCase of parsed.draftTestCases) {
    const expectedReqId = expectedReqByCondition.get(testCase.conditionId);
    if (expectedReqId && testCase.requirementId !== expectedReqId) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['draftTestCases'],
          message: `Draft test case ${testCase.id} has requirementId "${testCase.requirementId}" but condition ${testCase.conditionId} belongs to requirement "${expectedReqId}"`,
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

  const rawLevel = String(tc.testLevel ?? '').toLowerCase();
  const testLevel: 'component' | 'integration' = rawLevel === 'integration' ? 'integration' : 'component';

  return {
    ...tc,
    conditionId: String(tc.conditionId ?? ''),
    requirementId: expectedReqId ?? String(tc.requirementId ?? ''),
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
      return validateConditionCoverage(DesignerRuntimeSchema.parse(normalized), expectedConditions);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        draftTestCases: 'Provide draftTestCases as a non-empty array of test cases and ensure every input conditionId is covered by at least one case.',
        'draftTestCases.testLevel': 'Each draft test case must declare testLevel as either "component" or "integration".',
        'draftTestCases.steps': 'Each draft test case needs a non-empty steps array.',
        'draftTestCases.postconditions': 'Use an array, not null, for postconditions.',
        'draftTestCases.tags': 'Use an array, not null, for tags.',
      });
    },
  };
}

export const designerOutputProfile: StructuredOutputProfile<DesignerRuntimeOutput> = createDesignerOutputProfile();
