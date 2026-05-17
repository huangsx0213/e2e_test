import type { TestCondition } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { randomId } from '../../shared/utils/index.ts';

type DbTestConditionRow = {
  id: string;
  project_id: string;
  requirement_id: string;
  condition: string;
  category: string;
  data_requirements: string | null;
  dependencies: string;
  risk_level: string;
  priority: string;
  primary_technique: string;
  secondary_techniques: string;
  technique_rationale: string;
  coverage_dimensions: string;
  status: string;
};

class TestConditionRepository extends BaseCrudRepository<TestCondition> {
  protected table = 'test_conditions';

  list(): TestCondition[] {
    const rows = db.prepare('SELECT id FROM test_conditions ORDER BY rowid').all() as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as TestCondition[];
  }

  remove(id: string): void {
    db.prepare('DELETE FROM test_conditions WHERE id = ?').run(id);
  }

  get(id: string): TestCondition | undefined {
    const row = db.prepare('SELECT * FROM test_conditions WHERE id = ?').get(id) as DbTestConditionRow | undefined;
    if (!row) return undefined;
    return this.rowToCondition(row);
  }

  save(record: Partial<TestCondition>): TestCondition {
    const id = record.id || randomId('tc');
    db.prepare(`
      INSERT INTO test_conditions (id, project_id, requirement_id, condition, category, data_requirements, dependencies, risk_level, priority, primary_technique, secondary_techniques, technique_rationale, coverage_dimensions, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        requirement_id = excluded.requirement_id,
        condition = excluded.condition,
        category = excluded.category,
        data_requirements = excluded.data_requirements,
        dependencies = excluded.dependencies,
        risk_level = excluded.risk_level,
        priority = excluded.priority,
        primary_technique = excluded.primary_technique,
        secondary_techniques = excluded.secondary_techniques,
        technique_rationale = excluded.technique_rationale,
        coverage_dimensions = excluded.coverage_dimensions,
        status = excluded.status
    `).run(
      id,
      '',
      record.requirementId || '',
      record.condition || '',
      record.category || 'happy-path',
      record.dataRequirements || null,
      JSON.stringify(record.dependencies || []),
      record.riskLevel || 'medium',
      record.priority || 'medium',
      record.primaryTechnique || '',
      JSON.stringify(record.secondaryTechniques || []),
      record.techniqueRationale || '',
      JSON.stringify(record.coverageDimensions || []),
      'DRAFT',
    );
    return this.get(id)!;
  }

  rowToCondition(row: DbTestConditionRow): TestCondition {
    return {
      id: row.id,
      requirementId: row.requirement_id,
      requirementLevel: 'story',
      condition: row.condition,
      category: row.category as TestCondition['category'],
      riskLevel: row.risk_level as TestCondition['riskLevel'],
      priority: row.priority as TestCondition['priority'],
      dataRequirements: row.data_requirements || undefined,
      dependencies: JSON.parse(row.dependencies || '[]'),
      primaryTechnique: row.primary_technique as TestCondition['primaryTechnique'],
      secondaryTechniques: JSON.parse(row.secondary_techniques || '[]'),
      techniqueRationale: row.technique_rationale,
      coverageDimensions: JSON.parse(row.coverage_dimensions || '[]'),
    };
  }
}

export const testConditionRepo = new TestConditionRepository();