import { z } from 'zod';
import { makeSchemaOpenAICompatible, zodToJsonSchema } from '../nodes/utils.ts';
import {
  formatZodValidationError,
  nullToEmptyArray,
} from './helpers.ts';
import type { StructuredOutputProfile } from './profile.ts';
import type { GlobalTestBlueprint, ContextBoundary } from '../../../../../shared/contracts/index.ts';

const ContextBoundarySchema = z.object({
  selectedEpicIds: z.array(z.string()),
  selectedFlowIds: z.array(z.string()),
  allEpicIds: z.array(z.string()),
  allFlowIds: z.array(z.string()),
  dependencyWarning: z.array(z.string()),
});

const ArchitectRuntimeSchema = z.object({
  contextBoundary: ContextBoundarySchema,
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
    routing: z.enum(['stage-1', 'stage-2', 'stage-3']).optional(),
  })),
  sharedStateInferences: z.array(z.string()),
});

type ArchitectRuntimeOutput = z.infer<typeof ArchitectRuntimeSchema>;

export function createArchitectOutputProfile(): StructuredOutputProfile<ArchitectRuntimeOutput> {
  return {
    toolSchema: makeSchemaOpenAICompatible(zodToJsonSchema(ArchitectRuntimeSchema)),
    shouldAttemptPhase1Extraction(raw: unknown): boolean {
      return !!raw && typeof raw === 'object' && !Array.isArray(raw)
        && 'contextBoundary' in (raw as Record<string, unknown>)
        && 'strategicGuidance' in (raw as Record<string, unknown>);
    },
    normalize(raw: unknown): unknown {
      const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const anomalousFlows = nullToEmptyArray(input.anomalousFlowProposals as any[] | null | undefined);
      const normalizedFlows = anomalousFlows.map((f: any) => ({
        ...f,
        routing: (f.routing as string) || 'stage-3',
      }));
      return {
        contextBoundary: {
          selectedEpicIds: nullToEmptyArray((input.contextBoundary as any)?.selectedEpicIds),
          selectedFlowIds: nullToEmptyArray((input.contextBoundary as any)?.selectedFlowIds),
          allEpicIds: nullToEmptyArray((input.contextBoundary as any)?.allEpicIds),
          allFlowIds: nullToEmptyArray((input.contextBoundary as any)?.allFlowIds),
          dependencyWarning: nullToEmptyArray((input.contextBoundary as any)?.dependencyWarning),
        },
        strategicGuidance: input.strategicGuidance ?? '',
        riskEpicTree: nullToEmptyArray(input.riskEpicTree as any[] | null | undefined),
        anomalousFlowProposals: normalizedFlows,
        sharedStateInferences: nullToEmptyArray(input.sharedStateInferences as string[] | null | undefined),
      };
    },
    parse(normalized: unknown): ArchitectRuntimeOutput {
      return ArchitectRuntimeSchema.parse(normalized);
    },
    formatValidationError(error: unknown): string {
      return formatZodValidationError(error, {
        contextBoundary: 'Provide contextBoundary with selectedEpicIds, selectedFlowIds, allEpicIds, allFlowIds, dependencyWarning.',
        strategicGuidance: 'Provide strategicGuidance as a string describing cross-cutting test strategy.',
        riskEpicTree: 'Provide riskEpicTree as an array of {epicId, epicTitle, riskLevel, notes}.',
        anomalousFlowProposals: 'Provide anomalousFlowProposals as an array of {title, trigger, expectedBehavior, riskLevel, routing}.',
        sharedStateInferences: 'Provide sharedStateInferences as an array of strings (e.g., auth, interceptors).',
      });
    },
  };
}

export type { ArchitectRuntimeOutput };
export type { GlobalTestBlueprint };
