import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration028ThinkingData: Migration = {
  id: '028_thinking_data',
  up: () => {
    db.exec(`ALTER TABLE test_gen_runs ADD COLUMN thinking_data TEXT`);
  },
};
