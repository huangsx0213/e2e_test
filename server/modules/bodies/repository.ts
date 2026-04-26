import type { BodyTemplate } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import type { DbBodyDefaultValueRow, DbBodyRow } from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { normalizeBodyTemplate } from './mapper.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';

class BodyRepository extends BaseCrudRepository<BodyTemplate> {
  protected table = 'bodies';

  get(templateId: string): BodyTemplate | undefined {
    const base = db
      .prepare('SELECT id, project_id, name, description, content_type, content FROM bodies WHERE id = ?')
      .get(templateId) as DbBodyRow | undefined;
    if (!base) return undefined;

    const defaults = db
      .prepare('SELECT item_key, item_value FROM body_default_values WHERE body_id = ? ORDER BY position')
      .all(templateId) as DbBodyDefaultValueRow[];

    return {
      id: base.id,
      projectId: textFromDb(base.project_id),
      name: base.name,
      description: base.description,
      contentType: base.content_type as BodyTemplate['contentType'],
      content: base.content,
      defaultValues: Object.fromEntries(defaults.map((item) => [item.item_key, item.item_value])),
    };
  }

  save(templateInput: Partial<BodyTemplate>): BodyTemplate {
    const template = normalizeBodyTemplate(templateInput);

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO bodies (id, project_id, name, description, content_type, content)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           name = excluded.name,
           description = excluded.description,
           content_type = excluded.content_type,
           content = excluded.content`)
        .run(template.id, nullableText(template.projectId), template.name, template.description || '', template.contentType, template.content);

      db.prepare('DELETE FROM body_default_values WHERE body_id = ?').run(template.id);
      for (const [index, [key, value]] of Object.entries(template.defaultValues || {}).entries()) {
        db.prepare('INSERT INTO body_default_values (body_id, item_key, item_value, position) VALUES (?, ?, ?, ?)')
          .run(template.id, key, value, index);
      }
    });

    transaction();
    return this.get(template.id) || template;
  }
}

const _repo = new BodyRepository();

export const saveBodyTemplate = (input: Partial<BodyTemplate>) => _repo.save(input);
export const getBodyTemplate = (id: string) => _repo.get(id);
export const listBodyTemplates = () => _repo.list();
export const deleteBodyTemplate = (id: string) => _repo.remove(id);

export const bodyRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};