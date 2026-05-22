import type { BusinessFlow } from '../../shared/contracts/index.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { db } from '../../shared/db/client.ts';
import type { DbBusinessFlowRow } from '../../shared/db/types.ts';
import { randomId } from '../../shared/utils/index.ts';

class BusinessFlowRepository extends BaseCrudRepository<BusinessFlow> {
  protected table = 'business_flows';

  listByProject(projectId: string): BusinessFlow[] {
    const rows = db.prepare(
      'SELECT * FROM business_flows WHERE project_id = ? ORDER BY rowid',
    ).all(projectId) as DbBusinessFlowRow[];
    return rows.map((row) => this.rowToBusinessFlow(row));
  }

  get(id: string): BusinessFlow | undefined {
    const row = db.prepare('SELECT * FROM business_flows WHERE id = ?').get(id) as DbBusinessFlowRow | undefined;
    if (!row) return undefined;
    return this.rowToBusinessFlow(row);
  }

  save(record: Partial<BusinessFlow>): BusinessFlow {
    const id = record.id || randomId('flow');
    const existing = record.id ? this.get(record.id) : null;

    db.prepare(`
      INSERT INTO business_flows (id, project_id, name, description, type, status, steps)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        description = excluded.description,
        type = excluded.type,
        status = excluded.status,
        steps = excluded.steps,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || existing?.projectId || '',
      record.name || existing?.name || '',
      record.description ?? existing?.description ?? '',
      record.type || existing?.type || 'happy-path',
      record.status || existing?.status || 'DRAFT',
      JSON.stringify(record.steps ?? existing?.steps ?? []),
    );

    return this.get(id)!;
  }

  private rowToBusinessFlow(row: DbBusinessFlowRow): BusinessFlow {
    const rawSteps: unknown[] = JSON.parse(row.steps || '[]');
    const steps = rawSteps.map((step) => {
      if (typeof step !== 'object' || step === null) return null;
      const s = step as Record<string, unknown>;
      let requirementIds: string[] = [];
      if (Array.isArray(s.requirementIds)) {
        requirementIds = s.requirementIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
      } else if (typeof s.requirementId === 'string' && s.requirementId.length > 0) {
        requirementIds = [s.requirementId];
      }
      if (typeof s.sequence !== 'number' || requirementIds.length === 0 || typeof s.actionSummary !== 'string') return null;
      return { sequence: s.sequence, requirementIds, actionSummary: s.actionSummary } as BusinessFlow['steps'][number];
    }).filter((s): s is BusinessFlow['steps'][number] => s !== null);

    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      type: row.type as BusinessFlow['type'],
      status: row.status as BusinessFlow['status'],
      steps,
    };
  }
}

export const businessFlowRepo = new BusinessFlowRepository();
