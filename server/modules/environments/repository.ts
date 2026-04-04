import { db } from '../../shared/db/client.ts';
import { asText } from '../../shared/utils/index.ts';

function normalizeEnvironmentPositions(): void {
  const rows = db.prepare(`
    SELECT rowid as row_id, name, position
    FROM environments
    ORDER BY COALESCE(position, 2147483647), rowid
  `).all() as Array<{ row_id: number; name: string; position: number | null }>;

  const update = db.prepare('UPDATE environments SET position = ? WHERE rowid = ?');
  const transaction = db.transaction(() => {
    rows.forEach((row, index) => {
      update.run(index, row.row_id);
    });
  });

  transaction();
}

function environmentCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM environments').get() as { count: number };
  return row.count;
}

export function listEnvironments(): string[] {
  const rows = db.prepare('SELECT name FROM environments ORDER BY position, rowid').all() as Array<{
    name: string;
  }>;

  return rows.map((row) => row.name);
}

export function createEnvironment(name: string): string {
  const environmentName = asText(name).trim().toUpperCase();
  if (!environmentName) {
    throw new Error('Environment name is required');
  }

  const currentCount = environmentCount();
  db.prepare('INSERT INTO environments (name, position) VALUES (?, ?)').run(
    environmentName,
    currentCount,
  );
  normalizeEnvironmentPositions();
  return environmentName;
}

export function deleteEnvironment(name: string): void {
  db.prepare('DELETE FROM environments WHERE name = ?').run(name);
  normalizeEnvironmentPositions();
}

export function getEnvironmentVariables(name: string): Record<string, string> {
  const row = db.prepare('SELECT variables FROM environments WHERE name = ?').get(name) as { variables: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.variables || '{}');
  } catch {
    return {};
  }
}

export function updateEnvironmentVariables(name: string, variables: Record<string, string>): void {
  db.prepare('UPDATE environments SET variables = ? WHERE name = ?').run(JSON.stringify(variables), name);
}

export const environmentRepository = {
  list: listEnvironments,
  create: createEnvironment,
  remove: deleteEnvironment,
  getVariables: getEnvironmentVariables,
  updateVariables: updateEnvironmentVariables,
};
