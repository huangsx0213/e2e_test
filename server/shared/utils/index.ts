import { randomUUID } from 'crypto';

export type WithId = { id: string };

export function randomId(prefix: string): string {
  const now = new Date();
  const ts = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `${prefix}-${ts}-${randomUUID().slice(0, 6)}`;
}

export function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asId(value: unknown, prefix: string): string {
  return typeof value === 'string' && value.length > 0 ? value : randomId(prefix);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, itemValue]) => [
      key,
      asText(itemValue),
    ]),
  );
}

export function nullableText(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

export function textFromDb(value: string | null): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
