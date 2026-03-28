import type { Settings } from '../../../client/types';
import { db } from '../../database.ts';
import type { DbSettingsRow } from '../../db-types.ts';
import { normalizeSettings } from './settings.mapper.ts';

export function saveSettings(settingsInput: Partial<Settings>): Settings {
  const settings = normalizeSettings(settingsInput);

  db.prepare(
    `
      INSERT INTO settings (id, current_project_id, current_environment)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_project_id = excluded.current_project_id,
        current_environment = excluded.current_environment
    `,
  ).run(settings.id, settings.currentProjectId, settings.currentEnvironment);

  return getSettings(settings.id) || settings;
}

export function getSettings(settingsId: string): Settings | undefined {
  const row = db
    .prepare(
      'SELECT id, current_project_id, current_environment FROM settings WHERE id = ?',
    )
    .get(settingsId) as DbSettingsRow | undefined;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    currentProjectId: row.current_project_id,
    currentEnvironment: row.current_environment,
  };
}

export function listSettings(): Settings[] {
  const rows = db.prepare('SELECT id FROM settings ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getSettings(row.id))
    .filter((settings): settings is Settings => Boolean(settings));
}

export function deleteSettings(settingsId: string): void {
  db.prepare('DELETE FROM settings WHERE id = ?').run(settingsId);
}

export const settingsRepository = {
  list: listSettings,
  get: getSettings,
  save: saveSettings,
  remove: deleteSettings,
};
