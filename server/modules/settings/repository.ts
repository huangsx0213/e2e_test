import type { Settings } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { normalizeSettings } from './mapper.ts';

const COLUMNS = 'id, current_project_id, current_environment, headless_mode, viewport_width, viewport_height, record_video';

class SettingsRepository extends BaseCrudRepository<Settings> {
  protected table = 'settings';

  get(settingsId: string): Settings | undefined {
    const row = db
      .prepare(`SELECT ${COLUMNS} FROM settings WHERE id = ?`)
      .get(settingsId) as any;
    if (!row) return undefined;

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

  save(settingsInput: Partial<Settings>): Settings {
    const settings = normalizeSettings(settingsInput);

    db.prepare(
      `INSERT INTO settings (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_project_id = excluded.current_project_id,
         current_environment = excluded.current_environment,
         headless_mode = excluded.headless_mode,
         viewport_width = excluded.viewport_width,
         viewport_height = excluded.viewport_height,
         record_video = excluded.record_video`,
    ).run(
      settings.id,
      settings.currentProjectId,
      settings.currentEnvironment,
      settings.headlessMode ? 1 : 0,
      settings.viewportWidth,
      settings.viewportHeight,
      settings.recordVideo !== false ? 1 : 0,
    );

    return this.get(settings.id) || settings;
  }
}

const _repo = new SettingsRepository();

export const listSettings = () => _repo.list();
export const getSettings = (id: string) => _repo.get(id);
export const saveSettings = (input: Partial<Settings>) => _repo.save(input);
export const deleteSettings = (id: string) => _repo.remove(id);

export const settingsRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};