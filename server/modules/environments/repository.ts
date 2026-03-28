import { db } from '../../database.ts';
import { asText } from '../../utils.ts';

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

export const environmentRepository = {
  list: listEnvironments,
  create: createEnvironment,
  remove: deleteEnvironment,
};
