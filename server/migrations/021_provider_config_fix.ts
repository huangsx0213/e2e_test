import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration021ProviderConfigFix: Migration = {
  id: '021_provider_config_fix',
  up: () => {
    // Recreate provider_configs without FK constraint (provider is global, not per-project)
    // and add updated_at column
    db.exec(`
      CREATE TABLE IF NOT EXISTS provider_configs_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        endpoint TEXT,
        encrypted_api_key TEXT NOT NULL,
        deployment TEXT,
        api_version TEXT,
        model TEXT,
        fallback_config_ids TEXT DEFAULT '[]',
        monthly_token_limit INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO provider_configs_v2
        (id, project_id, name, type, endpoint, encrypted_api_key, deployment, api_version, model, fallback_config_ids, monthly_token_limit, is_active, created_at)
      SELECT id, project_id, name, type, endpoint, encrypted_api_key, deployment, api_version, model, fallback_config_ids, monthly_token_limit, is_active, created_at
      FROM provider_configs;

      DROP TABLE provider_configs;
      ALTER TABLE provider_configs_v2 RENAME TO provider_configs;
    `);
  },
};