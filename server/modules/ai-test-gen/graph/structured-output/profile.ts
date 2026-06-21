export interface StructuredOutputProfile<T> {
  toolSchema: Record<string, unknown>;
  normalize(raw: unknown): unknown;
  parse(normalized: unknown): T;
  formatValidationError(error: unknown): string;
  shouldAttemptPhase1Extraction?: (raw: unknown) => boolean;
}
