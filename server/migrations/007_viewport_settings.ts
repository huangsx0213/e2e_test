import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration007ViewportSettings: Migration = {
  id: '007_viewport_settings',
  up: () => {
    db.exec(`
      ALTER TABLE settings ADD COLUMN viewport_width INTEGER NOT NULL DEFAULT 1920;
      ALTER TABLE settings ADD COLUMN viewport_height INTEGER NOT NULL DEFAULT 1080;
    `);
  },
};
