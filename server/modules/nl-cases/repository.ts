import type { NlTestCase } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { randomId } from '../../shared/utils/index.ts';

type DbNlCaseRow = {
  id: string;
  project_id: string;
  title: string;
  requirement_id: string | null;
  condition_id: string | null;
  technique_applied: string | null;
  priority: string;
  category: string | null;
  preconditions: string;
  test_data: string;
  steps: string;
  postconditions: string;
  tags: string;
  self_review: string | null;
  review_summary: string | null;
  change_log: string;
  status: string;
  generated_suite_id: string | null;
};

class NlCaseRepository extends BaseCrudRepository<NlTestCase> {
  protected table = 'natural_language_test_cases';

  list(): NlTestCase[] {
    const rows = db.prepare('SELECT id FROM natural_language_test_cases ORDER BY rowid').all() as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as NlTestCase[];
  }

  listByProject(projectId: string): NlTestCase[] {
    const rows = db.prepare(
      'SELECT id FROM natural_language_test_cases WHERE project_id = ? ORDER BY rowid'
    ).all(projectId) as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as NlTestCase[];
  }

  remove(id: string): void {
    db.prepare('DELETE FROM natural_language_test_cases WHERE id = ?').run(id);
  }

  get(id: string): NlTestCase | undefined {
    const row = db.prepare('SELECT * FROM natural_language_test_cases WHERE id = ?').get(id) as DbNlCaseRow | undefined;
    if (!row) return undefined;
    return this.rowToCase(row);
  }

  save(record: Partial<NlTestCase>): NlTestCase {
    const id = record.id || randomId('nlc');
    db.prepare(`
      INSERT INTO natural_language_test_cases (id, project_id, title, requirement_id, condition_id, technique_applied, priority, category, preconditions, test_data, steps, postconditions, tags, self_review, review_summary, change_log, status, generated_suite_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        requirement_id = excluded.requirement_id,
        condition_id = excluded.condition_id,
        technique_applied = excluded.technique_applied,
        priority = excluded.priority,
        category = excluded.category,
        preconditions = excluded.preconditions,
        test_data = excluded.test_data,
        steps = excluded.steps,
        postconditions = excluded.postconditions,
        tags = excluded.tags,
        self_review = excluded.self_review,
        review_summary = excluded.review_summary,
        change_log = excluded.change_log,
        status = excluded.status,
        generated_suite_id = excluded.generated_suite_id,
        updated_at = datetime('now')
    `).run(
      id,
      record.projectId || '',      record.title || '',
      record.requirementId || null,
      record.conditionId || null,
      record.techniqueApplied || null,
      record.priority || 'medium',
      record.category || null,
      JSON.stringify(record.preconditions || []),
      JSON.stringify(record.testData || []),
      JSON.stringify(record.steps || []),
      JSON.stringify(record.postconditions || []),
      JSON.stringify(record.tags || []),
      record.selfReview ? JSON.stringify(record.selfReview) : null,
      record.reviewSummary || null,
      JSON.stringify(record.changeLog || []),
      record.status || 'DRAFT',
      record.generatedSuiteId || null,
    );
    return this.get(id)!;
  }

  rowToCase(row: DbNlCaseRow): NlTestCase {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      requirementId: row.requirement_id || undefined,
      conditionId: row.condition_id || undefined,
      techniqueApplied: row.technique_applied || undefined,
      priority: row.priority as NlTestCase['priority'],
      category: row.category || undefined,
      preconditions: JSON.parse(row.preconditions || '[]'),
      testData: JSON.parse(row.test_data || '[]'),
      steps: JSON.parse(row.steps || '[]'),
      postconditions: JSON.parse(row.postconditions || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      selfReview: row.self_review ? JSON.parse(row.self_review) : undefined,
      reviewSummary: row.review_summary || undefined,
      changeLog: JSON.parse(row.change_log || '[]'),
      status: row.status as NlTestCase['status'],
      generatedSuiteId: row.generated_suite_id || undefined,
    };
  }
}

export const nlCaseRepo = new NlCaseRepository();