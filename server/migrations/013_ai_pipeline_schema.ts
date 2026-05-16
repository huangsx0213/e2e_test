import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration013AiPipelineSchema: Migration = {
  id: '013_ai_pipeline_schema',
  up: () => {
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RUNNING',
        phase TEXT NOT NULL DEFAULT 'init',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pipeline_coverages (
        id TEXT PRIMARY KEY,
        pipeline_run_id TEXT NOT NULL,
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
    `);
  },
};