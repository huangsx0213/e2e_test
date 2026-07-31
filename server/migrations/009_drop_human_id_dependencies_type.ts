import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

/**
 * 009_drop_human_id_dependencies_type
 *
 * Removes three fields from the `requirements` table that are no longer used:
 *   - `human_id`: the system `id` is now editable directly and serves as the
 *     single identifier. Maintaining a separate human-readable ID added cost
 *     with no real value (UI already hides it; AI pipeline ignores it).
 *   - `dependencies`: a legacy story-level dependency list. Cross-component
 *     relationships are now expressed via AC-level `related_requirement_ids`
 *     (flow ACs reference component stories).
 *   - `type`: every requirement was `functional`; the field was never
 *     consumed by the AI pipeline or UI in a meaningful way.
 *
 * SQLite ≥ 3.35 (shipped by better-sqlite3@12) supports ALTER TABLE DROP
 * COLUMN, so a full table rebuild is not required.
 */
export const migration009DropHumanIdDependenciesType: Migration = {
  id: '009_drop_human_id_dependencies_type',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;
    const hasHumanId = reqCols.some((c) => c.name === 'human_id');
    const hasDependencies = reqCols.some((c) => c.name === 'dependencies');
    const hasType = reqCols.some((c) => c.name === 'type');

    // Drop the human_id unique index BEFORE the column, otherwise SQLite
    // fails with "error in index ... after drop column: no such column".
    if (hasHumanId) {
      Log.for('migration-009').info('Dropping index idx_requirements_human_id_project');
      db.exec('DROP INDEX IF EXISTS idx_requirements_human_id_project');
      Log.for('migration-009').info('Dropping requirements.human_id column');
      db.exec('ALTER TABLE requirements DROP COLUMN human_id');
    }
    if (hasDependencies) {
      Log.for('migration-009').info('Dropping requirements.dependencies column');
      db.exec('ALTER TABLE requirements DROP COLUMN dependencies');
    }
    if (hasType) {
      Log.for('migration-009').info('Dropping requirements.type column');
      db.exec('ALTER TABLE requirements DROP COLUMN type');
    }
  },
};
