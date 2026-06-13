import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration027ProviderModels: Migration = {
  id: '027_provider_models',
  up: () => {
    // Add models column (JSON array of model names)
    db.exec(`ALTER TABLE provider_configs ADD COLUMN models TEXT`);

    // Migrate existing model → models (JSON array)
    const rows = db.prepare("SELECT id, model FROM provider_configs WHERE model IS NOT NULL AND model != ''").all() as Array<{ id: string; model: string }>;
    const update = db.prepare('UPDATE provider_configs SET models = ? WHERE id = ?');
    for (const row of rows) {
      update.run(JSON.stringify([row.model]), row.id);
    }

    // Set empty array for rows without model
    db.prepare('UPDATE provider_configs SET models = ? WHERE models IS NULL').run('[]');
  },
};
