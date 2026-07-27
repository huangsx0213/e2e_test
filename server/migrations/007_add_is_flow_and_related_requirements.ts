import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

export const migration007AddIsFlowAndRelatedRequirements: Migration = {
  id: '007_add_is_flow_and_related_requirements',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;
    const hasIsFlow = reqCols.some((c) => c.name === 'is_flow');
    const hasRelatedReqIds = reqCols.some((c) => c.name === 'related_requirement_ids');

    if (!hasIsFlow) {
      Log.for('migration-007').info('Adding requirements.is_flow column');
      db.exec('ALTER TABLE requirements ADD COLUMN is_flow INTEGER NOT NULL DEFAULT 0');
    }
    if (!hasRelatedReqIds) {
      Log.for('migration-007').info('Adding requirements.related_requirement_ids column');
      db.exec("ALTER TABLE requirements ADD COLUMN related_requirement_ids TEXT NOT NULL DEFAULT '[]'");
    }
  },
};
