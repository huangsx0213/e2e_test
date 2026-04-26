import type { ExecutionLog, ExecutionReport } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type { DbReportLogRow, DbReportRow } from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { normalizeExecutionReport } from './mapper.ts';

class ReportRepository extends BaseCrudRepository<ExecutionReport> {
  protected table = 'reports';

  get(reportId: string): ExecutionReport | undefined {
    const base = db
      .prepare(
        `SELECT r.id, r.suite_id, r.suite_name, r.environment, r.start_time,
                r.end_time, r.status, r.pass_rate, r.total_cases, r.passed_cases,
                r.failed_cases, e.type as execution_type, e.plan_id
         FROM reports r
         LEFT JOIN execution_runs e ON r.id = e.report_id
         WHERE r.id = ?`,
      )
      .get(reportId) as (DbReportRow & { execution_type: string | null; plan_id: string | null }) | undefined;
    if (!base) return undefined;

    const logs = db.prepare(
      'SELECT step_id, timestamp, status, level, message, screenshot, metadata FROM report_logs WHERE report_id = ? ORDER BY position',
    ).all(reportId) as DbReportLogRow[];

    let planName: string | undefined;
    if (base.plan_id) {
      const planRow = db
        .prepare('SELECT name FROM test_plans WHERE id = ?')
        .get(base.plan_id) as { name: string } | undefined;
      planName = planRow?.name;
    }

    return {
      id: base.id,
      suiteId: base.suite_id,
      suiteName: textFromDb(base.suite_name),
      environment: textFromDb(base.environment),
      startTime: base.start_time,
      endTime: base.end_time ?? undefined,
      status: base.status as ExecutionReport['status'],
      passRate: base.pass_rate,
      totalCases: base.total_cases ?? undefined,
      passedCases: base.passed_cases ?? undefined,
      failedCases: base.failed_cases ?? undefined,
      executionType: base.execution_type ?? undefined,
      planId: base.plan_id ?? undefined,
      planName,
      logs: logs.map((log) => ({
        stepId: log.step_id,
        timestamp: log.timestamp,
        status: log.status as ExecutionLog['status'],
        level: log.level as any,
        message: log.message,
        screenshot: textFromDb(log.screenshot),
        metadata: log.metadata ? JSON.parse(log.metadata) : undefined,
      })),
    };
  }

  save(reportInput: Partial<ExecutionReport>): ExecutionReport {
    const report = normalizeExecutionReport(reportInput);

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO reports (
           id, suite_id, suite_name, environment, start_time, end_time,
           status, pass_rate, total_cases, passed_cases, failed_cases
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           suite_id = excluded.suite_id,
           suite_name = excluded.suite_name,
           environment = excluded.environment,
           start_time = excluded.start_time,
           end_time = excluded.end_time,
           status = excluded.status,
           pass_rate = excluded.pass_rate,
           total_cases = excluded.total_cases,
           passed_cases = excluded.passed_cases,
           failed_cases = excluded.failed_cases`,
      ).run(
        report.id,
        report.suiteId,
        nullableText(report.suiteName),
        nullableText(report.environment),
        report.startTime,
        report.endTime ?? null,
        report.status,
        report.passRate,
        report.totalCases ?? null,
        report.passedCases ?? null,
        report.failedCases ?? null,
      );

      db.prepare('DELETE FROM report_logs WHERE report_id = ?').run(report.id);

      for (const [index, log] of report.logs.entries()) {
        db.prepare(
          'INSERT INTO report_logs (report_id, step_id, timestamp, status, level, message, screenshot, metadata, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          report.id,
          log.stepId,
          log.timestamp,
          log.status,
          log.level || 'info',
          log.message,
          nullableText(log.screenshot),
          log.metadata ? JSON.stringify(log.metadata) : null,
          index,
        );
      }
    });

    transaction();
    return this.get(report.id) || report;
  }
}

const _repo = new ReportRepository();

export const listExecutionReports = () => _repo.list();
export const getExecutionReport = (id: string) => _repo.get(id);
export const saveExecutionReport = (input: Partial<ExecutionReport>) => _repo.save(input);
export const deleteExecutionReport = (id: string) => _repo.remove(id);

export const reportRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};