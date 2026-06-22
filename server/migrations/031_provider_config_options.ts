import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration031ProviderConfigOptions: Migration = {
  id: '031_provider_config_options',
  up: () => {
    db.exec(`
      ALTER TABLE provider_configs ADD COLUMN reasoning_effort TEXT DEFAULT 'high'
    `);
    db.exec(`
      ALTER TABLE provider_configs ADD COLUMN reasoning_summary TEXT DEFAULT 'auto'
    `);
    db.exec(`
      ALTER TABLE provider_configs ADD COLUMN text_verbosity TEXT DEFAULT 'medium'
    `);
  },
};
