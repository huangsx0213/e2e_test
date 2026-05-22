import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration019PipelineProduction: Migration = {
  id: '019_pipeline_production',
  up: () => {
    // Add missing columns to existing pipeline_runs table
    // Use ALTER TABLE for each column (SQLite doesn't support multi-column ALTER)
    const existingCols: string[] = [];
    const cols = db.prepare('PRAGMA table_info(pipeline_runs)').all() as Array<{ name: string }>;
    for (const c of cols) { existingCols.push(c.name); }

    const addColumn = (name: string, def: string) => {
      if (!existingCols.includes(name)) {
        db.prepare(`ALTER TABLE pipeline_runs ADD COLUMN ${name} ${def}`).run();
      }
    };

    addColumn('state', 'TEXT');
    addColumn('current_batch', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('total_batches', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('provider_config_name', 'TEXT');
    addColumn('provider_type', 'TEXT');
    addColumn('model_name', 'TEXT');
    addColumn('prompt_version', 'TEXT');
    addColumn('created_by', 'TEXT');
    addColumn('approved_by', "TEXT DEFAULT '[]'");
    addColumn('mode', "TEXT DEFAULT 'draft'");
    addColumn('token_usage', "TEXT DEFAULT '{}'");
    addColumn('token_limit', 'INTEGER');
    addColumn('error_count', 'INTEGER NOT NULL DEFAULT 0');

    // New tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_audit_log (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
        checkpoint_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT NOT NULL,
        snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        endpoint TEXT,
        encrypted_api_key TEXT NOT NULL,
        deployment TEXT,
        api_version TEXT,
        model TEXT,
        fallback_config_ids TEXT DEFAULT '[]',
        monthly_token_limit INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS agent_cache (
        cache_key TEXT PRIMARY KEY,
        input_hash TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        model TEXT NOT NULL,
        output TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
    `);
  },
};