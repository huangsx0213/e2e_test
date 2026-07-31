import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

/**
 * 005_drop_priority_and_tags_and_in_progress
 *
 * Removes fields that are no longer surfaced in the UI or used by the AI
 * test-gen pipeline:
 *   - `priority` column on requirements (AI has its own priority at the
 *     TestCondition level; requirement-level priority is unused).
 *   - `tags` column on requirements (no UI; superseded by `type` and
 *     `testScenario` for AI test-gen strategy).
 *   - `IN_PROGRESS` status value (semantically redundant with `DRAFT`; the
 *     downstream pipeline only branches on `APPROVED` vs other).
 *
 * SQLite ≥ 3.35 (which `better-sqlite3@12` ships) supports ALTER TABLE DROP
 * COLUMN, so a full table rebuild is not required.
 */
export const migration005DropPriorityAndTagsAndInProgress: Migration = {
  id: '005_drop_priority_and_tags_and_in_progress',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;
    const hasPriority = reqCols.some((c) => c.name === 'priority');
    const hasTags = reqCols.some((c) => c.name === 'tags');

    if (hasPriority) {
      Log.for('migration-005').info('Dropping requirements.priority column');
      db.exec('ALTER TABLE requirements DROP COLUMN priority');
    }
    if (hasTags) {
      Log.for('migration-005').info('Dropping requirements.tags column');
      db.exec('ALTER TABLE requirements DROP COLUMN tags');
    }

    // Collapse IN_PROGRESS into DRAFT so the new 3-state status enum applies
    // to existing rows.
    const updated = db
      .prepare("UPDATE requirements SET status = 'DRAFT' WHERE status = 'IN_PROGRESS'")
      .run();
    if (updated.changes > 0) {
      Log.for('migration-005').info(
        `Re-mapped ${updated.changes} IN_PROGRESS rows to DRAFT`,
      );
    }
  },
};
