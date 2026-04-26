import type { HeaderProfile } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbHeaderItemRow, DbHeaderRow } from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { normalizeHeaderProfile } from './mapper.ts';

class HeaderRepository extends BaseCrudRepository<HeaderProfile> {
  protected table = 'headers';

  get(profileId: string): HeaderProfile | undefined {
    const base = db
      .prepare('SELECT id, project_id, name, description FROM headers WHERE id = ?')
      .get(profileId) as DbHeaderRow | undefined;
    if (!base) return undefined;

    const headers = db.prepare(
      'SELECT item_key, item_value, enabled FROM header_items WHERE header_id = ? ORDER BY position',
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

  save(profileInput: Partial<HeaderProfile>): HeaderProfile {
    const profile = normalizeHeaderProfile(profileInput);

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO headers (id, project_id, name, description)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           name = excluded.name,
           description = excluded.description`,
      ).run(profile.id, nullableText(profile.projectId), profile.name, profile.description || '');

      db.prepare('DELETE FROM header_items WHERE header_id = ?').run(profile.id);

      for (const [index, header] of profile.headers.entries()) {
        db.prepare(
          'INSERT INTO header_items (header_id, item_key, item_value, enabled, position) VALUES (?, ?, ?, ?, ?)',
        ).run(profile.id, header.key, header.value, header.enabled ? 1 : 0, index);
      }
    });

    transaction();
    return this.get(profile.id) || profile;
  }
}

const _repo = new HeaderRepository();

export const listHeaderProfiles = () => _repo.list();
export const getHeaderProfile = (id: string) => _repo.get(id);
export const saveHeaderProfile = (input: Partial<HeaderProfile>) => _repo.save(input);
export const deleteHeaderProfile = (id: string) => _repo.remove(id);

export const headerRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};