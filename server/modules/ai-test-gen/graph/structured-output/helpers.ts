export function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}

export function nullToEmptyArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function arrayFromRecordValues<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, T>);
  }
  return [];
}

export function wrapSingleObjectInArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return [value as T];
  return [];
}

export function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * F18 — Step atomicity: each step's `action` must describe ONE user-visible
 * operation, not a sequence of operations bundled together. AI-driven
 * execution (Stagehand / browser-use / agents) replays each step as a single
 * tool call, so a compound action either fails opaquely or requires fragile
 * parsing. Reject these patterns so the LLM must split them up:
 *
 *  - "Submit the form with admin/admin123" → two operations: enter data + submit
 *  - "Enter username and password" → two field inputs
 *  - "Click login then wait for dashboard" → two actions
 *  - "Fill in A, then B, then C" → three actions
 *
 * Returns `true` when atomic, or a human-readable reason when not.
 */
export function atomicAction(value: string): true | string {
  const v = String(value ?? '').trim();
  if (!v) return 'action must not be empty.';

  // Hard length cap mirrors the expected-field cap: any single action over
  // 250 chars is almost certainly bundling multiple operations.
  if (v.length > 250) {
    return `action must be a single operation (<= 250 chars), got ${v.length} chars. Split into multiple steps.`;
  }

  // Pattern 1: "with <slash-separated pair>" — the canonical bundling signal
  // the user reported. e.g. "Submit with admin/admin123", "POST with x/y".
  // A slash between two non-space tokens after "with" is almost always two
  // distinct field values being passed in a single step.
  if (/\bwith\s+\S+\/\S+/i.test(v)) {
    return 'action bundles a submit/click with data input via "with X/Y". Split into: (a) one step per data input, (b) one step for the submit/click. e.g. "Submit the login form with admin/admin123" → step 1 enter username "admin", step 2 enter password "admin123", step 3 click Sign in.';
  }

  // Pattern 2: "with <value> and <value>" — multiple data items being
  // supplied in the same step. e.g. "Login with admin and admin123".
  if (/\bwith\s+\S+\s+(?:and|&)\s+\S+/i.test(v)) {
    return 'action bundles multiple data inputs via "with X and Y". Split each input into its own step; the submit/click goes in a separate step.';
  }

  // Pattern 3: "fill in A and B" / "enter A and B" — two field operations
  // joined by "and". Each field must be its own step.
  if (/\b(?:fill\s+in|enter|type|input|set|provide|specify)\b[^.?!]*\b(?:and|&)\s+(?:fill|enter|type|input|set|provide|specify)\b/i.test(v)) {
    return 'action bundles two or more field-input operations ("X and enter Y"). Each field must be its own step.';
  }

  // Pattern 4: compound verbs joined by "and"/"then"/", then" — two
  // user-visible actions in a single step.
  // e.g. "Click login and verify dashboard", "Submit form, then wait for response"
  const actionVerbs = '(?:click|tap|press|select|choose|pick|check|uncheck|toggle|hover|focus|scroll|drag|drop|double-?click|right-?click|submit|send|save|delete|remove|add|create|update|close|open|navigate|go|wait|reload|refresh|verify|assert|confirm|inspect|check|observe|examine)';
  if (new RegExp(`\\b${actionVerbs}\\b[^.?!]*\\b(?:and|then|,)\\s+${actionVerbs}\\b`, 'i').test(v)) {
    return 'action bundles two operations joined by "and"/"then" (e.g. "click X then wait for Y"). Split each operation into its own step.';
  }

  return true;
}

/**
 * F19 — Step atomicity for the `expected` field. A single observable outcome
 * per step. This is the Quality-side mirror of atomicAction, kept as a
 * standalone helper for backward compatibility with quality.ts.
 */
export function atomicExpected(value: string): true | string {
  const v = String(value ?? '');
  if (v.length > 200) {
    return `expected must be a single observable outcome (<= 200 chars), got ${v.length} chars. Split into multiple steps.`;
  }
  const segments = v.split(/[;；]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    return `expected must contain a single assertion (found ${segments.length} semicolon-separated segments). Split into multiple steps.`;
  }
  return true;
}

export function formatZodValidationError(
  error: unknown,
  fieldHints: Record<string, string> = {},
): string {
  const issues = (error as { issues?: Array<{ path?: Array<string | number>; message?: string }> })?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return (error as Error)?.message || 'Schema validation failed.';
  }

  const details = issues.map((issue) => {
    const pathParts = Array.isArray(issue.path) ? issue.path : [];
    const path = pathParts.length > 0
      ? pathParts.join('.')
      : '(root)';
    const normalizedPath = pathParts
      .filter((part) => typeof part !== 'number')
      .join('.');
    const parentPaths = normalizedPath
      ? normalizedPath.split('.').map((_, index, all) => all.slice(0, all.length - index).join('.'))
      : [];
    const hint = [path, normalizedPath, ...parentPaths, path.split('.').slice(0, 1)[0] || '']
      .map((candidate) => fieldHints[candidate])
      .find(Boolean);
    return hint
      ? `- ${path}: ${issue.message}. ${hint}`
      : `- ${path}: ${issue.message}`;
  });
  return `Schema validation failed with ${issues.length} error(s):\n${details.join('\n')}`;
}
