import { db } from '../shared/db/client.ts';

export const migration020 = {
  id: '020_pipeline_agent_logs',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_agent_logs (
        id           TEXT PRIMARY KEY,
        run_id       TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
        batch        INTEGER NOT NULL,
        agent_name   TEXT NOT NULL,
        phase        TEXT NOT NULL,
        input_prompt TEXT,
        output_data  TEXT,
        token_usage  TEXT,
        latency_ms   INTEGER,
        raw_trace    TEXT,
        status       TEXT NOT NULL DEFAULT 'RUNNING',
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE pipeline_runs ADD COLUMN config TEXT;

      ALTER TABLE pipeline_runs ADD COLUMN checkpoint_data TEXT;
    `);
  },
};