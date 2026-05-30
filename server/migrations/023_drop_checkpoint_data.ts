import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration023DropCheckpointData: Migration = {
  id: '023_drop_checkpoint_data',
  up: () => {
    db.exec(`ALTER TABLE test_gen_runs DROP COLUMN checkpoint_data;`);
  },
};
