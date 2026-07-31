import { serializeAC } from './graph/prompts.ts';

/**
 * Shape of the inputs needed to build the Analyst user prompt.
 * Kept separate from the Orchestrator's `buildBatchInputState` so this
 * transform is pure (no DB / repo calls) and unit-testable.
 */
export interface AnalystInputContext {
  epic: { id: string; title: string; description: string };
  /** Stories included in the current batch (component or flow stories). */
  currentBatch: any[];
  /** Map of flowId → referenced component stories. Used in flow mode only. */
  flowReferencedComponentContext?: Record<string, any[]>;
  generationMode: 'component' | 'flow' | 'mixed';
  /**
   * Business flow blueprints relevant to this batch. Each blueprint's `id`
   * is the exact value the LLM MUST use as `flowStepRefs[].flowId`. Without
   * this, the LLM hallucinates flow IDs (e.g. "FLOW-AUTH-SESSION") that don't
   * match the real blueprint IDs (which are AC IDs like "req-aut-auth-session-happy"),
   * causing validateFlowStepCoverage to auto-generate duplicate stub conditions.
   */
  flowBlueprints?: { id: string; name?: string; steps: { sequence: number; actionSummary?: string }[] }[];
}

/**
 * Build the pre-assembled JSON for the Analyst user message.
 *
 * Flow mode carries:
 *   - `referencedComponentContext` — flat deduplicated array of component stories
 *                                  with {id, title, acs:[{id,title}]}. Serves as
 *                                  the lookup for `relatedRequirementIds` so the
 *                                  Analyst can reference real condition IDs in
 *                                  `dependencies`.
 *
 * Component mode carries only `stories` (non-flow).
 */
export function buildAnalystInput(ctx: AnalystInputContext): Record<string, unknown> {
  const isFlowMode = ctx.generationMode === 'flow';
  const isMixedMode = ctx.generationMode === 'mixed';

  const stories = ctx.currentBatch
    .filter(r => isMixedMode ? true : (isFlowMode ? !!r.isFlow : !r.isFlow))
    .filter(r => r.level !== 'ac') // ACs are nested under their parent story; skip top-level duplicates
    .map(r => {
      const story: Record<string, unknown> = { id: r.id, title: r.title };
      if (r.description) story.description = r.description;
      const acs = (r.acceptanceCriteria ?? []).map(serializeAC);
      if (acs.length > 0) story.acs = acs;
      return story;
    });

  const analystInput: Record<string, unknown> = {
    epic: ctx.epic,
    stories,
    generationMode: ctx.generationMode,
  };

  // Include referencedComponentContext for flow and mixed modes.
  // In mixed mode, the flow stories' referenced component stories may be
  // in the SAME batch, so the LLM can cross-reference them directly.
  if (isFlowMode || isMixedMode) {
    // Inject compact flow blueprints so the LLM knows the exact `id` values
    // to use in `flowStepRefs[].flowId`. Without this, the LLM hallucinates
    // flow IDs that don't match the real blueprint IDs, causing the
    // validateFlowStepCoverage auto-fix to generate duplicate stub conditions.
    if (ctx.flowBlueprints && ctx.flowBlueprints.length > 0) {
      analystInput.flowBlueprints = ctx.flowBlueprints.map(bp => ({
        id: bp.id,
        name: bp.name,
        steps: bp.steps.map(s => ({
          sequence: s.sequence,
          actionSummary: s.actionSummary ?? '',
        })),
      }));
    }

    // Flatten referencedComponentContext from per-flow-keyed map to a
    // deduplicated array with only {id, title, acs:[{id,title}]}.
    if (ctx.flowReferencedComponentContext && Object.keys(ctx.flowReferencedComponentContext).length > 0) {
      const seen = new Set<string>();
      const flat: { id: string; title: string; acs: { id: string; title: string }[] }[] = [];
      for (const stories of Object.values(ctx.flowReferencedComponentContext)) {
        for (const s of stories) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          flat.push({
            id: s.id,
            title: s.title,
            acs: (s.acceptanceCriteria ?? []).map((ac: any) => ({ id: ac.id, title: ac.title })),
          });
        }
      }
      if (flat.length > 0) {
        analystInput.referencedComponentContext = flat;
      }
    }
  }

  return analystInput;
}
