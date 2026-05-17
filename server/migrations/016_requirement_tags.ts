import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration016RequirementTags: Migration = {
  id: '016_requirement_tags',
  up: () => {
    db.exec(`ALTER TABLE requirements ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';`);
  },
};
