import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import type { Migration } from './types.ts';

export const migration003RemoveFeatureLevel: Migration = {
  id: '003_remove_feature_level',
  up: () => {
    const features = db.prepare(
      "SELECT id, project_id, parent_id FROM requirements WHERE level = 'feature'",
    ).all() as Array<{ id: string; project_id: string; parent_id: string | null }>;

    if (features.length === 0) {
      Log.for('migration-003').info('No Feature-level rows to migrate.');
      return;
    }

    Log.for('migration-003').info(`Migrating ${features.length} Feature-level rows...`);

    const childCountStmt = db.prepare(
      'SELECT COUNT(*) as count FROM requirements WHERE parent_id = ?',
    );

    for (const feature of features) {
      const childCount = (childCountStmt.get(feature.id) as { count: number }).count;

      // Reparent children to feature's parent
      db.prepare('UPDATE requirements SET parent_id = ? WHERE parent_id = ?').run(
        feature.parent_id,
        feature.id,
      );

      // Decide feature's new level: epic if it had children, else story
      const newLevel = childCount > 0 ? 'epic' : 'story';
      db.prepare('UPDATE requirements SET level = ? WHERE id = ?').run(newLevel, feature.id);

      Log.for('migration-003').info(
        `Feature ${feature.id} → ${newLevel} (had ${childCount} children)`,
      );
    }
  },
};
