import type { IExecutionLogger, ExecutionLogEvent, ExecutionProgressEvent } from '../shared/contracts/index.ts';

type SendFunction = (eventType: string, payload: any) => void;

export class AgentLogger implements IExecutionLogger {
  private reportId: string;
  private sendFn: SendFunction;
  private logPosition: number = 0;

  constructor(reportId: string, sendFn: SendFunction) {
    this.reportId = reportId;
    this.sendFn = sendFn;
  }

  log(event: Omit<ExecutionLogEvent, 'timestamp'>): void {
    const fullEvent: ExecutionLogEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // Forward the log back directly
    this.sendFn('LOG_STREAM', {
      reportId: this.reportId,
      position: this.logPosition++,
      log: fullEvent,
    });
  }

  progress(event: ExecutionProgressEvent): void {
    this.sendFn('PROGRESS_STREAM', {
      reportId: this.reportId,
      progress: event,
    });
  }

  complete(summary: { reportId: string; status: string; passRate: number }): void {
    this.sendFn('EXECUTION_COMPLETE', {
      reportId: summary.reportId,
      status: summary.status,
      passRate: summary.passRate,
    });
  }
}
