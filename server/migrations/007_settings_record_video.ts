import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration007SettingsRecordVideo: Migration = {
  id: '007_settings_record_video',
  up: () => {
    // SQLite ALTER TABLE ADD COLUMN
    try {
      db.exec(`
        ALTER TABLE settings ADD COLUMN record_video INTEGER NOT NULL DEFAULT 1;
      `);
    } catch (error: any) {
      // Ignore if column already exists
      if (!error.message.includes('duplicate column name')) {
        throw error;
      }
    }
  },
};
