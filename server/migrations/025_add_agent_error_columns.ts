import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration025AddAgentErrorColumns: Migration = {
  id: '025_add_agent_error_columns',
  up: () => {
    db.exec(`ALTER TABLE test_gen_agent_logs ADD COLUMN error_message TEXT;`);
    db.exec(`ALTER TABLE test_gen_agent_logs ADD COLUMN error_raw_response TEXT;`);
  },
};
