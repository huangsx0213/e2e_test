import type Database from 'better-sqlite3';

import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export function applyHtmlKnowledgeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS test_gen_html_knowledge_sets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      run_id TEXT UNIQUE REFERENCES test_gen_runs(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('UPLOADING', 'READY', 'BOUND')),
      page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
      total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
      page_graph TEXT NOT NULL DEFAULT '[]',
      index_version INTEGER NOT NULL,
      requirement_snapshot TEXT,
      requirement_snapshot_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (
          status = 'BOUND'
          AND run_id IS NOT NULL
          AND requirement_snapshot IS NOT NULL
          AND requirement_snapshot_hash IS NOT NULL
        )
        OR
        (
          status IN ('UPLOADING', 'READY')
          AND run_id IS NULL
          AND requirement_snapshot IS NULL
          AND requirement_snapshot_hash IS NULL
        )
      )
    );

    CREATE TABLE IF NOT EXISTS test_gen_html_knowledge_pages (
      id TEXT PRIMARY KEY,
      knowledge_set_id TEXT NOT NULL REFERENCES test_gen_html_knowledge_sets(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_name_key TEXT NOT NULL,
      expected_byte_size INTEGER NOT NULL CHECK (expected_byte_size >= 0),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'READY', 'FAILED')),
      error_message TEXT,
      page_title TEXT,
      sha256 TEXT,
      byte_size INTEGER,
      normalized_html TEXT,
      knowledge_index TEXT,
      information_level TEXT CHECK (
        information_level IS NULL OR information_level IN ('NORMAL', 'LOW_INFORMATION')
      ),
      warnings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_html_knowledge_sets_project
      ON test_gen_html_knowledge_sets(project_id);
    CREATE INDEX IF NOT EXISTS idx_html_knowledge_pages_set
      ON test_gen_html_knowledge_pages(knowledge_set_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_html_knowledge_pages_name
      ON test_gen_html_knowledge_pages(knowledge_set_id, file_name_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_html_knowledge_pages_hash
      ON test_gen_html_knowledge_pages(knowledge_set_id, sha256)
      WHERE sha256 IS NOT NULL;
  `);
}

export const migration010AddTestGenHtmlKnowledge: Migration = {
  id: '010_add_test_gen_html_knowledge',
  up: () => applyHtmlKnowledgeSchema(db),
};
