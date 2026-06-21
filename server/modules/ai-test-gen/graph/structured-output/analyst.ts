import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
  nullToUndefined,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';

const AnalystRuntimeSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string(),
    riskAssessmentSummary: z.string(),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    condition: z.string(),
    category: z.string(),
    priority: z.string(),
    riskLevel: z.string(),
    primaryTechnique: z.string(),
    secondaryTechniques: z.array(z.string()),
    techniqueRationale: z.string(),
    coverageDimensions: z.array(z.string()),
    dataRequirements: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).default([]),
    requirementLevel: z.string().optional(),
  })),
});

type AnalystRuntimeOutput = z.infer<typeof AnalystRuntimeSchema>;

export const analystOutputProfile: StructuredOutputProfile<AnalystRuntimeOutput> = {
  toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(AnalystRuntimeSchema)),
  shouldAttemptPhase1Extraction(raw: unknown): boolean {
    return !!raw && typeof raw === 'object' && !Array.isArray(raw)
      && ('requirementAnalysis' in (raw as Record<string, unknown>) || 'testConditions' in (raw as Record<string, unknown>));
  },
  formatEmptySubmissionError() {
    return 'You submitted an empty object. Resubmit a COMPLETE object with this exact top-level shape: {"requirementAnalysis":{"overallApproach":"...","riskAssessmentSummary":"..."},"testConditions":[{"id":"C-001","requirementId":"REQ-001","condition":"...","category":"functional","priority":"high","riskLevel":"high","primaryTechnique":"...","secondaryTechniques":[],"techniqueRationale":"...","coverageDimensions":[],"dependencies":[]}]} Do not call output_result again until both requirementAnalysis and at least one fully populated testConditions object are ready.';
  },
  normalize(raw: unknown): unknown {
    const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const testConditions = Array.isArray(input.testConditions)
      ? input.testConditions.map((condition) => {
          const normalizedCondition = condition && typeof condition === 'object'
            ? condition as Record<string, unknown>
            : {};
          return {
            ...normalizedCondition,
            secondaryTechniques: nullToEmptyArray(normalizedCondition.secondaryTechniques as string[] | null | undefined),
            coverageDimensions: nullToEmptyArray(normalizedCondition.coverageDimensions as string[] | null | undefined),
            dataRequirements: nullToUndefined(normalizedCondition.dataRequirements as string[] | null | undefined),
            dependencies: nullToEmptyArray(normalizedCondition.dependencies as string[] | null | undefined),
            requirementLevel: nullToUndefined(normalizedCondition.requirementLevel as string | null | undefined),
          };
        })
      : [];

    return {
      requirementAnalysis: input.requirementAnalysis,
      testConditions,
    };
  },
  parse(normalized: unknown): AnalystRuntimeOutput {
    return AnalystRuntimeSchema.parse(normalized);
  },
  formatValidationError(error: unknown): string {
    return formatZodValidationError(error, {
      testConditions: 'Provide testConditions as an array with complete condition details.',
      'testConditions.category': 'Set category explicitly, for example functional, ui, api, boundary, edge, error, validation, or performance.',
      'testConditions.requirementId': 'Each condition must carry the source requirementId from the analyzed requirement.',
      'testConditions.dependencies': 'Use an array, not null, for dependencies.',
      'testConditions.dataRequirements': 'Omit dataRequirements or provide an array of strings.',
    });
  },
};
