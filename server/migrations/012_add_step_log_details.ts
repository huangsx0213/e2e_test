import type Database from 'better-sqlite3';
import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export function applyStepLogDetails(database: Database.Database): void {
  database.exec(
    'ALTER TABLE ai_driven_recording_step_logs ADD COLUMN log_details TEXT;',
  );
}

export const migration012AddStepLogDetails: Migration = {
  id: '012_add_step_log_details',
  up: () => applyStepLogDetails(db),
};
