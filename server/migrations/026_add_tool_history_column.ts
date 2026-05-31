import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration026AddToolHistoryColumn: Migration = {
  id: '026_add_tool_history_column',
  up: () => {
    db.exec(`ALTER TABLE test_gen_agent_logs ADD COLUMN tool_history TEXT;`);
  },
};
