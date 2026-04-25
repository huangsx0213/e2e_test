import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration010ProjectElementMetadata: Migration = {
  id: '010_project_element_metadata',
  up: () => {
    const columns = db.prepare(`PRAGMA table_info(project_elements)`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'metadata')) {
      db.exec(`
        ALTER TABLE project_elements ADD COLUMN metadata TEXT;
      `);
    }
  },
};
