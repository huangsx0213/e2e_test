import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration032DefaultReasoningEffort: Migration = {
  id: '032_default_reasoning_effort',
  up: () => {
    db.exec(`
      UPDATE provider_configs SET reasoning_effort = 'medium' WHERE reasoning_effort IS NULL OR reasoning_effort = 'high'
    `);
  },
};
