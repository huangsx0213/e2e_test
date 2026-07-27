import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';
import { validateRequirementDependencies, validateRequirementHumanId, validateRequirementFlowType, validateRequirementIsFlow, validateRelatedRequirementIds } from './validation.ts';
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
    validateRequirementHumanId(normalizedRecord, this.listByProject(normalizedRecord.projectId));
    validateRequirementFlowType(normalizedRecord);
    validateRequirementIsFlow(normalizedRecord);
    validateRelatedRequirementIds(normalizedRecord, this.listByProject(normalizedRecord.projectId));

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        dependencies = excluded.dependencies,
        level = excluded.level,
        status = excluded.status,
        position = excluded.position,
        human_id = excluded.human_id,
        flow_type = excluded.flow_type,
        type = excluded.type,
        is_flow = excluded.is_flow,
        related_requirement_ids = excluded.related_requirement_ids,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || existing?.projectId || '',
      record.parentId !== undefined ? (record.parentId || null) : (existing?.parentId || null),
      record.title || existing?.title || '',
      record.description ?? existing?.description ?? '',
      JSON.stringify(record.dependencies ?? existing?.dependencies ?? []),
      record.level || existing?.level || 'story',
      record.status || existing?.status || 'DRAFT',
      record.position ?? existing?.position ?? 0,
      record.humanId !== undefined ? (record.humanId || null) : (existing?.humanId || null),
      record.flowType !== undefined ? (record.flowType || null) : (existing?.flowType || null),
      record.type || existing?.type || 'functional',
      record.isFlow !== undefined ? (record.isFlow ? 1 : 0) : (existing?.isFlow ? 1 : 0),
      JSON.stringify(record.relatedRequirementIds ?? existing?.relatedRequirementIds ?? []),
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
      humanId: row.human_id || null,
      title: row.title,
      description: row.description,
      dependencies: JSON.parse(row.dependencies || '[]'),
      level: (row.level || 'story') as Requirement['level'],
      flowType: (row.flow_type as Requirement['flowType']) || null,
      status: row.status as Requirement['status'],
      type: ((row.type || 'functional') as Requirement['type']),
      position: row.position,
      isFlow: Boolean(row.is_flow),
      relatedRequirementIds: JSON.parse(row.related_requirement_ids || '[]'),
    };
  }
}

export const requirementRepo = new RequirementRepository();
