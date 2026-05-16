import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';

class RequirementRepository extends BaseCrudRepository<Requirement> {
  protected table = 'requirements';

  get(id: string): Requirement | undefined {
    const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as DbRequirementRow | undefined;
    if (!row) return undefined;
    return this.rowToRequirement(row);
  }

  save(record: Partial<Requirement>): Requirement {
    const id = record.id || randomId('req');

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, priority, risk_level, type, status, position, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        risk_level = excluded.risk_level,
        type = excluded.type,
        status = excluded.status,
        position = excluded.position,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || '',
      record.parentId || null,
      record.title || '',
      record.description || '',
      record.priority || 'MEDIUM',
      record.riskLevel || 'MEDIUM',
      record.type || 'functional',
      record.status || 'DRAFT',
      record.position ?? 0,
      JSON.stringify(record.metadata || {}),
    );

    return this.get(id)!;
  }

  listByProject(projectId: string): Requirement[] {
    const rows = db.prepare(
      'SELECT id FROM requirements WHERE project_id = ? ORDER BY position'
    ).all(projectId) as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as Requirement[];
  }

  private rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      description: row.description,
      priority: row.priority as Requirement['priority'],
      riskLevel: row.risk_level as Requirement['riskLevel'],
      type: row.type as Requirement['type'],
      status: row.status as Requirement['status'],
      position: row.position,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

export const requirementRepo = new RequirementRepository();