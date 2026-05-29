import { db } from '../../../../shared/db/client.ts';
import { randomId } from '../../../../shared/utils/index.ts';
import type { CacheStore } from '../../../../../shared/ai/cache.ts';

export interface TestGenRunRow {
  id: string;
  project_id: string;
  status: string;
  phase: string;
  current_batch: number;
  total_batches: number;
  mode: string;
  config: string | null;
  checkpoint_data: string | null;
  token_usage: string | null;
  provider_type: string | null;
  model_name: string | null;
  prompt_version: string | null;
  provider_config_name: string | null;
  token_limit: number | null;
  thread_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderConfigRow {
  id: string;
  name: string;
  type: string;
  endpoint: string | null;
  encrypted_api_key: string;
  deployment: string | null;
  api_version: string | null;
  model: string | null;
  is_active: number;
  monthly_token_limit: number | null;
  fallback_config_ids: string | null;
}

export class TestGenRepository {
  // --- Agent Cache ---
  getCacheStore(): CacheStore {
    return {
      getCache: (key: string) => {
        return db.prepare(
          "SELECT output FROM agent_cache WHERE cache_key = ? AND expires_at > datetime('now')"
        ).get(key) as { output: string } | undefined;
      },
      setCache: (key: string, inputHash: string, promptVersion: string, model: string, output: string) => {
        db.prepare(`
          INSERT OR REPLACE INTO agent_cache (cache_key, input_hash, prompt_version, model, output, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+24 hours'))
        `).run(key, inputHash, promptVersion, model, output);
      },
      invalidateByPromptVersion: (promptVersion: string) => {
        db.prepare('DELETE FROM agent_cache WHERE prompt_version = ?').run(promptVersion);
      },
      invalidateAll: () => {
        db.prepare('DELETE FROM agent_cache').run();
      },
    };
  }

  // --- Provider Config ---
  getActiveProviderConfig(): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE is_active = 1 LIMIT 1').get() as any;
  }

  getProviderConfigByName(name: string): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE name = ? LIMIT 1').get(name) as any;
  }

  getProviderConfig(id: string): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as any;
  }

  // --- Pipeline Runs ---
  createRun(runId: string, projectId: string, mode: string, config: unknown): void {
    db.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, phase, current_batch, total_batches, mode, created_by, config)
      VALUES (?, ?, 'RUNNING', 'init', 0, 0, ?, ?, ?)
    `).run(runId, projectId, mode, 'anonymous', JSON.stringify(config));
  }

  listRunsByProject(projectId: string): any[] {
    const rows = db.prepare(
      'SELECT id, project_id, status, phase, current_batch, total_batches, mode, config, created_by, token_usage, created_at, updated_at FROM test_gen_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(projectId);
    return (rows as any[]).map(r => ({
      ...r,
      token_usage: r.token_usage ? JSON.parse(r.token_usage) : {},
      config: r.config ? JSON.parse(r.config) : null,
    }));
  }

  getActiveRun(projectId: string): any {
    const row = db.prepare(
      "SELECT id, status, phase, current_batch, total_batches, mode, config, checkpoint_data, created_at, updated_at FROM test_gen_runs WHERE project_id = ? AND status IN ('RUNNING', 'WAITING_REVIEW') ORDER BY created_at DESC LIMIT 1"
    ).get(projectId) as any;
    if (!row) return null;
    return {
      ...row,
      config: row.config ? JSON.parse(row.config) : null,
      checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null,
    };
  }

  getRun(runId: string): TestGenRunRow | undefined {
    return db.prepare('SELECT id, project_id, status, phase, current_batch, total_batches, mode FROM test_gen_runs WHERE id = ?').get(runId) as any;
  }

  getRunInfo(runId: string): any {
    const row = db.prepare('SELECT * FROM test_gen_runs WHERE id = ?').get(runId) as any;
    if (!row) return null;
    return {
      status: row.status,
      phase: row.phase,
      current_batch: row.current_batch,
      total_batches: row.total_batches,
      token_usage: row.token_usage ? JSON.parse(row.token_usage) : null,
      created_by: row.created_by,
      checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null,
      mode: row.mode,
      config: row.config ? JSON.parse(row.config) : null,
      provider_type: row.provider_type,
      model_name: row.model_name,
      prompt_version: row.prompt_version,
    };
  }

  updateBatchCount(runId: string, totalBatches: number): void {
    db.prepare('UPDATE test_gen_runs SET total_batches = ?, current_batch = 1 WHERE id = ?').run(totalBatches, runId);
  }

  updateCurrentBatch(runId: string, batch: number): void {
    db.prepare('UPDATE test_gen_runs SET current_batch = ? WHERE id = ?').run(batch, runId);
  }

  updateProviderInfo(runId: string, info: {
    providerType: string;
    modelName: string;
    promptVersion: string;
    providerConfigName: string | null;
    tokenLimit: number | null;
  }): void {
    db.prepare(`UPDATE test_gen_runs SET
      provider_type = ?, model_name = ?, prompt_version = ?, provider_config_name = ?, token_limit = ?
      WHERE id = ?`).run(
      info.providerType, info.modelName, info.promptVersion,
      info.providerConfigName, info.tokenLimit, runId,
    );
  }

  setCheckpointData(runId: string, data: unknown, phase: string): void {
    db.prepare("UPDATE test_gen_runs SET checkpoint_data = ?, status = 'WAITING_REVIEW', phase = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(data), phase, runId);
  }

  markRunFailed(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?").run(runId);
  }

  setRunRunning(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET status = 'RUNNING', updated_at = datetime('now') WHERE id = ?").run(runId);
  }

  touchRun(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET updated_at = datetime('now') WHERE id = ?").run(runId);
  }

  updateThreadId(runId: string, threadId: string): void {
    db.prepare("UPDATE test_gen_runs SET thread_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(threadId, runId);
  }

  getWaitingRuns(): any[] {
    const rows = db.prepare(
      "SELECT id, project_id, status, phase, thread_id, mode, config, checkpoint_data, updated_at FROM test_gen_runs WHERE status = 'WAITING_REVIEW' AND thread_id IS NOT NULL"
    ).all();
    return (rows as any[]).map(r => ({
      ...r,
      config: r.config ? JSON.parse(r.config) : null,
      checkpoint_data: r.checkpoint_data ? JSON.parse(r.checkpoint_data) : null,
    }));
  }

  getRunWithThreadId(runId: string): any {
    const row = db.prepare(
      'SELECT id, project_id, status, phase, thread_id, mode, config, checkpoint_data, current_batch FROM test_gen_runs WHERE id = ?'
    ).get(runId) as any;
    if (!row) return null;
    return {
      ...row,
      config: row.config ? JSON.parse(row.config) : null,
      checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null,
    };
  }

  getMonthlyTokenUsage(projectId: string): number {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const result = db.prepare(`
      SELECT SUM(CAST(COALESCE(json_extract(token_usage, '$.total_tokens'), '0') AS INTEGER)) as total
      FROM test_gen_runs
      WHERE project_id = ? AND created_at >= ? AND status IN ('COMPLETED', 'RUNNING')
    `).get(projectId, monthStart.toISOString()) as any;
    return result?.total ?? 0;
  }

  deleteRun(runId: string): void {
    db.prepare('DELETE FROM test_gen_agent_logs WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM test_gen_audit_log WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM test_gen_runs WHERE id = ?').run(runId);
  }

  // --- Agent Logs ---
  getAgentLogs(runId: string, agent?: string): any[] {
    let rows: any[];
    if (agent) {
      rows = db.prepare(
        'SELECT * FROM test_gen_agent_logs WHERE run_id = ? AND agent_name = ? ORDER BY created_at'
      ).all(runId, agent);
    } else {
      rows = db.prepare(
        'SELECT * FROM test_gen_agent_logs WHERE run_id = ? ORDER BY created_at'
      ).all(runId);
    }
    return (rows as any[]).map(r => ({
      ...r,
      input_prompt: r.input_prompt ? JSON.parse(r.input_prompt) : null,
      output_data: r.output_data ? JSON.parse(r.output_data) : null,
      token_usage: r.token_usage ? JSON.parse(r.token_usage) : null,
      raw_trace: r.raw_trace ? JSON.parse(r.raw_trace) : [],
    }));
  }

  markAgentLogFailed(logId: string): void {
    db.prepare("UPDATE test_gen_agent_logs SET status = 'FAILED' WHERE id = ?").run(logId);
  }

  updateAgentLogOutput(runId: string, agentName: string, outputData: Record<string, unknown>): void {
    const log = db.prepare(
      'SELECT id, output_data FROM test_gen_agent_logs WHERE run_id = ? AND agent_name = ? AND status = \'COMPLETED\' ORDER BY batch DESC LIMIT 1'
    ).get(runId, agentName) as any;
    if (log) {
      const existing = log.output_data ? JSON.parse(log.output_data) : {};
      const merged = { ...existing, ...outputData };
      db.prepare('UPDATE test_gen_agent_logs SET output_data = ? WHERE id = ?').run(JSON.stringify(merged), log.id);
    }
  }

  // --- Audit Log ---
  insertAuditLog(runId: string, checkpointId: string, action: string, editedData: unknown): void {
    const logId = randomId('audit');
    db.prepare(`
      INSERT INTO test_gen_audit_log (id, run_id, checkpoint_id, action, user_id, snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(logId, runId, checkpointId, action, 'anonymous', editedData ? JSON.stringify(editedData) : null);
  }
}

export const pipelineRepo = new TestGenRepository();

export { decryptApiKey } from '../../../../shared/crypto.ts';
