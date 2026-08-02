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
