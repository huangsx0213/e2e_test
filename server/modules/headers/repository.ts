import type { HeaderProfile } from '../../../client/types';
import { db } from '../../database.ts';
import type { DbHeaderItemRow, DbHeaderRow } from '../../db-types.ts';
import { nullableText, textFromDb } from '../../utils.ts';
import { normalizeHeaderProfile } from './header.mapper.ts';

export function saveHeaderProfile(profileInput: Partial<HeaderProfile>): HeaderProfile {
  const profile = normalizeHeaderProfile(profileInput);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO headers (id, project_id, name, description)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          description = excluded.description
      `,
    ).run(profile.id, nullableText(profile.projectId), profile.name, profile.description || '');

    db.prepare('DELETE FROM header_items WHERE header_id = ?').run(profile.id);

    for (const [index, header] of profile.headers.entries()) {
      db.prepare(
        `
          INSERT INTO header_items (header_id, item_key, item_value, enabled, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(profile.id, header.key, header.value, header.enabled ? 1 : 0, index);
    }
  });

  transaction();
  return getHeaderProfile(profile.id) || profile;
}

export function getHeaderProfile(profileId: string): HeaderProfile | undefined {
  const base = db
    .prepare('SELECT id, project_id, name, description FROM headers WHERE id = ?')
    .get(profileId) as DbHeaderRow | undefined;

  if (!base) {
    return undefined;
  }

  const headers = db.prepare(
    `
      SELECT item_key, item_value, enabled
      FROM header_items
      WHERE header_id = ?
      ORDER BY position
    `,
  ).all(profileId) as DbHeaderItemRow[];

  return {
    id: base.id,
    projectId: textFromDb(base.project_id),
    name: base.name,
    description: base.description,
    headers: headers.map((header) => ({
      key: header.item_key,
      value: header.item_value,
      enabled: Boolean(header.enabled),
    })),
  };
}

export function listHeaderProfiles(): HeaderProfile[] {
  const rows = db.prepare('SELECT id FROM headers ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getHeaderProfile(row.id))
    .filter((profile): profile is HeaderProfile => Boolean(profile));
}

export function deleteHeaderProfile(profileId: string): void {
  db.prepare('DELETE FROM headers WHERE id = ?').run(profileId);
}

export const headerRepository = {
  list: listHeaderProfiles,
  get: getHeaderProfile,
  save: saveHeaderProfile,
  remove: deleteHeaderProfile,
};
