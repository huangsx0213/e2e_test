import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration002RequirementsHumanIdAndFlowType: Migration = {
  id: '002_requirements_human_id_and_flow_type',
  up: () => {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all() as Array<{ name: string }>;

    if (!reqCols.some((c) => c.name === 'human_id')) {
      db.exec('ALTER TABLE requirements ADD COLUMN human_id TEXT');
    }

    if (!reqCols.some((c) => c.name === 'flow_type')) {
      db.exec('ALTER TABLE requirements ADD COLUMN flow_type TEXT');
    }

    // Backfill existing AC rows with default 'atomic'
    db.exec("UPDATE requirements SET flow_type = 'atomic' WHERE level = 'ac' AND flow_type IS NULL");

    // Create unique index on (project_id, human_id) where human_id is not null
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_requirements_human_id_project
      ON requirements(project_id, human_id) WHERE human_id IS NOT NULL
    `);
  },
};
