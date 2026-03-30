import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration003UiExecution: Migration = {
  id: '003_ui_execution',
  up: () => {
    db.exec(`
      -- Add headless_mode to settings
      ALTER TABLE settings ADD COLUMN headless_mode INTEGER NOT NULL DEFAULT 1;

      -- Add screenshot toggle to steps
      ALTER TABLE case_steps ADD COLUMN screenshot INTEGER;
      ALTER TABLE suite_steps ADD COLUMN screenshot INTEGER;
      ALTER TABLE module_steps ADD COLUMN screenshot INTEGER;
    `);
  },
};
