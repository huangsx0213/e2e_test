import { db } from '../../shared/db/client.ts';
import { DynamicVariable } from '../../../shared/contracts/index.ts';
import crypto from 'node:crypto';

export class DynamicVariableRepository {
  static findByProjectId(projectId: string): DynamicVariable[] {
    const rows = db.prepare(`
      SELECT id, project_id as projectId, name, expression, description, evaluation_strategy as evaluationStrategy, created_at as createdAt, updated_at as updatedAt
      FROM dynamic_variables
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(projectId) as any[];

    return rows.map(row => ({
      ...row,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt)
    }));
  }

  static findById(id: string): DynamicVariable | undefined {
    const row = db.prepare(`
      SELECT id, project_id as projectId, name, expression, description, evaluation_strategy as evaluationStrategy, created_at as createdAt, updated_at as updatedAt
      FROM dynamic_variables
      WHERE id = ?
    `).get(id) as any;

    if (!row) return undefined;

    return {
      ...row,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt)
    };
  }

  static create(projectId: string, data: Partial<DynamicVariable>): DynamicVariable {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO dynamic_variables (id, project_id, name, expression, description, evaluation_strategy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      data.name,
      data.expression,
      data.description || '',
      data.evaluationStrategy || 'EVERY_TIME',
      now,
      now
    );

    return this.findById(id)!;
  }

  static update(id: string, data: Partial<DynamicVariable>): DynamicVariable {
    const now = Date.now();
    
    db.prepare(`
      UPDATE dynamic_variables
      SET name = ?, expression = ?, description = ?, evaluation_strategy = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.name,
      data.expression,
      data.description || '',
      data.evaluationStrategy || 'EVERY_TIME',
      now,
      id
    );

    return this.findById(id)!;
  }

  static delete(id: string): void {
    db.prepare('DELETE FROM dynamic_variables WHERE id = ?').run(id);
  }
}

export const dynamicVariableRepository = {
  findByProjectId: DynamicVariableRepository.findByProjectId,
  findById: DynamicVariableRepository.findById,
  create: DynamicVariableRepository.create,
  update: DynamicVariableRepository.update,
  delete: DynamicVariableRepository.delete,
};
