// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';
import { HtmlKnowledgeRepository } from '../html-knowledge/repository.ts';
import { HtmlKnowledgeService } from '../html-knowledge/service.ts';
import {
  HTML_KNOWLEDGE_CLEANUP_INTERVAL_MS,
  HTML_KNOWLEDGE_UNBOUND_TTL_MS,
} from '../html-knowledge/types.ts';

function makeDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE test_gen_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL);
    INSERT INTO projects (id) VALUES ('project-1');
    INSERT INTO test_gen_runs (id, project_id) VALUES ('bound-run', 'project-1');
  `);
  applyHtmlKnowledgeSchema(database);
  return database;
}

describe('HTML knowledge abandoned-set cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes only unbound UPLOADING and READY sets strictly older than 24 hours', () => {
    const database = makeDatabase();
    const service = new HtmlKnowledgeService(new HtmlKnowledgeRepository(database));
    const now = new Date('2026-08-21T12:00:00.500Z');
    const old = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS - 1).toISOString();
    const boundary = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS).toISOString();
    const recent = new Date(now.getTime() - HTML_KNOWLEDGE_UNBOUND_TTL_MS + 1_000).toISOString();
    const insert = database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, page_graph,
         index_version, requirement_snapshot, requirement_snapshot_hash,
         created_at, updated_at)
      VALUES (?, 'project-1', ?, ?, 1, 1, '[]', 1, ?, ?, ?, ?)
    `);
    insert.run('old-uploading', null, 'UPLOADING', null, null, old, old);
    insert.run('old-ready', null, 'READY', null, null, old, old);
    insert.run('boundary-ready', null, 'READY', null, null, boundary, boundary);
    insert.run('recent-uploading', null, 'UPLOADING', null, null, recent, recent);
    insert.run(
      'old-bound',
      'bound-run',
      'BOUND',
      '{"version":1}',
      'snapshot-hash',
      old,
      old,
    );

    expect(service.cleanupAbandonedSets(now)).toBe(2);
    expect(database.prepare(`
      SELECT id FROM test_gen_html_knowledge_sets ORDER BY id
    `).all()).toEqual([
      { id: 'boundary-ready' },
      { id: 'old-bound' },
      { id: 'recent-uploading' },
    ]);
    database.close();
  });

  it('has no import-time timer and starts immediately plus hourly with unref and stop', async () => {
    vi.resetModules();
    const globalInterval = vi.spyOn(globalThis, 'setInterval');
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { startHtmlKnowledgeCleanup } = await import('../html-knowledge/cleanup.ts');
    expect(globalInterval).not.toHaveBeenCalled();

    const cleanupAbandonedSets = vi.fn(() => 3);
    let scheduledCleanup: (() => void) | undefined;
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const setIntervalFn = vi.fn((callback: () => void, intervalMs: number) => {
      scheduledCleanup = callback;
      expect(intervalMs).toBe(HTML_KNOWLEDGE_CLEANUP_INTERVAL_MS);
      return timer;
    });
    const clearIntervalFn = vi.fn();

    const cleanup = startHtmlKnowledgeCleanup({
      service: { cleanupAbandonedSets },
      setIntervalFn,
      clearIntervalFn,
      now: () => new Date('2026-08-21T12:00:00.000Z'),
    });

    expect(cleanupAbandonedSets).toHaveBeenCalledOnce();
    expect(timer.unref).toHaveBeenCalledOnce();
    scheduledCleanup?.();
    expect(cleanupAbandonedSets).toHaveBeenCalledTimes(2);
    expect(consoleLog.mock.calls.filter(([message]) =>
      String(message).includes('Abandoned set cleanup completed: deletedCount=3')
    )).toHaveLength(2);
    cleanup.stop();
    cleanup.stop();
    expect(clearIntervalFn).toHaveBeenCalledOnce();
    expect(clearIntervalFn).toHaveBeenCalledWith(timer);
  });

  it('logs cleanup metadata without logging source-bearing error text', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startHtmlKnowledgeCleanup } = await import('../html-knowledge/cleanup.ts');
    const timer = { unref: vi.fn() } as unknown as NodeJS.Timeout;

    const cleanup = startHtmlKnowledgeCleanup({
      service: {
        cleanupAbandonedSets: () => {
          throw Object.assign(new Error('SECRET_NORMALIZED_HTML'), { code: 'SQLITE_BUSY' });
        },
      },
      setIntervalFn: () => timer,
      clearIntervalFn: vi.fn(),
    });

    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).toContain('SQLITE_BUSY');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('SECRET_NORMALIZED_HTML');
    cleanup.stop();
  });
});
