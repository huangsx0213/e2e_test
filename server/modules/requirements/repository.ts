import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';

class RequirementRepository extends BaseCrudRepository<Requirement> {
  protected table = 'requirements';

  list(): Requirement[] {
    const rows = db.prepare('SELECT * FROM requirements ORDER BY position, rowid').all() as DbRequirementRow[];
    return rows.map(r => this.rowToRequirement(r));
  }

  listByProject(projectId: string): Requirement[] {
    const rows = db.prepare(
      'SELECT * FROM requirements WHERE project_id = ? ORDER BY position, rowid'
    ).all(projectId) as DbRequirementRow[];
    return rows.map(r => this.rowToRequirement(r));
  }

  remove(id: string): void {
    db.prepare('DELETE FROM requirements WHERE id = ?').run(id);
  }

  get(id: string): Requirement | undefined {
    const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as DbRequirementRow | undefined;
    if (!row) return undefined;
    return this.rowToRequirement(row);
  }

  save(record: Partial<Requirement>): Requirement {
    const id = record.id || randomId('req');

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, level, priority, status, tags, position, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        level = excluded.level,
        priority = excluded.priority,
        status = excluded.status,
        tags = excluded.tags,
        position = excluded.position,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || '',
      record.parentId || null,
      record.title || '',
      record.description || '',
      record.level || 'story',
      record.priority || 'MEDIUM',
      record.status || 'DRAFT',
      JSON.stringify(record.tags || []),
      record.position ?? 0,
      JSON.stringify(record.metadata || {}),
    );

    return this.get(id)!;
  }

  rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      description: row.description,
      level: (row.level || 'story') as Requirement['level'],
      priority: row.priority as Requirement['priority'],
      status: row.status as Requirement['status'],
      tags: JSON.parse(row.tags || '[]'),
      position: row.position,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

export const requirementRepo = new RequirementRepository();