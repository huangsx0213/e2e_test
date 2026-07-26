import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
  nullToUndefined,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';

const FlowStepRefSchema = z.object({
  flowId: z.string().min(1),
  flowName: z.string().optional(),
  sequence: z.number().int().nonnegative(),
  actionSummary: z.string().min(1),
});

const AnalystRuntimeSchema = z.object({
  requirementAnalysis: z.object({
    overallApproach: z.string(),
    riskAssessmentSummary: z.string(),
  }),
  testConditions: z.array(z.object({
    id: z.string(),
    requirementId: z.string(),
    condition: z.string(),
    // Type discriminator — replaces the legacy "testLevel:component"/"testLevel:integration"
    // string tag in coverageDimensions. Required.
    conditionType: z.enum(['component', 'flow']),
    // Required when conditionType === "flow". For "component" conditions, may be omitted.
    flowStepRefs: z.array(FlowStepRefSchema).optional(),
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

/**
 * F2: enforce that every condition declares exactly one conditionType and that
 * flow conditions are anchored to at least one flow step (F3).
 * Also enforces F23: primaryTechnique "Use Case Testing" implies conditionType "flow".
 */
function validateConditionTypes(
  parsed: AnalystRuntimeOutput,
): AnalystRuntimeOutput {
  for (const condition of parsed.testConditions) {
    if (!condition.conditionType || (condition.conditionType !== 'component' && condition.conditionType !== 'flow')) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['testConditions'],
          message: `Condition ${condition.id} is missing conditionType. Set it to "component" (atomic behavior from a requirement AC) or "flow" (cross-component interaction from a flow step).`,
          input: condition,
        },
      ]);
    }
    if (condition.conditionType === 'flow') {
      const refs = condition.flowStepRefs ?? [];
      if (refs.length === 0) {
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['testConditions'],
            message: `Condition ${condition.id} is type "flow" but has no flowStepRefs. A flow condition must reference at least one { flowId, sequence, actionSummary } so the Designer can trace the flow step it derives from.`,
            input: condition,
          },
        ]);
      }
    }
    // F23: Use Case Testing is a multi-step, cross-component technique — must be "flow".
    const primary = (condition.primaryTechnique ?? '').toLowerCase();
    if (primary.includes('use case') && condition.conditionType !== 'flow') {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['testConditions'],
          message: `Condition ${condition.id} uses Use Case Testing but conditionType is "${condition.conditionType}". Use Case Testing is a multi-step, cross-component technique; set conditionType to "flow".`,
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
              conditionType: typeof normalizedCondition.conditionType === 'string'
                ? normalizedCondition.conditionType.toLowerCase()
                : normalizedCondition.conditionType,
              flowStepRefs: Array.isArray(normalizedCondition.flowStepRefs)
                ? normalizedCondition.flowStepRefs
                : nullToUndefined(normalizedCondition.flowStepRefs as unknown[] | null | undefined),
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
      return validateRequirementIds(validateConditionTypes(parsed), allowedReqIds);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        testConditions: 'Provide testConditions as an array with complete condition details.',
        'testConditions.category': 'Set category explicitly, for example functional, ui, api, boundary, edge, error, validation, or performance.',
        'testConditions.requirementId': 'Each condition must carry the source requirementId from the analyzed requirement.',
        'testConditions.conditionType': 'Set conditionType to "component" (atomic behavior from a requirement AC) or "flow" (cross-component interaction from a flow step).',
        'testConditions.flowStepRefs': 'Flow conditions MUST include at least one { flowId, sequence, actionSummary } entry.',
        'testConditions.coverageDimensions': 'coverageDimensions is a free-form tag array; do NOT use "testLevel:*" tags anymore (use conditionType).',
        'testConditions.dependencies': 'Use an array, not null, for dependencies.',
        'testConditions.dataRequirements': 'Omit dataRequirements or provide an array of strings.',
      });
    },
  };
}
