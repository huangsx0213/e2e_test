import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
  nullToUndefined,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';
import type { RiskLevel } from '../../../../../shared/contracts/index.ts';

const CATEGORY_ENUM = ['functional', 'boundary', 'error', 'validation', 'integration'] as const;
const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const AnalystRuntimeSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string(),
    riskAssessmentSummary: z.string(),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    condition: z.string(),
    category: z.enum(CATEGORY_ENUM),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    riskLevel: z.enum(['critical', 'high', 'medium', 'low']),
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

function validatePriorityFloor(
  parsed: AnalystRuntimeOutput,
  priorityFloor: Map<string, RiskLevel> | undefined,
): AnalystRuntimeOutput {
  if (!priorityFloor || priorityFloor.size === 0) return parsed;

  for (const condition of parsed.testConditions) {
    const epicId = condition.requirementLevel === 'epic' ? condition.requirementId : condition.id.split('-')[0];
    const floor = priorityFloor.get(epicId);
    if (floor && PRIORITY_ORDER[condition.priority] < PRIORITY_ORDER[floor]) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['testConditions'],
          message: `Condition ${condition.id} priority '${condition.priority}' is below Architect's riskPriority floor '${floor}' for epic ${epicId}.`,
          input: condition,
        },
      ]);
    }
  }

  return parsed;
}

export function createAnalystOutputProfile(
  allowedReqIds: Set<string> = new Set(),
  priorityFloor?: Map<string, RiskLevel>,
): StructuredOutputProfile<AnalystRuntimeOutput> {
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
      let parsed = AnalystRuntimeSchema.parse(normalized);
      parsed = validateRequirementIds(parsed, allowedReqIds);
      parsed = validatePriorityFloor(parsed, priorityFloor);
      return parsed;
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        testConditions: 'Provide testConditions as an array with complete condition details.',
        'testConditions.category': 'Set category explicitly: functional, boundary, error, validation, or integration.',
        'testConditions.requirementId': 'Each condition must carry the source requirementId from the analyzed requirement.',
        'testConditions.dependencies': 'Use an array, not null, for dependencies.',
        'testConditions.dataRequirements': 'Omit dataRequirements or provide an array of strings.',
        'testConditions.priority': 'Set priority explicitly: critical, high, medium, or low.',
        'testConditions.riskLevel': 'Set riskLevel explicitly: critical, high, medium, or low.',
      });
    },
  };
}
