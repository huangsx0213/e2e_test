import type { BodyTemplate } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import type { DbBodyDefaultValueRow, DbBodyRow } from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { normalizeBodyTemplate } from './mapper.ts';

export function saveBodyTemplate(templateInput: Partial<BodyTemplate>): BodyTemplate {
  const template = normalizeBodyTemplate(templateInput);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO bodies (id, project_id, name, description, content_type, content)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          description = excluded.description,
          content_type = excluded.content_type,
          content = excluded.content
      `,
    ).run(
      template.id,
      nullableText(template.projectId),
      template.name,
      template.description || '',
      template.contentType,
      template.content,
    );

    db.prepare('DELETE FROM body_default_values WHERE body_id = ?').run(template.id);

    for (const [index, [key, value]] of Object.entries(
      template.defaultValues || {},
    ).entries()) {
      db.prepare(
        `
          INSERT INTO body_default_values (body_id, item_key, item_value, position)
          VALUES (?, ?, ?, ?)
        `,
      ).run(template.id, key, value, index);
    }
  });

  transaction();
  return getBodyTemplate(template.id) || template;
}

export function getBodyTemplate(templateId: string): BodyTemplate | undefined {
  const base = db
    .prepare(
      'SELECT id, project_id, name, description, content_type, content FROM bodies WHERE id = ?',
    )
    .get(templateId) as DbBodyRow | undefined;

  if (!base) {
    return undefined;
  }

  const defaults = db.prepare(
    `
      SELECT item_key, item_value
      FROM body_default_values
      WHERE body_id = ?
      ORDER BY position
    `,
  ).all(templateId) as DbBodyDefaultValueRow[];

  return {
    id: base.id,
    projectId: textFromDb(base.project_id),
    name: base.name,
    description: base.description,
    contentType: base.content_type as BodyTemplate['contentType'],
    content: base.content,
    defaultValues: Object.fromEntries(
      defaults.map((item) => [item.item_key, item.item_value]),
    ),
  };
}

export function listBodyTemplates(): BodyTemplate[] {
  const rows = db.prepare('SELECT id FROM bodies ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getBodyTemplate(row.id))
    .filter((template): template is BodyTemplate => Boolean(template));
}

export function deleteBodyTemplate(templateId: string): void {
  db.prepare('DELETE FROM bodies WHERE id = ?').run(templateId);
}

export const bodyRepository = {
  list: listBodyTemplates,
  get: getBodyTemplate,
  save: saveBodyTemplate,
  remove: deleteBodyTemplate,
};
