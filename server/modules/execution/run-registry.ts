import { ExecutionLogger } from './logger.ts';

const activeRuns = new Map<string, { id: string; abortController: AbortController; isLocal: boolean }>();
const loggerRegistry = new Map<string, ExecutionLogger>();

export function getActiveRunLogger(reportId: string): ExecutionLogger | undefined {
  return loggerRegistry.get(reportId);
}

export function setActiveRunLogger(reportId: string, logger: ExecutionLogger): void {
  loggerRegistry.set(reportId, logger);
}

export function removeActiveRunLogger(reportId: string): void {
  loggerRegistry.delete(reportId);
}

export function isRunActive(): boolean {
  for (const run of activeRuns.values()) {
    if (run.isLocal) return true;
  }
  return false;
}

export function registerRun(runId: string, run: { id: string; abortController: AbortController; isLocal: boolean }): void {
  activeRuns.set(runId, run);
}

export function unregisterRun(runId: string): void {
  activeRuns.delete(runId);
}

export function abortActiveRun(reportId?: string): boolean {
  let aborted = false;
  if (reportId) {
    for (const run of activeRuns.values()) {
      run.abortController.abort();
      aborted = true;
    }
  } else {
    for (const run of activeRuns.values()) {
      run.abortController.abort();
      aborted = true;
    }
  }
  return aborted;
}