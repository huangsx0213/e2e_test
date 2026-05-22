import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';
import { validateRequirementDependencies } from './validation.ts';
import { regenerateIndexFile } from './index-generator.ts';

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
    const existing = this.get(id);
    db.prepare('DELETE FROM requirements WHERE id = ?').run(id);
    if (existing) { regenerateIndexFile(existing.projectId); }
  }

  get(id: string): Requirement | undefined {
    const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as DbRequirementRow | undefined;
    if (!row) return undefined;
    return this.rowToRequirement(row);
  }

  save(record: Partial<Requirement>): Requirement {
    const id = record.id || randomId('req');
    const existing = record.id ? this.get(record.id) : null;
    const normalizedRecord = {
      ...existing,
      ...record,
      id,
      projectId: record.projectId || existing?.projectId || '',
      dependencies: record.dependencies ?? existing?.dependencies ?? [],
    } as Requirement;

    validateRequirementDependencies(normalizedRecord, this.listByProject(normalizedRecord.projectId));

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, priority, status, tags, position, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        dependencies = excluded.dependencies,
        level = excluded.level,
        priority = excluded.priority,
        status = excluded.status,
        tags = excluded.tags,
        position = excluded.position,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || existing?.projectId || '',
      record.parentId !== undefined ? (record.parentId || null) : (existing?.parentId || null),
      record.title || existing?.title || '',
      record.description ?? existing?.description ?? '',
      JSON.stringify(record.dependencies ?? existing?.dependencies ?? []),
      record.level || existing?.level || 'story',
      record.priority || existing?.priority || 'MEDIUM',
      record.status || existing?.status || 'DRAFT',
      JSON.stringify(record.tags ?? existing?.tags ?? []),
      record.position ?? existing?.position ?? 0,
      JSON.stringify(record.metadata ?? existing?.metadata ?? {}),
    );

    const result = this.get(id)!;
    regenerateIndexFile(result.projectId);
    return result;
  }

  rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      description: row.description,
      dependencies: JSON.parse(row.dependencies || '[]'),
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
