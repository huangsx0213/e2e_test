import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';
import type { DirectiveTestStrategy } from '../../../../../shared/contracts/index.ts';

const ArchitectRuntimeSchema = z.object({
  strategicGuidance: z.string(),
  sharedStatePresets: z.array(z.string()),
  crossReferenceMap: z.array(z.object({
    requirementId: z.string(),
    sharedByFlowIds: z.array(z.string()),
    coOccurringReqIds: z.array(z.string()),
    conflictRisk: z.enum(['high', 'low']),
  })),
  epicDirectives: z.array(z.object({
    epicId: z.string(),
    epicTitle: z.string(),
    riskPriority: z.enum(['critical', 'high', 'medium', 'low']),
    riskRationale: z.string(),
    recommendedTechniques: z.array(z.enum(['EP', 'BVA', 'Decision Table', 'State Transition', 'Use Case'])),
    coverageDirective: z.enum(['full', 'standard', 'skip']),
    focusAreas: z.array(z.string()),
  })),
  flowDirectives: z.array(z.object({
    flowId: z.string(),
    flowName: z.string(),
    integrationFocus: z.array(z.string()),
    sharedStateConcerns: z.array(z.string()),
    recommendedTechniques: z.array(z.enum(['Use Case', 'State Transition'])),
  })),
  anomalousFlowProposals: z.array(z.object({
    title: z.string(),
    trigger: z.string(),
    expectedBehavior: z.string(),
    riskLevel: z.enum(['critical', 'high', 'medium', 'low']),
    affectedRequirementIds: z.array(z.string()),
  })),
});

type ArchitectRuntimeOutput = z.infer<typeof ArchitectRuntimeSchema>;

export function createArchitectOutputProfile(): StructuredOutputProfile<ArchitectRuntimeOutput> {
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(ArchitectRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      return !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && 'strategicGuidance' in (raw as Record<string, unknown>);
    },
    normalize(raw: unknown): unknown {
      const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return {
        strategicGuidance: input.strategicGuidance ?? '',
        sharedStatePresets: nullToEmptyArray(input.sharedStatePresets as string[] | null | undefined),
        crossReferenceMap: nullToEmptyArray(input.crossReferenceMap as any[] | null | undefined),
        epicDirectives: nullToEmptyArray(input.epicDirectives as any[] | null | undefined),
        flowDirectives: nullToEmptyArray(input.flowDirectives as any[] | null | undefined),
        anomalousFlowProposals: nullToEmptyArray(input.anomalousFlowProposals as any[] | null | undefined),
      };
    },
    parse(normalized: unknown): ArchitectRuntimeOutput {
      return ArchitectRuntimeSchema.parse(normalized);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        strategicGuidance: 'Provide strategicGuidance as a 3-8 sentence directive paragraph describing cross-cutting test strategy.',
        sharedStatePresets: 'Provide sharedStatePresets as an array of strings — each item must appear in Designer preconditions.',
        crossReferenceMap: 'Provide crossReferenceMap as an array of {requirementId, sharedByFlowIds, coOccurringReqIds, conflictRisk}.',
        epicDirectives: 'Provide epicDirectives as an array of {epicId, epicTitle, riskPriority, riskRationale, recommendedTechniques, coverageDirective, focusAreas}.',
        flowDirectives: 'Provide flowDirectives as an array of {flowId, flowName, integrationFocus, sharedStateConcerns, recommendedTechniques}.',
        anomalousFlowProposals: 'Provide anomalousFlowProposals as an array of {title, trigger, expectedBehavior, riskLevel, affectedRequirementIds}.',
      });
    },
  };
}

export type { ArchitectRuntimeOutput };
export type { DirectiveTestStrategy };
