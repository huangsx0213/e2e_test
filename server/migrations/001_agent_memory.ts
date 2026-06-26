import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration001AgentMemory: Migration = {
  id: '001_agent_memory',
  up: () => {
    // 1. Persistent coverage table — per-condition rows for cross-run deduplication.
    //    Unique on (project_id, requirement_id, condition_hash, technique) so upserts
    //    replace stale coverage for the same condition+technique pair.
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_gen_persistent_coverage (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        condition_hash TEXT NOT NULL,
        condition_text TEXT NOT NULL DEFAULT '',
        technique TEXT NOT NULL,
        test_case_ids TEXT NOT NULL DEFAULT '[]',
        run_id TEXT,
        covered_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, requirement_id, condition_hash, technique)
      );

      CREATE INDEX IF NOT EXISTS idx_persistent_coverage_project
        ON test_gen_persistent_coverage(project_id);
      CREATE INDEX IF NOT EXISTS idx_persistent_coverage_requirement
        ON test_gen_persistent_coverage(project_id, requirement_id);
    `);

    // 2. Global blueprint column on test_gen_runs — cached Architect output.
    //    Generated on batch 0, reused by batches >0 to avoid redundant LLM calls.
    //    Stored as JSON text; NULL until the Architect agent runs.
    const columns = db.prepare("PRAGMA table_info(test_gen_runs)").all() as Array<{ name: string }>;
    const hasGlobalBlueprint = columns.some(c => c.name === 'global_blueprint');
    if (!hasGlobalBlueprint) {
      db.exec('ALTER TABLE test_gen_runs ADD COLUMN global_blueprint TEXT');
    }
  },
};
