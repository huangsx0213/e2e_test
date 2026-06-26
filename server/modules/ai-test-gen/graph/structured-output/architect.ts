import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';
import type { GlobalTestBlueprint } from '../../../../../shared/contracts/index.ts';

const ArchitectRuntimeSchema = z.object({
  strategicGuidance: z.string(),
  riskEpicTree: z.array(z.object({
    epicId: z.string(),
    epicTitle: z.string(),
    riskLevel: z.enum(['high', 'medium', 'low']),
    notes: z.string(),
  })),
  anomalousFlowProposals: z.array(z.object({
    title: z.string(),
    trigger: z.string(),
    expectedBehavior: z.string(),
    riskLevel: z.enum(['high', 'medium', 'low']),
  })),
  sharedStateInferences: z.array(z.string()),
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
        riskEpicTree: nullToEmptyArray(input.riskEpicTree as any[] | null | undefined),
        anomalousFlowProposals: nullToEmptyArray(input.anomalousFlowProposals as any[] | null | undefined),
        sharedStateInferences: nullToEmptyArray(input.sharedStateInferences as string[] | null | undefined),
      };
    },
    parse(normalized: unknown): ArchitectRuntimeOutput {
      return ArchitectRuntimeSchema.parse(normalized);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        strategicGuidance: 'Provide strategicGuidance as a string describing cross-cutting test strategy.',
        riskEpicTree: 'Provide riskEpicTree as an array of {epicId, epicTitle, riskLevel, notes}.',
        anomalousFlowProposals: 'Provide anomalousFlowProposals as an array of {title, trigger, expectedBehavior, riskLevel}.',
        sharedStateInferences: 'Provide sharedStateInferences as an array of strings (e.g., auth, interceptors).',
      });
    },
  };
}

export type { ArchitectRuntimeOutput };
export type { GlobalTestBlueprint };
