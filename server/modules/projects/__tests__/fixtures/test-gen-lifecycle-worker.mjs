import { parentPort, workerData } from 'node:worker_threads';

import Database from 'better-sqlite3';
import { tsImport } from 'tsx/esm/api';

const { TestGenRepository } = await tsImport(
  '../../../ai-test-gen/repository.ts',
  import.meta.url,
);
const database = new Database(workerData.filePath, { timeout: 5_000 });

try {
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  const repository = new TestGenRepository(database);
  parentPort.postMessage({ type: 'started' });
  repository.createRun('waiting-run', 'project-race', 'auto', {
    requirementIds: ['story-1'],
    mode: 'auto',
  });
  parentPort.postMessage({ type: 'result', outcome: { ok: true } });
} catch (error) {
  parentPort.postMessage({
    type: 'result',
    outcome: {
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      },
    },
  });
} finally {
  database.close();
}
