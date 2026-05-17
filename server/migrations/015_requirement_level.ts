import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration015RequirementLevel: Migration = {
  id: '015_requirement_level',
  up: () => {
    db.exec(`
      ALTER TABLE requirements ADD COLUMN level TEXT NOT NULL DEFAULT 'story';
    `);
  },
};
