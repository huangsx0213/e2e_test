import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration005StructuredLogs: Migration = {
  id: '005_structured_logs',
  up: () => {
    db.exec(`
      ALTER TABLE report_logs ADD COLUMN level TEXT NOT NULL DEFAULT 'info';
      ALTER TABLE report_logs ADD COLUMN metadata TEXT;
    `);
  },
};
