import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

/**
 * Migration 030: AI-Driven Recording Engine schema
 *
 * 创建 AI 驱动录制引擎所需的表：
 *   - ai_driven_recording_runs: 录制运行记录
 *   - ai_driven_recording_step_logs: 步骤级日志
 *
 * 架构参考：docs/05-AIDrivenRecordingEngine.md §7
 */
export const migration030AiDrivenRecorderSchema: Migration = {
  id: '030_ai_driven_recorder_schema',
  up: () => {
    db.exec(`
      -- AI 驱动录制运行记录
      CREATE TABLE IF NOT EXISTS ai_driven_recording_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        nl_case_id TEXT NOT NULL,
        provider_config_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        total_steps INTEGER NOT NULL DEFAULT 0,
        completed_steps INTEGER NOT NULL DEFAULT 0,
        failed_steps INTEGER NOT NULL DEFAULT 0,
        result_suite_id TEXT,
        result_case_id TEXT,
        replay_report TEXT,
        error TEXT,
        options TEXT,
        token_usage TEXT,
        FOREIGN KEY (nl_case_id) REFERENCES natural_language_test_cases(id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_rec_status ON ai_driven_recording_runs(status);
      CREATE INDEX IF NOT EXISTS idx_ai_rec_project ON ai_driven_recording_runs(project_id);

      -- AI 驱动录制步骤日志
      CREATE TABLE IF NOT EXISTS ai_driven_recording_step_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES ai_driven_recording_runs(id) ON DELETE CASCADE,
        nl_step_index INTEGER NOT NULL,
        instruction TEXT NOT NULL,
        expected TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        assertions TEXT,
        recorded_step_count INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        error TEXT,
        provenance TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_rec_step_run ON ai_driven_recording_step_logs(run_id);
    `);
  },
};
