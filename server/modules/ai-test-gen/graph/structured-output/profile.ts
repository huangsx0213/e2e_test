export interface StructuredOutputProfile<T> {
  toolSchema: Record<string, unknown>;
  normalize(raw: unknown): unknown;
  parse(normalized: unknown): T;
  formatValidationError(error: unknown): string;
  shouldAttemptPhase1Extraction?: (raw: unknown) => boolean;
  /**
   * Optional hints appended to the Phase 2 extraction prompt to remind the
   * LLM of constraints that cannot be expressed in JSON Schema alone (e.g.
   * step atomicity rules). When omitted, the extraction prompt only contains
   * the raw schema.
   */
  extractionHints?: string;
}
