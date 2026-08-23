// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';
import { ConflictError } from '../../../shared/http/errors.ts';
import {
  MAX_HTML_PAGES,
  type HtmlKnowledgeReference,
} from '../../ai-test-gen/html-knowledge/types.ts';
import { TestGenRepository } from '../../ai-test-gen/repository.ts';
import { deleteProjectTestGenData } from '../../ai-test-gen/runtime.ts';
import { ProjectDeletionLock } from '../../ai-test-gen/project-deletion-lock.ts';
import { ContextBuilder } from '../../ai-test-gen/context.ts';
import { Orchestrator } from '../../ai-test-gen/orchestrator.ts';
import { RunCacheRegistry } from '../../ai-test-gen/run-cache-registry.ts';
import { SSEGateway } from '../../ai-test-gen/sse-gateway.ts';
import { CheckpointCorruptError } from '../../ai-test-gen/session.ts';

interface WorkerOutcome {
  ok: boolean;
  error?: { name: string; message: string };
}

function runCreateWorker(filePath: string): {
  started: Promise<void>;
  outcome: Promise<WorkerOutcome>;
} {
  const workerPath = fileURLToPath(new URL(
    './fixtures/test-gen-lifecycle-worker.mjs',
    import.meta.url,
  ));
  const worker = new Worker(workerPath, { workerData: { filePath } });
  let resolveStarted!: () => void;
  let rejectStarted!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  const outcome = new Promise<WorkerOutcome>((resolve, reject) => {
    worker.on('message', (message) => {
      if (message?.type === 'started') resolveStarted();
      if (message?.type === 'result') resolve(message.outcome);
    });
    worker.once('error', (error) => {
      rejectStarted(error);
      reject(error);
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        const error = new Error(`Lifecycle worker exited with code ${code}`);
        rejectStarted(error);
        reject(error);
      }
    });
  });
  return { started, outcome };
}

function makeDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE test_gen_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      phase TEXT NOT NULL DEFAULT 'analysis',
      current_batch INTEGER NOT NULL DEFAULT 0,
      total_batches INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'auto',
      state TEXT,
      config TEXT,
      token_usage TEXT,
      model_name TEXT,
      provider_config_name TEXT,
      created_by TEXT,
      provider_type TEXT,
      prompt_version TEXT,
      thread_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE test_gen_agent_logs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE test_gen_audit_log (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
  applyHtmlKnowledgeSchema(database);
  return database;
}

function seedProjectDeletionData(database: Database.Database): void {
  database.prepare(`
    INSERT INTO test_gen_runs (id, project_id) VALUES
      ('run-1', 'project-1'),
      ('run-2', 'project-1')
  `).run();
  database.prepare(`
    INSERT INTO test_gen_agent_logs (id, run_id) VALUES ('log-1', 'run-1')
  `).run();
  database.prepare(`
    INSERT INTO test_gen_html_knowledge_sets
      (id, project_id, run_id, status, page_count, total_bytes, page_graph,
       index_version, requirement_snapshot, requirement_snapshot_hash)
    VALUES ('bound-set', 'project-1', 'run-1', 'BOUND', 1, 10, '[]', 1,
            '{"version":1}', 'bound-hash')
  `).run();
  database.prepare(`
    INSERT INTO test_gen_html_knowledge_sets
      (id, project_id, status, page_count, total_bytes, page_graph, index_version)
    VALUES ('unbound-set', 'project-1', 'READY', 1, 10, '[]', 1)
  `).run();
}

const CHECKPOINT_TABLES = [
  'checkpoints',
  'writes',
  'checkpoint_writes',
  'checkpoint_blobs',
] as const;

function createCheckpointTables(database: Database.Database): void {
  for (const table of CHECKPOINT_TABLES) {
    database.exec(`CREATE TABLE ${table} (thread_id TEXT NOT NULL, payload TEXT)`);
  }
}

function seedCheckpointThreads(
  database: Database.Database,
  threadIds: readonly string[],
): void {
  for (const table of CHECKPOINT_TABLES) {
    const insert = database.prepare(`INSERT INTO ${table} (thread_id, payload) VALUES (?, ?)`);
    for (const threadId of threadIds) insert.run(threadId, `payload:${threadId}`);
  }
}

function deletionContext(activeRunIds: readonly string[]): ContextBuilder {
  const active = new Set(activeRunIds);
  return {
    beginDeletion: vi.fn((runId: string) => active.has(runId)),
    waitForQuiescence: vi.fn(async () => undefined),
    finishDeletion: vi.fn(),
  } as unknown as ContextBuilder;
}

describe('Test Gen deletion lifecycle', () => {
  let database: Database.Database;
  let repository: TestGenRepository;

  beforeEach(() => {
    database = makeDatabase();
    repository = new TestGenRepository(database);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
  });

  it('enumerates every project run without the 50-row history limit', () => {
    const insert = database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, created_at) VALUES (?, ?, ?)
    `);
    for (let index = 0; index < 75; index += 1) {
      insert.run(
        `run-${String(index).padStart(2, '0')}`,
        index === 74 ? 'project-2' : 'project-1',
        new Date(Date.UTC(2026, 7, 21, 0, 0, index)).toISOString(),
      );
    }

    const runIds = repository.listRunIdsByProject('project-1');

    expect(runIds).toHaveLength(74);
    expect(runIds[0]).toBe('run-00');
    expect(runIds.at(-1)).toBe('run-73');
    expect(runIds).not.toContain('run-74');
  });

  it('rolls back partial run deletion and then cascades the bound set and pages', () => {
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id) VALUES ('run-1', 'project-1')
    `).run();
    database.prepare(`
      INSERT INTO test_gen_agent_logs (id, run_id) VALUES ('log-1', 'run-1')
    `).run();
    database.prepare(`
      INSERT INTO test_gen_audit_log (id, run_id) VALUES ('audit-1', 'run-1')
    `).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, page_graph,
         index_version, requirement_snapshot, requirement_snapshot_hash)
      VALUES (
        'set-1', 'project-1', 'run-1', 'BOUND', 1, 12, '[]', 1,
        '{"version":1}', 'snapshot-hash'
      )
    `).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
         status, warnings)
      VALUES ('page-1', 'set-1', 'page.html', 'page.html', 12, 'READY', '[]')
    `).run();
    database.exec(`
      CREATE TRIGGER reject_run_delete
      BEFORE DELETE ON test_gen_runs
      BEGIN
        SELECT RAISE(ABORT, 'injected delete failure');
      END;
    `);

    expect(() => repository.deleteRun('run-1')).toThrow(/injected delete failure/i);
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_runs').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_agent_logs').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_audit_log').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get()).toEqual({ count: 1 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_pages').get()).toEqual({ count: 1 });

    database.exec('DROP TRIGGER reject_run_delete');
    repository.deleteRun('run-1');

    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_runs').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_agent_logs').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_audit_log').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_pages').get()).toEqual({ count: 0 });
  });

  it('deletes every exact run checkpoint thread without matching another run prefix', () => {
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id) VALUES
        ('run-1', 'project-1'),
        ('run-10', 'project-2')
    `).run();
    createCheckpointTables(database);
    seedCheckpointThreads(database, [
      'run-1-batch-0',
      'run-1-batch-epic-a-mixed-retry-123',
      'run-10-batch-0',
    ]);

    repository.deleteRun('run-1');

    for (const table of CHECKPOINT_TABLES) {
      expect(database.prepare(`SELECT thread_id FROM ${table} ORDER BY thread_id`).all())
        .toEqual([{ thread_id: 'run-10-batch-0' }]);
    }
  });

  it('replaces a cross-run stale checkpoint ID with a cleanup-safe current-run retry ID', async () => {
    database.prepare(`
      INSERT INTO test_gen_runs (
        id, project_id, status, phase, current_batch, total_batches, mode, config, thread_id
      ) VALUES (
        'run-current', 'project-1', 'FAILED', 'design', 1, 1, 'auto', ?,
        'run-foreign-batch-9'
      )
    `).run(JSON.stringify({ requirementIds: ['story-1'], mode: 'auto' }));
    createCheckpointTables(database);
    const startBatch = vi.fn(async (_batch: unknown, _threadId: string) => ({
      type: 'complete' as const,
      result: {
        batchIndex: 0,
        cases: [],
        tokenUsage: { input: 0, output: 0, total: 0 },
        lastState: { testConditions: [], finalTestCases: [] },
      },
    }));
    const contextBuilder = deletionContext([]);
    (contextBuilder as any).build = vi.fn(async () => ({
      scope: {
        currentBatch: 1,
        restoreBatchState: vi.fn(),
        markFailed: vi.fn(),
        markComplete: vi.fn(),
      },
      session: {
        retryFromLastCheckpoint: vi.fn(async () => {
          throw new CheckpointCorruptError('stale cross-run checkpoint');
        }),
        startBatch,
      },
      isAborted: () => false,
      sendEvent: vi.fn(),
      releaseSlot: vi.fn(),
    }));
    const orchestrator = new Orchestrator(
      new SSEGateway(),
      new RunCacheRegistry(),
      contextBuilder,
      repository,
    );
    const batchInput = {
      batchIndex: 0,
      inputState: { batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 } },
    };
    vi.spyOn(orchestrator as any, 'rebuildBatchInputForRetry').mockReturnValue(batchInput);

    await orchestrator.retry('run-current');

    const retryThreadId = startBatch.mock.calls[0][1] as string;
    expect(retryThreadId).toMatch(/^run-current-batch-1-retry-/u);
    expect(retryThreadId).not.toContain('run-foreign');
    seedCheckpointThreads(database, [retryThreadId, 'run-foreign-batch-9']);

    repository.deleteRun('run-current');

    for (const table of CHECKPOINT_TABLES) {
      expect(database.prepare(`SELECT thread_id FROM ${table}`).all())
        .toEqual([{ thread_id: 'run-foreign-batch-9' }]);
    }
  });

  it('marks an individually retained run recoverable FAILED when deletion fails and accepts retry', async () => {
    const coverageState = JSON.stringify([['story-covered', {
      requirementId: 'story-covered',
      conditionCount: 2,
      categories: ['functional'],
      techniques: ['EP'],
      caseCountByLevel: { component: 1, integration: 0 },
    }]]);
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, phase, state, config)
      VALUES ('run-delete-failure', 'project-1', 'design', ?, ?)
    `).run(coverageState, JSON.stringify({ requirementIds: ['story-1'], mode: 'auto' }));
    database.exec(`
      CREATE TRIGGER reject_individual_run_delete
      BEFORE DELETE ON test_gen_runs
      WHEN OLD.id = 'run-delete-failure'
      BEGIN
        SELECT RAISE(ABORT, 'SECRET_INDIVIDUAL_DELETE_FAILURE');
      END;
    `);
    const gateway = new SSEGateway();
    const events: Array<{ event: string; data: any }> = [];
    gateway.getEmitter('run-delete-failure').on('sse', (event, data) => {
      events.push({ event, data });
    });
    const contextBuilder = deletionContext(['run-delete-failure']);
    const orchestrator = new Orchestrator(
      gateway,
      new RunCacheRegistry(),
      contextBuilder,
      repository,
    );

    await expect(orchestrator.delete('run-delete-failure'))
      .rejects.toThrow(/SECRET_INDIVIDUAL_DELETE_FAILURE/u);

    const retained = repository.getFailedRun('run-delete-failure')!;
    expect(retained.status).toBe('FAILED');
    expect(retained.phase).toBe('design');
    expect(retained.state).toBe(coverageState);
    expect(events).toContainEqual({
      event: 'pipeline:error',
      data: {
        phase: 'deletion',
        message: 'Run deletion failed',
        recoverable: true,
      },
    });
    expect(JSON.stringify(events)).not.toContain('SECRET_INDIVIDUAL_DELETE_FAILURE');

    const startBatch = vi.fn(async () => ({
      type: 'complete' as const,
      result: {
        batchIndex: 0,
        cases: [],
        tokenUsage: { input: 0, output: 0, total: 0 },
        lastState: { testConditions: [], finalTestCases: [] },
      },
    }));
    (contextBuilder as any).build = vi.fn(async () => ({
      scope: {
        currentBatch: 0,
        restoreBatchState: vi.fn(),
        markFailed: vi.fn(),
        markComplete: vi.fn(),
      },
      session: { startBatch },
      isAborted: () => false,
      sendEvent: vi.fn(),
      releaseSlot: vi.fn(),
    }));
    const batchInput = {
      batchIndex: 0,
      inputState: { batchContext: { currentBatch: 1, totalBatches: 1, processedCount: 0 } },
    };
    vi.spyOn(orchestrator as any, 'rebuildBatchInputForRetry').mockReturnValue(batchInput);
    const restart = vi.spyOn(orchestrator, 'start');

    await orchestrator.retry('run-delete-failure');

    expect(restart).not.toHaveBeenCalled();
    expect(startBatch).toHaveBeenCalledWith(
      batchInput,
      expect.stringMatching(/^run-delete-failure-batch-1-retry-/u),
    );
  });

  it.each([
    ['COMPLETED', 'complete', '["completed-coverage"]'],
    ['WAITING_REVIEW', 'review', '["waiting-coverage"]'],
    ['FAILED', 'quality', '["failed-coverage"]'],
  ])('preserves inactive %s run state when individual deletion rolls back', async (
    status,
    phase,
    state,
  ) => {
    const runId = `inactive-${status.toLowerCase()}`;
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, phase, state)
      VALUES (?, 'project-1', ?, ?, ?)
    `).run(runId, status, phase, state);
    database.exec(`
      CREATE TRIGGER reject_inactive_run_delete
      BEFORE DELETE ON test_gen_runs
      WHEN OLD.id = '${runId}'
      BEGIN
        SELECT RAISE(ABORT, 'inactive delete failure');
      END;
    `);
    const gateway = new SSEGateway();
    const orchestrator = new Orchestrator(
      gateway,
      new RunCacheRegistry(),
      deletionContext([]),
      repository,
    );

    await expect(orchestrator.delete(runId)).rejects.toThrow(/inactive delete failure/i);

    expect(database.prepare(`
      SELECT status, phase, state FROM test_gen_runs WHERE id = ?
    `).get(runId)).toEqual({ status, phase, state });
  });

  it('blocks resume and retry preflight without mutating status or creating tombstones', () => {
    database.prepare(`
      INSERT INTO test_gen_runs
        (id, project_id, status, phase, state, thread_id, config)
      VALUES
        ('blocked-resume', 'project-1', 'WAITING_REVIEW', 'review', '["resume-state"]', 'thread-1', '{}'),
        ('blocked-retry', 'project-1', 'FAILED', 'quality', '["retry-state"]', NULL, '{}')
    `).run();
    const lock = new ProjectDeletionLock();
    const release = lock.acquire('project-1');
    const gateway = new SSEGateway();
    const contextBuilder = new ContextBuilder(gateway);
    const orchestrator = new Orchestrator(
      gateway,
      new RunCacheRegistry(),
      contextBuilder,
      repository,
      lock,
    );

    expect(() => orchestrator.assertCanResume('blocked-resume')).toThrow(ConflictError);
    expect(() => orchestrator.assertCanRetry('blocked-retry')).toThrow(ConflictError);

    expect(database.prepare(`
      SELECT id, status, phase, state
      FROM test_gen_runs WHERE id IN ('blocked-resume', 'blocked-retry') ORDER BY id
    `).all()).toEqual([
      { id: 'blocked-resume', status: 'WAITING_REVIEW', phase: 'review', state: '["resume-state"]' },
      { id: 'blocked-retry', status: 'FAILED', phase: 'quality', state: '["retry-state"]' },
    ]);
    expect(contextBuilder.isCancellationRequested('blocked-resume')).toBe(false);
    expect(contextBuilder.isCancellationRequested('blocked-retry')).toBe(false);
    release();
  });

  it('reports post-commit individual cleanup failure but resolves with the row deleted', async () => {
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id)
      VALUES ('post-commit-cleanup-run', 'project-1')
    `).run();
    const gateway = new SSEGateway();
    vi.spyOn(gateway, 'cleanup').mockImplementationOnce(() => {
      throw new Error('SECRET_POST_COMMIT_CLEANUP_FAILURE');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const orchestrator = new Orchestrator(
      gateway,
      new RunCacheRegistry(),
      deletionContext([]),
      repository,
    );

    await expect(orchestrator.delete('post-commit-cleanup-run')).resolves.toBeUndefined();

    expect(repository.getRun('post-commit-cleanup-run')).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      'SECRET_POST_COMMIT_CLEANUP_FAILURE',
    );
  });

  it('persists a typed recoverable context failure state', () => {
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id) VALUES ('failed-context', 'project-1')
    `).run();

    repository.markRunFailed('failed-context', {
      type: 'CONTEXT_SETUP_FAILED',
      phase: 'context',
      recoverable: true,
    });

    const row = database.prepare(`
      SELECT status, phase, state FROM test_gen_runs WHERE id = 'failed-context'
    `).get() as { status: string; phase: string; state: string };
    expect(row.status).toBe('FAILED');
    expect(row.phase).toBe('context');
    expect(JSON.parse(row.state)).toEqual({
      type: 'CONTEXT_SETUP_FAILED',
      phase: 'context',
      recoverable: true,
    });
  });

  it('maps only safe HTML knowledge configuration and metadata in list, active, and detail results', () => {
    const secret = 'SECRET_NORMALIZED_HTML_AND_INDEX';
    const requirementSnapshotHash = 'a'.repeat(64);
    const storedPageCount = MAX_HTML_PAGES + 2;
    const storedPageTitles = Array.from(
      { length: storedPageCount },
      (_, index) => `Page ${String(index).padStart(2, '0')}`,
    );
    database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, config)
      VALUES ('run-safe', 'project-1', 'RUNNING', ?)
    `).run(JSON.stringify({
      requirementIds: ['story-login'],
      providerConfigName: 'provider-1',
      mode: 'auto',
      htmlKnowledgeSetId: 'set-safe',
      normalized_html: secret,
      knowledge_index: secret,
      requirement_snapshot: secret,
    }));
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, page_graph,
         index_version, requirement_snapshot, requirement_snapshot_hash)
      VALUES ('set-safe', 'project-1', 'run-safe', 'BOUND', ?, ?, '[]', 1, ?, ?)
    `).run(storedPageCount, storedPageCount * 10, secret, requirementSnapshotHash);
    const insertPage = database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
         status, page_title, normalized_html, knowledge_index, information_level, warnings)
      VALUES (?, 'set-safe', ?, ?, 10, 'READY', ?, ?, ?, ?, '[]')
    `);
    storedPageTitles.forEach((title, index) => {
      const key = String(index).padStart(2, '0');
      insertPage.run(
        `page-${key}`,
        `page-${key}.html`,
        `page-${key}.html`,
        title,
        secret,
        secret,
        index === storedPageCount - 1 ? 'LOW_INFORMATION' : 'NORMAL',
      );
    });

    const responses = [
      repository.listRunsByProject('project-1'),
      repository.getActiveRun('project-1'),
      repository.getRunInfo('run-safe'),
    ];
    const serialized = JSON.stringify(responses);

    const expectedReference: HtmlKnowledgeReference = {
      knowledgeSetId: 'set-safe',
      pageCount: storedPageCount,
      totalBytes: storedPageCount * 10,
      pageTitles: storedPageTitles.slice(0, MAX_HTML_PAGES),
      hasLowInformationPages: true,
      requirementSnapshotHash,
    };
    expect(responses[0][0].htmlKnowledge).toEqual(expectedReference);
    expect(responses[1].htmlKnowledge).toEqual(expectedReference);
    expect(responses[2].htmlKnowledge).toEqual(expectedReference);
    expect(responses[0][0].config).toEqual({
      requirementIds: ['story-login'],
      providerConfigName: 'provider-1',
      mode: 'auto',
      htmlKnowledgeSetId: 'set-safe',
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(
      /normalized_html|knowledge_index|requirement_snapshot|requirement_snapshot_hash/iu,
    );
  });

  it('bulk-loads exact safe metadata for multiple history rows with three queries', () => {
    const insertRun = database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, config, created_at)
      VALUES (?, 'project-1', 'COMPLETED', ?, ?)
    `);
    const insertSet = database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, page_graph,
         index_version, requirement_snapshot, requirement_snapshot_hash)
      VALUES (?, 'project-1', ?, 'BOUND', 1, ?, '[]', 1, '{"version":1}', ?)
    `);
    const insertPage = database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size,
         status, page_title, information_level, warnings)
      VALUES (?, ?, ?, ?, 10, 'READY', ?, ?, '[]')
    `);
    const expected = new Map<string, HtmlKnowledgeReference>();
    for (let index = 0; index < 3; index += 1) {
      const runId = `bulk-run-${index}`;
      const setId = `bulk-set-${index}`;
      const title = `Bulk page ${index}`;
      const hash = String(index + 1).repeat(64);
      insertRun.run(
        runId,
        JSON.stringify({ mode: 'auto', htmlKnowledgeSetId: setId }),
        `2026-08-21T00:00:0${index}.000Z`,
      );
      insertSet.run(setId, runId, 10 + index, hash);
      insertPage.run(
        `bulk-page-${index}`,
        setId,
        `bulk-${index}.html`,
        `bulk-${index}.html`,
        title,
        index === 2 ? 'LOW_INFORMATION' : 'NORMAL',
      );
      expected.set(runId, {
        knowledgeSetId: setId,
        pageCount: 1,
        totalBytes: 10 + index,
        pageTitles: [title],
        hasLowInformationPages: index === 2,
        requirementSnapshotHash: hash,
      });
    }
    const prepare = vi.spyOn(database, 'prepare');

    const runs = repository.listRunsByProject('project-1');

    expect(prepare).toHaveBeenCalledTimes(3);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.htmlKnowledge).toEqual(expected.get(run.id));
    }
  });

  it('locks starts, waits all runs, then atomically deletes runs, sets, and project', async () => {
    seedProjectDeletionData(database);
    createCheckpointTables(database);
    seedCheckpointThreads(database, [
      'run-1-batch-0',
      'run-1-batch-epic-a-mixed-retry-123',
      'run-2-batch-0',
      'other-run-batch-0',
    ]);
    const order: string[] = [];
    let releaseWait!: () => void;
    const wait = new Promise<void>((resolve) => {
      releaseWait = resolve;
    });
    const orchestrator = {
      abortAndWaitForDeletion: vi.fn(async (runId: string) => {
        order.push(`wait:${runId}`);
        await wait;
        return { wasActive: false };
      }),
      completeDeletion: vi.fn((runId: string) => order.push(`complete:${runId}`)),
      cancelDeletion: vi.fn(),
      failDeletion: vi.fn(),
    };
    const lock = new ProjectDeletionLock();

    const deleting = deleteProjectTestGenData('project-1', {
      runRepository: repository,
      orchestrator,
      deletionLock: lock,
    });
    await Promise.resolve();

    expect(lock.isLocked('project-1')).toBe(true);
    expect(() => lock.assertStartAllowed('project-1')).toThrow(ConflictError);
    expect(database.prepare(`SELECT id FROM projects WHERE id = 'project-1'`).get())
      .toEqual({ id: 'project-1' });

    releaseWait();
    await deleting;

    expect(order).toEqual([
      'wait:run-1',
      'wait:run-2',
      'complete:run-1',
      'complete:run-2',
    ]);
    expect(lock.isLocked('project-1')).toBe(false);
    expect(database.prepare(`SELECT id FROM projects WHERE id = 'project-1'`).get())
      .toBeUndefined();
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_runs`).get())
      .toEqual({ count: 0 });
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets`).get())
      .toEqual({ count: 0 });
    for (const table of CHECKPOINT_TABLES) {
      expect(database.prepare(`SELECT thread_id FROM ${table}`).all())
        .toEqual([{ thread_id: 'other-run-batch-0' }]);
    }
  });

  it('completes every run after commit and reports cleanup failures without failing deletion', async () => {
    seedProjectDeletionData(database);
    const cleanupCalls: string[] = [];
    const cleanupError = new Error('post-commit SSE cleanup failed');
    const reportCleanupFailure = vi.fn();
    const orchestrator = {
      abortAndWaitForDeletion: vi.fn(async () => ({ wasActive: false })),
      completeDeletion: vi.fn((runId: string) => {
        cleanupCalls.push(runId);
        if (runId === 'run-1') throw cleanupError;
      }),
      cancelDeletion: vi.fn(),
      failDeletion: vi.fn(),
    };
    const lock = new ProjectDeletionLock();

    await expect(deleteProjectTestGenData('project-1', {
      runRepository: repository,
      orchestrator,
      deletionLock: lock,
      reportCleanupFailure,
    })).resolves.toBeUndefined();

    expect(cleanupCalls).toEqual(['run-1', 'run-2']);
    expect(reportCleanupFailure).toHaveBeenCalledWith('project-1', [
      { runId: 'run-1', error: cleanupError },
    ]);
    expect(database.prepare(`SELECT id FROM projects WHERE id = 'project-1'`).get())
      .toBeUndefined();
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_runs`).get())
      .toEqual({ count: 0 });
    expect(lock.isLocked('project-1')).toBe(false);
  });

  it('rolls back the entire project deletion and clears its lock on transaction failure', async () => {
    const activeCoverage = JSON.stringify([['active-story', {
      requirementId: 'active-story',
      conditionCount: 1,
      categories: ['functional'],
      techniques: ['BVA'],
      caseCountByLevel: { component: 1, integration: 0 },
    }]]);
    const retainedBefore = [
      ['run-active', 'RUNNING', 'design', activeCoverage],
      ['run-completed', 'COMPLETED', 'complete', '["completed-state"]'],
      ['run-waiting', 'WAITING_REVIEW', 'review', '["waiting-state"]'],
      ['run-failed', 'FAILED', 'quality', '["failed-state"]'],
    ] as const;
    const insertRun = database.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, phase, state)
      VALUES (?, 'project-1', ?, ?, ?)
    `);
    for (const row of retainedBefore) insertRun.run(...row);
    createCheckpointTables(database);
    const retainedThreads = retainedBefore.map(([runId]) => `${runId}-batch-0`);
    seedCheckpointThreads(database, retainedThreads);
    database.exec(`
      CREATE TRIGGER reject_project_delete
      BEFORE DELETE ON projects
      BEGIN
        SELECT RAISE(ABORT, 'injected project delete failure');
      END;
    `);
    const lock = new ProjectDeletionLock();
    const gateway = new SSEGateway();
    const events: Array<{ event: string; data: any }> = [];
    for (const [runId] of retainedBefore) {
      gateway.getEmitter(runId).on('sse', (event, data) => events.push({ event, data }));
    }
    const orchestrator = new Orchestrator(
      gateway,
      new RunCacheRegistry(),
      deletionContext(['run-active']),
      repository,
    );

    await expect(deleteProjectTestGenData('project-1', {
      runRepository: repository,
      orchestrator,
      deletionLock: lock,
    })).rejects.toThrow(/injected project delete failure/i);

    expect(lock.isLocked('project-1')).toBe(false);
    expect(database.prepare(`SELECT COUNT(*) AS count FROM projects WHERE id = 'project-1'`).get())
      .toEqual({ count: 1 });
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_runs WHERE project_id = 'project-1'`).get())
      .toEqual({ count: 4 });
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets WHERE project_id = 'project-1'`).get())
      .toEqual({ count: 0 });
    expect(database.prepare(`SELECT COUNT(*) AS count FROM test_gen_agent_logs`).get())
      .toEqual({ count: 0 });
    for (const table of CHECKPOINT_TABLES) {
      expect(database.prepare(`SELECT thread_id FROM ${table} ORDER BY thread_id`).all())
        .toEqual(retainedThreads.sort().map((thread_id) => ({ thread_id })));
    }
    const retainedRuns = database.prepare(`
      SELECT id, status, phase, state
      FROM test_gen_runs WHERE project_id = 'project-1' ORDER BY id
    `).all() as Array<{ id: string; status: string; phase: string; state: string }>;
    expect(retainedRuns).toEqual([
      { id: 'run-active', status: 'FAILED', phase: 'design', state: activeCoverage },
      { id: 'run-completed', status: 'COMPLETED', phase: 'complete', state: '["completed-state"]' },
      { id: 'run-failed', status: 'FAILED', phase: 'quality', state: '["failed-state"]' },
      { id: 'run-waiting', status: 'WAITING_REVIEW', phase: 'review', state: '["waiting-state"]' },
    ]);
    expect(events).toHaveLength(1);
    expect(events.every(({ data }) => data.recoverable === true)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('injected project delete failure');
  });

  it('does not orphan a run when a waiting cross-connection create resumes after project deletion', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'test-gen-project-delete-race-'));
    const filePath = join(tempDirectory, 'lifecycle.sqlite');
    const deletionDatabase = new Database(filePath, { timeout: 5_000 });
    try {
      deletionDatabase.pragma('journal_mode = WAL');
      deletionDatabase.pragma('busy_timeout = 5000');
      deletionDatabase.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE test_gen_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'RUNNING',
          phase TEXT NOT NULL DEFAULT 'analysis',
          current_batch INTEGER NOT NULL DEFAULT 0,
          total_batches INTEGER NOT NULL DEFAULT 0,
          mode TEXT NOT NULL DEFAULT 'auto',
          created_by TEXT,
          config TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO projects (id) VALUES ('project-race');
        BEGIN IMMEDIATE;
        DELETE FROM projects WHERE id = 'project-race';
      `);

      const creating = runCreateWorker(filePath);
      await creating.started;
      let createSettled = false;
      void creating.outcome.then(
        () => { createSettled = true; },
        () => { createSettled = true; },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(createSettled).toBe(false);
      deletionDatabase.exec('COMMIT');
      const outcome = await creating.outcome;

      expect(outcome).toEqual({
        ok: false,
        error: { name: 'NotFoundError', message: 'Project not found' },
      });
      expect(deletionDatabase.prepare(`SELECT COUNT(*) AS count FROM test_gen_runs`).get())
        .toEqual({ count: 0 });
      expect(deletionDatabase.prepare(`SELECT COUNT(*) AS count FROM projects`).get())
        .toEqual({ count: 0 });
    } finally {
      if (deletionDatabase.inTransaction) deletionDatabase.exec('ROLLBACK');
      deletionDatabase.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('attempts rollback recovery for every run when one recovery callback throws', async () => {
    seedProjectDeletionData(database);
    database.exec(`
      CREATE TRIGGER reject_project_delete_for_recovery
      BEFORE DELETE ON projects
      BEGIN
        SELECT RAISE(ABORT, 'project rollback');
      END;
    `);
    const lock = new ProjectDeletionLock();
    const recovered: string[] = [];
    const recoveryError = new Error('first recovery failed');
    const orchestrator = {
      abortAndWaitForDeletion: vi.fn(async () => ({ wasActive: true })),
      completeDeletion: vi.fn(),
      cancelDeletion: vi.fn(),
      failDeletion: vi.fn((runId: string) => {
        recovered.push(runId);
        if (runId === 'run-1') throw recoveryError;
      }),
    };

    await expect(deleteProjectTestGenData('project-1', {
      runRepository: repository,
      orchestrator,
      deletionLock: lock,
    })).rejects.toThrow();

    expect(recovered).toEqual(['run-1', 'run-2']);
    expect(lock.isLocked('project-1')).toBe(false);
  });

  it('clears the project lock when run enumeration fails', async () => {
    const lock = new ProjectDeletionLock();
    const enumerationError = new Error('injected enumeration failure');

    await expect(deleteProjectTestGenData('project-1', {
      runRepository: {
        listRunIdsByProject: () => {
          throw enumerationError;
        },
        deleteProjectData: vi.fn(),
      },
      orchestrator: {
        abortAndWaitForDeletion: vi.fn(),
        completeDeletion: vi.fn(),
        cancelDeletion: vi.fn(),
        failDeletion: vi.fn(),
      },
      deletionLock: lock,
    })).rejects.toBe(enumerationError);

    expect(lock.isLocked('project-1')).toBe(false);
  });
});
