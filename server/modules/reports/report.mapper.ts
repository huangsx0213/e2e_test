import type { ExecutionLog, ExecutionReport } from '../../../client/types';
import { asArray, asId, asOptionalText, asText } from '../../utils.ts';

function normalizeExecutionLog(input: Partial<ExecutionLog>): ExecutionLog {
  return {
    stepId: asText(input.stepId),
    timestamp: typeof input.timestamp === 'number' ? input.timestamp : Date.now(),
    status: asText(input.status, 'PENDING') as ExecutionLog['status'],
    message: asText(input.message),
    screenshot: asOptionalText(input.screenshot),
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
