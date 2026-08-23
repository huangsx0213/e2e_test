import { parentPort, workerData } from 'node:worker_threads';

import Database from 'better-sqlite3';
import { tsImport } from 'tsx/esm/api';

const { HtmlKnowledgeRepository } = await tsImport(
  '../../html-knowledge/repository.ts',
  import.meta.url,
);
const database = new Database(workerData.filePath, { timeout: 5_000 });

try {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  const repository = new HtmlKnowledgeRepository(database, { info: () => undefined });
  waitForPeer(workerData.gate);

  let value;
  if (workerData.operation === 'create') {
    value = repository.createSet(
      'project-1',
      [{ fileName: workerData.fileName, byteSize: 0 }],
    ).knowledgeSetId;
  } else if (workerData.operation === 'start') {
    value = repository.createOrReuseRun({
      projectId: 'project-1',
      setId: workerData.setId,
      candidateRunId: workerData.runId,
      buildRequirementSnapshot: () => JSON.parse(workerData.snapshotJson),
      createRun: (runId) => {
        database.prepare(`
          INSERT INTO test_gen_runs (id, project_id) VALUES (?, 'project-1')
        `).run(runId);
      },
    });
  } else {
    value = repository.bindReadySetToRun(
      'project-1',
      workerData.setId,
      workerData.runId,
      workerData.snapshotJson,
      workerData.snapshotHash,
    );
  }
  parentPort.postMessage({ ok: true, value });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      ...(hasErrorCode(error) ? { code: error.code } : {}),
    },
  });
} finally {
  database.close();
}

function waitForPeer(buffer) {
  const gate = new Int32Array(buffer);
  const previous = Atomics.add(gate, 0, 1);
  if (previous === 0) {
    const result = Atomics.wait(gate, 0, 1, 10_000);
    if (result === 'timed-out') throw new Error('Timed out waiting for concurrency peer');
  } else {
    Atomics.notify(gate, 0);
  }
}

function hasErrorCode(error) {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}
