import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

/**
 * 006_drop_metadata_and_test_scenario
 *
 * Removes two fields that were never actually used or are now obsolete:
 *   - `metadata` column on requirements: was a generic JSON catch-all that
 *     defaulted to `{}` everywhere. The type system has dropped the field.
 *   - `test_scenario` column on requirements: per ISTQB, scenario
 *     classification (happy/error/boundary) is determined by the AI from the
 *     AC's Given/When/Then content, not pre-classified by the user.
 *     The UI cycle button and field type have been removed.
 *
 * SQLite ≥ 3.35 (which `better-sqlite3@12` ships) supports ALTER TABLE DROP
 * COLUMN, so a full table rebuild is not required.
 */
export const migration006DropMetadataAndTestScenario: Migration = {
  id: '006_drop_metadata_and_test_scenario',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;
    const hasMetadata = reqCols.some((c) => c.name === 'metadata');
    const hasTestScenario = reqCols.some((c) => c.name === 'test_scenario');

    if (hasMetadata) {
      Log.for('migration-006').info('Dropping requirements.metadata column');
      db.exec('ALTER TABLE requirements DROP COLUMN metadata');
    }
    if (hasTestScenario) {
      Log.for('migration-006').info('Dropping requirements.test_scenario column');
      db.exec('ALTER TABLE requirements DROP COLUMN test_scenario');
    }
  },
};
