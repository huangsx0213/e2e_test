import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration013AiTestGenSchema: Migration = {
  id: '013_ai_test_gen_schema',
  up: () => {
    db.exec(`
      -- Test Conditions (ISTQB-based)
      CREATE TABLE IF NOT EXISTS test_conditions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        requirement_id TEXT NOT NULL,
        condition TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'happy-path',
        data_requirements TEXT,
        dependencies TEXT NOT NULL DEFAULT '[]',
        risk_level TEXT NOT NULL DEFAULT 'medium',
        priority TEXT NOT NULL DEFAULT 'medium',
        primary_technique TEXT NOT NULL,
        secondary_techniques TEXT NOT NULL DEFAULT '[]',
        technique_rationale TEXT NOT NULL DEFAULT '',
        coverage_dimensions TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Natural Language Test Cases
      CREATE TABLE IF NOT EXISTS natural_language_test_cases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        requirement_id TEXT,
        condition_id TEXT,
        technique_applied TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        category TEXT,
        preconditions TEXT NOT NULL DEFAULT '[]',
        test_data TEXT NOT NULL DEFAULT '[]',
        steps TEXT NOT NULL DEFAULT '[]',
        postconditions TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        self_review TEXT,
        review_summary TEXT,
        change_log TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        generated_suite_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- AI Test Generation Runs
      CREATE TABLE IF NOT EXISTS test_gen_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RUNNING',
        phase TEXT NOT NULL DEFAULT 'init',
        state TEXT,
        current_batch INTEGER NOT NULL DEFAULT 0,
        total_batches INTEGER NOT NULL DEFAULT 0,
        mode TEXT DEFAULT 'draft',
        provider_config_name TEXT,
        provider_type TEXT,
        model_name TEXT,
        prompt_version TEXT,
        created_by TEXT,
        approved_by TEXT DEFAULT '[]',
        token_usage TEXT DEFAULT '{}',
        token_limit INTEGER,
        error_count INTEGER NOT NULL DEFAULT 0,
        config TEXT,
        checkpoint_data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Test Generation Coverage Matrix
      CREATE TABLE IF NOT EXISTS test_gen_coverages (
        id TEXT PRIMARY KEY,
        test_gen_run_id TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        requirement_title TEXT NOT NULL,
        level TEXT NOT NULL,
        total_conditions INTEGER NOT NULL DEFAULT 0,
        test_case_count INTEGER NOT NULL DEFAULT 0,
        technique_breakdown TEXT NOT NULL DEFAULT '{}',
        category_breakdown TEXT NOT NULL DEFAULT '{}',
        coverage_percentage REAL NOT NULL DEFAULT 0,
        uncovered_risks TEXT NOT NULL DEFAULT '[]'
      );

      -- Agent Execution Logs
      CREATE TABLE IF NOT EXISTS test_gen_agent_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE,
        batch INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        input_prompt TEXT,
        output_data TEXT,
        token_usage TEXT,
        latency_ms INTEGER,
        raw_trace TEXT,
        status TEXT NOT NULL DEFAULT 'RUNNING',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Audit Log for Human Review Actions
      CREATE TABLE IF NOT EXISTS test_gen_audit_log (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE,
        checkpoint_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT NOT NULL,
        snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- AI Provider Configurations
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

      -- LLM Response Cache
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