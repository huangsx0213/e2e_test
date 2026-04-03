import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration008ElementRecordingFields: Migration = {
  id: '008_element_recording_fields',
  up: () => {
    try {
      db.exec(`ALTER TABLE project_elements ADD COLUMN original_html TEXT;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e;
    }
    try {
      db.exec(`ALTER TABLE project_elements ADD COLUMN page_url TEXT;`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) throw e;
    }
  },
};
