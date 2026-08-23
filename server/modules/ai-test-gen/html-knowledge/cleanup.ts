import { Log } from '../../../shared/services/logger.ts';
import { HtmlKnowledgeService } from './service.ts';
import { HTML_KNOWLEDGE_CLEANUP_INTERVAL_MS } from './types.ts';

interface HtmlKnowledgeCleanupOptions {
  readonly service?: Pick<HtmlKnowledgeService, 'cleanupAbandonedSets'>;
  readonly now?: () => Date;
  readonly setIntervalFn?: (
    callback: () => void,
    intervalMs: number,
  ) => NodeJS.Timeout;
  readonly clearIntervalFn?: (timer: NodeJS.Timeout) => void;
}

export function startHtmlKnowledgeCleanup(
  options: HtmlKnowledgeCleanupOptions = {},
): { stop: () => void } {
  const service = options.service ?? new HtmlKnowledgeService();
  const now = options.now ?? (() => new Date());
  const setIntervalFn = options.setIntervalFn
    ?? ((callback: () => void, intervalMs: number) => setInterval(callback, intervalMs));
  const clearIntervalFn = options.clearIntervalFn
    ?? ((timer: NodeJS.Timeout) => clearInterval(timer));
  const log = Log.for('html-knowledge-cleanup');
  const cleanup = () => {
    try {
      const deletedCount = service.cleanupAbandonedSets(now());
      log.info(`Abandoned set cleanup completed: deletedCount=${deletedCount}`);
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      const code = getErrorCode(error);
      log.error(`Abandoned set cleanup failed: name=${name}, code=${code}`);
    }
  };

  cleanup();
  const timer = setIntervalFn(cleanup, HTML_KNOWLEDGE_CLEANUP_INTERVAL_MS);
  timer.unref();
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearIntervalFn(timer);
    },
  };
}

function getErrorCode(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'UNKNOWN';
}
