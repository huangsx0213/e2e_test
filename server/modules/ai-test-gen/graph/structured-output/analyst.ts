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

function validateRequirementIds(
  parsed: AnalystRuntimeOutput,
  allowedReqIds: Set<string>,
): AnalystRuntimeOutput {
  if (allowedReqIds.size === 0) return parsed;

  for (const condition of parsed.testConditions) {
    if (!allowedReqIds.has(condition.requirementId)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['testConditions'],
          message: `Condition ${condition.id} references requirement "${condition.requirementId}" which is not in the current batch. Conditions must only reference requirements from this batch.`,
          input: condition,
        },
      ]);
    }
  }

  return parsed;
}

function validateTestLevelTags(
  parsed: AnalystRuntimeOutput,
): AnalystRuntimeOutput {
  for (const condition of parsed.testConditions) {
    const testLevelTags = condition.coverageDimensions.filter(
      (d) => d === 'testLevel:component' || d === 'testLevel:integration',
    );
    if (testLevelTags.length !== 1) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['testConditions'],
          message: `Condition ${condition.id} must have exactly ONE testLevel tag in coverageDimensions (found ${testLevelTags.length}: [${testLevelTags.join(', ')}]). Use exactly one of "testLevel:component" or "testLevel:integration".`,
          input: condition,
        },
      ]);
    }
  }

  return parsed;
}

export function createAnalystOutputProfile(allowedReqIds: Set<string> = new Set()): StructuredOutputProfile<AnalystRuntimeOutput> {
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(AnalystRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      return !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && ('requirementAnalysis' in (raw as Record<string, unknown>) || 'testConditions' in (raw as Record<string, unknown>));
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
      const parsed = AnalystRuntimeSchema.parse(normalized);
      validateTestLevelTags(parsed);
      return validateRequirementIds(parsed, allowedReqIds);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        testConditions: 'Provide testConditions as an array with complete condition details.',
        'testConditions.category': 'Set category explicitly, for example functional, ui, api, boundary, edge, error, validation, or performance.',
        'testConditions.requirementId': 'Each condition must carry the source requirementId from the analyzed requirement.',
        'testConditions.coverageDimensions': 'coverageDimensions MUST include exactly ONE of "testLevel:component" or "testLevel:integration".',
        'testConditions.dependencies': 'Use an array, not null, for dependencies.',
        'testConditions.dataRequirements': 'Omit dataRequirements or provide an array of strings.',
      });
    },
  };
}
