/**
 * Variable interpolation engine.
 * Replaces all {{key}} patterns in a template string with values from the provided variables map.
 * Supports nested resolution (up to MAX_ITERATIONS) to allow variables referencing other variables.
 */

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
const MAX_ITERATIONS = 5;

export function interpolate(template: string, vars: Record<string, string>): string {
  if (!template) return '';

  let result = template;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const previous = result;
    result = result.replace(VARIABLE_PATTERN, (_, key) => {
      const trimmed = key.trim();
      return vars[trimmed] !== undefined ? vars[trimmed] : `{{${trimmed}}}`;
    });

    // No more substitutions occurred
    if (result === previous) break;
    iteration++;
  }

  return result;
}

/**
 * Checks whether a string contains any unresolved {{key}} placeholders.
 */
export function hasUnresolvedVars(str: string): boolean {
  if (!str) return false;
  return VARIABLE_PATTERN.test(str);
}

/**
 * Extracts all variable keys from a template string.
 * E.g. "Hello {{name}}, your id is {{id}}" => ["name", "id"]
 */
export function extractVarKeys(template: string): string[] {
  if (!template) return [];
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = re.exec(template)) !== null) {
    keys.push(match[1].trim());
  }
  return keys;
}
