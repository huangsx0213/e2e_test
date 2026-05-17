import { db } from '../../shared/db/client.ts';
import { DynamicVariable } from '../../../shared/contracts/index.ts';
import crypto from 'node:crypto';

export class DynamicVariableRepository {
  static list(): DynamicVariable[] {
    const rows = db.prepare(`
      SELECT id, project_id as projectId, name, expression, description, evaluation_strategy as evaluationStrategy, created_at as createdAt, updated_at as updatedAt
      FROM dynamic_variables
      ORDER BY project_id, name, created_at, id
    `).all() as any[];

    return rows.map(row => ({
      ...row,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt)
    }));
  }

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

  static save(data: Partial<DynamicVariable> & Pick<DynamicVariable, 'id' | 'projectId' | 'name' | 'expression'>): DynamicVariable {
    const existing = this.findById(data.id);
    const now = Date.now();
    const createdAt = existing?.createdAt ? Number(existing.createdAt) : now;

    db.prepare(`
      INSERT INTO dynamic_variables (id, project_id, name, expression, description, evaluation_strategy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        expression = excluded.expression,
        description = excluded.description,
        evaluation_strategy = excluded.evaluation_strategy,
        updated_at = excluded.updated_at
    `).run(
      data.id,
      data.projectId,
      data.name,
      data.expression,
      data.description || '',
      data.evaluationStrategy || 'EVERY_TIME',
      createdAt,
      now,
    );

    return this.findById(data.id)!;
  }

  static update(id: string, data: Partial<DynamicVariable>): DynamicVariable {
    const existing = this.findById(id);
    if (!existing) throw new Error(`DynamicVariable not found: ${id}`);

    const now = Date.now();
    const name = data.name !== undefined ? data.name : existing.name;
    const expression = data.expression !== undefined ? data.expression : existing.expression;
    const description = data.description !== undefined ? data.description : existing.description;
    const evaluationStrategy = data.evaluationStrategy !== undefined ? data.evaluationStrategy : existing.evaluationStrategy;

    db.prepare(`
      UPDATE dynamic_variables
      SET name = ?, expression = ?, description = ?, evaluation_strategy = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      expression,
      description || '',
      evaluationStrategy || 'EVERY_TIME',
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
  list: DynamicVariableRepository.list,
  findByProjectId: DynamicVariableRepository.findByProjectId,
  findById: DynamicVariableRepository.findById,
  create: DynamicVariableRepository.create,
  save: DynamicVariableRepository.save,
  update: DynamicVariableRepository.update,
  delete: DynamicVariableRepository.delete,
};
