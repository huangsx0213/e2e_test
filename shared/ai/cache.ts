import { createHash } from 'node:crypto';
import { db } from '../../server/shared/db/client.ts';

const CACHE_TTL_HOURS = 24;

function buildKey(input: unknown, promptVersion: string, model: string): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(input) + promptVersion + model)
    .digest('hex');
  return `agent:cache:${hash}`;
}

export function getCached(input: unknown, promptVersion: string, model: string): unknown | null {
  const key = buildKey(input, promptVersion, model);
  const row = db.prepare(
    "SELECT output FROM agent_cache WHERE cache_key = ? AND expires_at > datetime('now')"
  ).get(key) as { output: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.output);
  } catch {
    return null;
  }
}

export function setCache(input: unknown, promptVersion: string, model: string, output: unknown): void {
  const key = buildKey(input, promptVersion, model);
  const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  db.prepare(`
    INSERT OR REPLACE INTO agent_cache (cache_key, input_hash, prompt_version, model, output, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+${CACHE_TTL_HOURS} hours'))
  `).run(key, inputHash, promptVersion, model, JSON.stringify(output));
}

export function invalidateCache(promptVersion?: string): void {
  if (promptVersion) {
    db.prepare('DELETE FROM agent_cache WHERE prompt_version = ?').run(promptVersion);
  } else {
    db.prepare('DELETE FROM agent_cache').run();
  }
}