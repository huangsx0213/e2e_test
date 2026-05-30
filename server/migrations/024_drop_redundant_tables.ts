import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration024DropRedundantTables: Migration = {
  id: '024_drop_redundant_tables',
  up: () => {
    db.exec(`DROP TABLE IF EXISTS test_gen_coverages;`);
    db.exec(`DROP TABLE IF EXISTS test_conditions;`);
  },
};
