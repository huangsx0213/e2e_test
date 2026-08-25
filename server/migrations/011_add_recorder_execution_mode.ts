import type Database from 'better-sqlite3';

import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export function applyRecorderExecutionMode(database: Database.Database): void {
  database.exec(`ALTER TABLE ai_driven_recording_runs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'agent';`);
}

export const migration011AddRecorderExecutionMode: Migration = {
  id: '011_add_recorder_execution_mode',
  up: () => applyRecorderExecutionMode(db),
};
