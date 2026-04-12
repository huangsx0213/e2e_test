import type { Settings } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import type { DbSettingsRow } from '../../shared/db/types.ts';
import { normalizeSettings } from './mapper.ts';

export function saveSettings(settingsInput: Partial<Settings>): Settings {
  const settings = normalizeSettings(settingsInput);

  db.prepare(
    `
      INSERT INTO settings (id, current_project_id, current_environment, headless_mode, viewport_width, viewport_height, record_video)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_project_id = excluded.current_project_id,
        current_environment = excluded.current_environment,
        headless_mode = excluded.headless_mode,
        viewport_width = excluded.viewport_width,
        viewport_height = excluded.viewport_height,
        record_video = excluded.record_video
    `,
  ).run(
    settings.id,
    settings.currentProjectId,
    settings.currentEnvironment,
    settings.headlessMode ? 1 : 0,
    settings.viewportWidth,
    settings.viewportHeight,
    settings.recordVideo !== false ? 1 : 0,
  );

  return getSettings(settings.id) || settings;
}

export function getSettings(settingsId: string): Settings | undefined {
  const row = db
    .prepare(
      'SELECT id, current_project_id, current_environment, headless_mode, viewport_width, viewport_height, record_video FROM settings WHERE id = ?',
    )
    .get(settingsId) as any;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    currentProjectId: row.current_project_id,
    currentEnvironment: row.current_environment,
    headlessMode: row.headless_mode === 1,
    viewportWidth: row.viewport_width,
    viewportHeight: row.viewport_height,
    recordVideo: row.record_video !== 0,
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
