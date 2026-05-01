import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

function addMetadataColumn(table: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'metadata')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN metadata TEXT;`);
  }
}

export const migration011StepMetadata: Migration = {
  id: '011_step_metadata',
  up: () => {
    addMetadataColumn('case_steps');
    addMetadataColumn('suite_steps');
  },
};
