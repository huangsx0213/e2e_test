// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyHtmlKnowledgeSchema } from '../../../migrations/010_add_test_gen_html_knowledge.ts';

describe('HTML knowledge schema', () => {
  let database: Database.Database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE test_gen_runs (id TEXT PRIMARY KEY);
      INSERT INTO projects (id) VALUES ('project-1');
    `);
    applyHtmlKnowledgeSchema(database);
  });

  afterEach(() => {
    database.close();
  });

  it('creates both tables with JSON, count, and timestamp defaults', () => {
    const tables = database
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'test_gen_html_knowledge_%'
        ORDER BY name
      `)
      .all();

    expect(tables).toEqual([
      { name: 'test_gen_html_knowledge_pages' },
      { name: 'test_gen_html_knowledge_sets' },
    ]);

    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets (id, project_id, status, index_version)
      VALUES ('set-1', 'project-1', 'UPLOADING', 1)
    `).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size, status)
      VALUES ('page-1', 'set-1', 'Login.html', 'login.html', 42, 'PENDING')
    `).run();

    expect(database.prepare(`
      SELECT page_count, total_bytes, page_graph,
             typeof(created_at) AS created_at_type,
             typeof(updated_at) AS updated_at_type
      FROM test_gen_html_knowledge_sets
      WHERE id = 'set-1'
    `).get()).toEqual({
      page_count: 0,
      total_bytes: 0,
      page_graph: '[]',
      created_at_type: 'text',
      updated_at_type: 'text',
    });
    expect(database.prepare(`
      SELECT warnings,
             typeof(created_at) AS created_at_type,
             typeof(updated_at) AS updated_at_type
      FROM test_gen_html_knowledge_pages
      WHERE id = 'page-1'
    `).get()).toEqual({
      warnings: '[]',
      created_at_type: 'text',
      updated_at_type: 'text',
    });
  });

  it('rejects inconsistent set states and negative manifest counts', () => {
    database.prepare(`INSERT INTO test_gen_runs (id) VALUES ('run-1')`).run();

    expect(() => database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, index_version)
      VALUES ('set-bound-without-run', 'project-1', 'BOUND', 1)
    `).run()).toThrow();

    expect(() => database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, index_version,
         requirement_snapshot, requirement_snapshot_hash)
      VALUES ('set-ready-with-run', 'project-1', 'run-1', 'READY', 1, '{}', 'hash')
    `).run()).toThrow();

    expect(() => database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, status, page_count, total_bytes, index_version)
      VALUES ('set-negative-count', 'project-1', 'UPLOADING', -1, 0, 1)
    `).run()).toThrow();
  });

  it('rejects duplicate normalized file names and non-null content hashes within a set', () => {
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets (id, project_id, status, index_version)
      VALUES ('set-1', 'project-1', 'UPLOADING', 1)
    `).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size, status, sha256)
      VALUES ('page-1', 'set-1', 'Login.html', 'login.html', 10, 'READY', 'hash-1')
    `).run();

    expect(() => database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size, status, sha256)
      VALUES ('page-2', 'set-1', 'login.HTML', 'login.html', 11, 'READY', 'hash-2')
    `).run()).toThrow();

    expect(() => database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size, status, sha256)
      VALUES ('page-3', 'set-1', 'other.html', 'other.html', 10, 'READY', 'hash-1')
    `).run()).toThrow();
  });

  it('cascades a bound set and its pages when its run is deleted', () => {
    database.prepare(`INSERT INTO test_gen_runs (id) VALUES ('run-1')`).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets
        (id, project_id, run_id, status, page_count, total_bytes, index_version,
         requirement_snapshot, requirement_snapshot_hash)
      VALUES ('set-1', 'project-1', 'run-1', 'BOUND', 1, 10, 1, '{}', 'hash')
    `).run();
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_pages
        (id, knowledge_set_id, file_name, file_name_key, expected_byte_size, status)
      VALUES ('page-1', 'set-1', 'login.html', 'login.html', 10, 'PENDING')
    `).run();

    database.prepare(`DELETE FROM test_gen_runs WHERE id = 'run-1'`).run();

    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_sets').get())
      .toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM test_gen_html_knowledge_pages').get())
      .toEqual({ count: 0 });
  });

  it('restricts project deletion while an unbound set exists', () => {
    database.prepare(`
      INSERT INTO test_gen_html_knowledge_sets (id, project_id, status, index_version)
      VALUES ('set-1', 'project-1', 'UPLOADING', 1)
    `).run();

    expect(() => database.prepare(`DELETE FROM projects WHERE id = 'project-1'`).run()).toThrow();
    expect(database.prepare(`SELECT id FROM projects WHERE id = 'project-1'`).get())
      .toEqual({ id: 'project-1' });
  });
});
