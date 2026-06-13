import type { ProviderConfig } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import { normalizeProviderConfig } from './mapper.ts';
import { randomId } from '../../shared/utils/index.ts';

const COLUMNS = 'id, project_id, name, type, endpoint, encrypted_api_key, deployment, api_version, model, models, fallback_config_ids, monthly_token_limit, is_active, created_at';

class ProviderConfigRepository extends BaseCrudRepository<ProviderConfig> {
  protected table = 'provider_configs';

  list(): ProviderConfig[] {
    const rows = db.prepare(`SELECT id FROM provider_configs ORDER BY created_at DESC`).all() as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as ProviderConfig[];
  }

  get(id: string): ProviderConfig | undefined {
    const row = db.prepare(`SELECT ${COLUMNS} FROM provider_configs WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      type: row.type,
      endpoint: row.endpoint || '',
      encryptedApiKey: row.encrypted_api_key,
      deployment: row.deployment || '',
      apiVersion: row.api_version || '',
      model: row.model || '',
      models: JSON.parse(row.models || '[]'),
      fallbackConfigIds: JSON.parse(row.fallback_config_ids || '[]'),
      monthlyTokenLimit: row.monthly_token_limit,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
    };
  }

  save(record: Partial<ProviderConfig>): ProviderConfig {
    const normalized = normalizeProviderConfig(record);
    const id = normalized.id || randomId('prov');

    db.prepare(`
      INSERT INTO provider_configs (id, project_id, name, type, endpoint, encrypted_api_key, deployment, api_version, model, models, fallback_config_ids, monthly_token_limit, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        endpoint = excluded.endpoint,
        encrypted_api_key = excluded.encrypted_api_key,
        deployment = excluded.deployment,
        api_version = excluded.api_version,
        model = excluded.model,
        models = excluded.models,
        fallback_config_ids = excluded.fallback_config_ids,
        monthly_token_limit = excluded.monthly_token_limit,
        is_active = excluded.is_active,
        updated_at = datetime('now')
    `).run(
      id,
      normalized.projectId || '',
      normalized.name,
      normalized.type,
      normalized.endpoint || '',
      normalized.encryptedApiKey,
      normalized.deployment || '',
      normalized.apiVersion || '',
      normalized.model || '',
      JSON.stringify(normalized.models || []),
      JSON.stringify(normalized.fallbackConfigIds || []),
      normalized.monthlyTokenLimit ?? null,
      normalized.isActive ? 1 : 0,
    );
    return this.get(id)!;
  }

  remove(id: string): void {
    db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id);
  }

  setActive(id: string): void {
    db.prepare("UPDATE provider_configs SET is_active = 0 WHERE is_active = 1").run();
    db.prepare("UPDATE provider_configs SET is_active = 1 WHERE id = ?").run(id);
  }
}

export const providerConfigRepo = new ProviderConfigRepository();