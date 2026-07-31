import type { Requirement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbRequirementRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';
import { validateRequirementFlowType, validateRequirementIsFlow, validateRelatedRequirementIds } from './validation.ts';
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
    } as Requirement;

    validateRequirementFlowType(normalizedRecord);
    validateRequirementIsFlow(normalizedRecord);
    validateRelatedRequirementIds(normalizedRecord, this.listByProject(normalizedRecord.projectId));

    db.prepare(`
      INSERT INTO requirements (id, project_id, parent_id, title, description, level, status, position, flow_type, is_flow, related_requirement_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        level = excluded.level,
        status = excluded.status,
        position = excluded.position,
        flow_type = excluded.flow_type,
        is_flow = excluded.is_flow,
        related_requirement_ids = excluded.related_requirement_ids,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || existing?.projectId || '',
      record.parentId !== undefined ? (record.parentId || null) : (existing?.parentId || null),
      record.title || existing?.title || '',
      record.description ?? existing?.description ?? '',
      record.level || existing?.level || 'story',
      record.status || existing?.status || 'DRAFT',
      record.position ?? existing?.position ?? 0,
      record.flowType !== undefined ? (record.flowType || null) : (existing?.flowType || null),
      record.isFlow !== undefined ? (record.isFlow ? 1 : 0) : (existing?.isFlow ? 1 : 0),
      JSON.stringify(record.relatedRequirementIds ?? existing?.relatedRequirementIds ?? []),
    );

    const result = this.get(id)!;
    regenerateIndexFile(result.projectId);
    return result;
  }

  /** Update a requirement's primary key id with cascade updates for parentId
   *  and relatedRequirementIds references. Caller is responsible for validation
   *  (newId format + uniqueness) before invoking. */
  updateId(oldId: string, newId: string): void {
    const existing = this.get(oldId);
    if (!existing) throw new Error(`Requirement ${oldId} not found`);
    // 1. Update the row's own id.
    db.prepare('UPDATE requirements SET id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newId, oldId);
    // 2. Cascade parent_id on children.
    db.prepare('UPDATE requirements SET parent_id = ? WHERE parent_id = ?').run(newId, oldId);
    // 3. Cascade relatedRequirementIds references (stored as JSON array string).
    const allRows = db.prepare('SELECT id, related_requirement_ids FROM requirements').all() as { id: string; related_requirement_ids: string }[];
    for (const row of allRows) {
      if (!row.related_requirement_ids) continue;
      let arr: string[];
      try { arr = JSON.parse(row.related_requirement_ids); } catch { continue; }
      if (!Array.isArray(arr) || !arr.includes(oldId)) continue;
      const next = arr.map((v) => (v === oldId ? newId : v));
      db.prepare('UPDATE requirements SET related_requirement_ids = ? WHERE id = ?').run(JSON.stringify(next), row.id);
    }
    regenerateIndexFile(existing.projectId);
  }

  rowToRequirement(row: DbRequirementRow): Requirement {
    return {
      id: row.id,
      projectId: row.project_id,
      parentId: row.parent_id || undefined,
      title: row.title,
      description: row.description,
      level: (row.level || 'story') as Requirement['level'],
      flowType: (row.flow_type as Requirement['flowType']) || null,
      status: row.status as Requirement['status'],
      position: row.position,
      isFlow: Boolean(row.is_flow),
      relatedRequirementIds: JSON.parse(row.related_requirement_ids || '[]'),
    };
  }
}

export const requirementRepo = new RequirementRepository();
