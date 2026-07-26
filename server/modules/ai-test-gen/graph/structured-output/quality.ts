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

const QualityRuntimeSchema = z.object({
  finalTestCases: z.preprocess(
    (value) => Array.isArray(value) ? value : [],
    z.array(z.object({
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
});

type QualityRuntimeOutput = z.infer<typeof QualityRuntimeSchema>;

interface ExpectedDraftCase {
  id: string;
  conditionId: string;
  requirementId: string;
  expectedTestLevel?: 'component' | 'integration';
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
    preconditions: nullToEmptyArray(tc.preconditions as string[] | null | undefined),
    testData: nullToEmptyArray(tc.testData as string[] | null | undefined),
    steps,
    tags: nullToEmptyArray(tc.tags as string[] | null | undefined),
    changeLog,
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
      return {
        finalTestCases: arrayFromRecordValues<unknown>(input.finalTestCases).map((testCase) => normalizeFinalTestCase(testCase, expectedById)),
      };
    },
    parse(normalized: unknown): QualityRuntimeOutput {
      return validateDraftCaseCoverage(QualityRuntimeSchema.parse(normalized), expectedDraftCases);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        finalTestCases: 'Provide finalTestCases as a non-empty array of reviewed test cases, and preserve every input draft case id exactly once.',
        'finalTestCases.testLevel': 'Each final test case must declare testLevel as either "component" or "integration" (preserve from draft).',
        'finalTestCases.tags': 'Use an array, not null, for tags.',
        'finalTestCases.changeLog': 'Use an array, not null, for changeLog.',
      });
    },
  };
}

export const qualityOutputProfile: StructuredOutputProfile<QualityRuntimeOutput> = createQualityOutputProfile();
