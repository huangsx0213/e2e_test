import type { ExecutionLog, ExecutionReport } from '../../../client/types';
import { db } from '../../database.ts';
import type { DbReportLogRow, DbReportRow } from '../../db-types.ts';
import { nullableText, textFromDb } from '../../utils.ts';
import { normalizeExecutionReport } from './report.mapper.ts';

export function saveExecutionReport(reportInput: Partial<ExecutionReport>): ExecutionReport {
  const report = normalizeExecutionReport(reportInput);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO reports (
          id,
          suite_id,
          suite_name,
          environment,
          start_time,
          end_time,
          status,
          pass_rate,
          total_cases,
          passed_cases,
          failed_cases
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          failed_cases = excluded.failed_cases
      `,
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
        `
          INSERT INTO report_logs (report_id, step_id, timestamp, status, message, screenshot, position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        report.id,
        log.stepId,
        log.timestamp,
        log.status,
        log.message,
        nullableText(log.screenshot),
        index,
      );
    }
  });

  transaction();
  return getExecutionReport(report.id) || report;
}

export function getExecutionReport(reportId: string): ExecutionReport | undefined {
  const base = db
    .prepare(
      `
        SELECT id, suite_id, suite_name, environment, start_time, end_time, status, pass_rate, total_cases, passed_cases, failed_cases
        FROM reports
        WHERE id = ?
      `,
    )
    .get(reportId) as DbReportRow | undefined;

  if (!base) {
    return undefined;
  }

  const logs = db.prepare(
    `
      SELECT step_id, timestamp, status, message, screenshot
      FROM report_logs
      WHERE report_id = ?
      ORDER BY position
    `,
  ).all(reportId) as DbReportLogRow[];

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
    logs: logs.map((log) => ({
      stepId: log.step_id,
      timestamp: log.timestamp,
      status: log.status as ExecutionLog['status'],
      message: log.message,
      screenshot: textFromDb(log.screenshot),
    })),
  };
}

export function listExecutionReports(): ExecutionReport[] {
  const rows = db.prepare('SELECT id FROM reports ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getExecutionReport(row.id))
    .filter((report): report is ExecutionReport => Boolean(report));
}

export function deleteExecutionReport(reportId: string): void {
  db.prepare('DELETE FROM reports WHERE id = ?').run(reportId);
}

export const reportRepository = {
  list: listExecutionReports,
  get: getExecutionReport,
  save: saveExecutionReport,
  remove: deleteExecutionReport,
};
