import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration014DynamicVariableEvaluationStrategy: Migration = {
  id: '014_dynamic_variable_evaluation_strategy',
  up: () => {
    db.exec(`
      ALTER TABLE dynamic_variables ADD COLUMN evaluation_strategy TEXT NOT NULL DEFAULT 'EVERY_TIME';
    `);
  },
};