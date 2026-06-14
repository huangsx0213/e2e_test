import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration029PromptOverrides: Migration = {
  id: '029_prompt_overrides',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_gen_prompt_overrides (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        custom_prompt TEXT,
        model_override TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, agent_name)
      )
    `);
  },
};
