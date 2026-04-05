import type { ExecutionLog, ExecutionReport } from '../../shared/contracts/index.ts';
import { asArray, asId, asOptionalText, asText } from '../../shared/utils/index.ts';

function normalizeExecutionLog(input: Partial<ExecutionLog>): ExecutionLog {
  let metadata = input.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      metadata = undefined;
    }
  }

  return {
    stepId: asText(input.stepId),
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    status: asText(input.status, 'PENDING') as ExecutionLog['status'],
    level: asOptionalText(input.level) as any,
    message: asText(input.message),
    screenshot: asOptionalText(input.screenshot),
    metadata,
  };
}

export function normalizeExecutionReport(input: Partial<ExecutionReport>): ExecutionReport {
  return {
    id: asId(input.id, 'report'),
    suiteId: asText(input.suiteId),
    suiteName: asOptionalText(input.suiteName),
    environment: asOptionalText(input.environment),
    startTime: typeof input.startTime === 'number' ? input.startTime : Date.now(),
    endTime: typeof input.endTime === 'number' ? input.endTime : undefined,
    status: asText(input.status, 'RUNNING') as ExecutionReport['status'],
    passRate: typeof input.passRate === 'number' ? input.passRate : 0,
    totalCases: typeof input.totalCases === 'number' ? input.totalCases : undefined,
    passedCases: typeof input.passedCases === 'number' ? input.passedCases : undefined,
    failedCases: typeof input.failedCases === 'number' ? input.failedCases : undefined,
    logs: asArray<ExecutionLog>(input.logs).map((log) => normalizeExecutionLog(log)),
  };
}
