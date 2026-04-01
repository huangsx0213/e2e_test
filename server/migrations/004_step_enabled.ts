import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration004StepEnabled: Migration = {
  id: '004_step_enabled',
  up: () => {
    db.exec(`
      -- Add enabled flag to steps (default to 1/true for existing steps)
      ALTER TABLE case_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE suite_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE module_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
    `);
  },
};
