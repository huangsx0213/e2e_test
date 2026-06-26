import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';
import { decryptApiKey } from '../../shared/crypto.ts';
import type { CacheStore } from './infra/cache.ts';

export interface TestGenRunRow {
  id: string;
  project_id: string;
  status: string;
  phase: string;
  current_batch: number;
  total_batches: number;
  mode: string;
  config: string | null;
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
  models: string | null;
  is_active: number;
  monthly_token_limit: number | null;
  fallback_config_ids: string | null;
  reasoning_effort: string | null;
  reasoning_summary: string | null;
  text_verbosity: string | null;
}

export class TestGenRepository {
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

  getActiveProviderConfig(): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE is_active = 1 LIMIT 1').get() as any;
  }

  getProviderConfigByName(name: string): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE name = ? LIMIT 1').get(name) as any;
  }

  getProviderConfig(id: string): ProviderConfigRow | undefined {
    return db.prepare('SELECT * FROM provider_configs WHERE id = ? LIMIT 1').get(id) as any;
  }

  createRun(runId: string, projectId: string, mode: string, config: unknown, createdBy = 'anonymous'): void {
    db.prepare(`
      INSERT INTO test_gen_runs (id, project_id, status, phase, current_batch, total_batches, mode, created_by, config)
      VALUES (?, ?, 'RUNNING', 'analysis', 0, 0, ?, ?, ?)
    `).run(runId, projectId, mode, createdBy, JSON.stringify(config));
  }

  updateModelInfo(runId: string, modelName: string, providerConfigName: string | null): void {
    db.prepare(
      'UPDATE test_gen_runs SET model_name = ?, provider_config_name = ? WHERE id = ?'
    ).run(modelName, providerConfigName, runId);
  }

  listRunsByProject(projectId: string): any[] {
    const rows = db.prepare(
      'SELECT id, project_id, status, phase, current_batch, total_batches, mode, config, created_by, token_usage, model_name, provider_config_name, created_at, updated_at FROM test_gen_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(projectId);
    return (rows as any[]).map(r => ({
      ...r,
      token_usage: r.token_usage ? JSON.parse(r.token_usage) : {},
      config: r.config ? JSON.parse(r.config) : null,
    }));
  }

  getActiveRun(projectId: string): any {
    const row = db.prepare(
      "SELECT id, status, phase, current_batch, total_batches, mode, config, created_at, updated_at FROM test_gen_runs WHERE project_id = ? AND status IN ('RUNNING', 'WAITING_REVIEW') ORDER BY created_at DESC LIMIT 1"
    ).get(projectId) as any;
    if (!row) return null;
    return {
      ...row,
      config: row.config ? JSON.parse(row.config) : null,
    };
  }

  getRun(runId: string): TestGenRunRow | undefined {
    return db.prepare('SELECT id, project_id, status, phase, current_batch, total_batches, mode FROM test_gen_runs WHERE id = ?').get(runId) as any;
  }

  getRunInfo(runId: string): any {
    const row = db.prepare('SELECT * FROM test_gen_runs WHERE id = ?').get(runId) as any;
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      phase: row.phase,
      current_batch: row.current_batch,
      total_batches: row.total_batches,
      token_usage: row.token_usage ? JSON.parse(row.token_usage) : null,
      created_by: row.created_by,
      thread_id: row.thread_id,
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

  markRunFailed(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET status = 'FAILED', updated_at = datetime('now') || 'Z' WHERE id = ?").run(runId);
  }

  getFailedRun(runId: string): TestGenRunRow | undefined {
    const row = db.prepare(
      "SELECT * FROM test_gen_runs WHERE id = ? AND status = 'FAILED'"
    ).get(runId) as TestGenRunRow | undefined;
    return row;
  }

  markRunCompleted(runId: string, phase: string, usage: unknown): void {
    db.prepare(`UPDATE test_gen_runs SET status = 'COMPLETED', phase = ?, token_usage = ?, updated_at = datetime('now') || 'Z' WHERE id = ?`)
      .run(phase, JSON.stringify(usage), runId);
  }

  setRunRunning(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET status = 'RUNNING', updated_at = datetime('now') || 'Z' WHERE id = ?").run(runId);
  }

  setRunWaiting(runId: string, phase: string): void {
    db.prepare("UPDATE test_gen_runs SET status = 'WAITING_REVIEW', phase = ?, updated_at = datetime('now') || 'Z' WHERE id = ?")
      .run(phase, runId);
  }

  touchRun(runId: string): void {
    db.prepare("UPDATE test_gen_runs SET updated_at = datetime('now') || 'Z' WHERE id = ?").run(runId);
  }

  updateThreadId(runId: string, threadId: string): void {
    db.prepare("UPDATE test_gen_runs SET thread_id = ?, updated_at = datetime('now') || 'Z' WHERE id = ?")
      .run(threadId, runId);
  }

  getWaitingRuns(): any[] {
    const rows = db.prepare(
      "SELECT id, project_id, status, phase, thread_id, mode, config, updated_at FROM test_gen_runs WHERE status = 'WAITING_REVIEW' AND thread_id IS NOT NULL"
    ).all();
    return (rows as any[]).map(r => ({
      ...r,
      config: r.config ? JSON.parse(r.config) : null,
    }));
  }

  getRunWithThreadId(runId: string): any {
    const row = db.prepare(
      'SELECT id, project_id, status, phase, thread_id, mode, config, current_batch, total_batches FROM test_gen_runs WHERE id = ?'
    ).get(runId) as any;
    if (!row) return null;
    return {
      ...row,
      config: row.config ? JSON.parse(row.config) : null,
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

  saveThinkingData(runId: string, thinkingJson: string): void {
    db.prepare('UPDATE test_gen_runs SET thinking_data = ? WHERE id = ?').run(thinkingJson, runId);
  }

  getThinkingData(runId: string, batch?: number): Record<string, Array<{ type: string; phase: string; text: string; timestamp: number; batch?: number }>> | null {
    const row = db.prepare('SELECT thinking_data FROM test_gen_runs WHERE id = ?').get(runId) as any;
    if (!row?.thinking_data) return null;
    try {
      const data: Record<string, Array<{ type: string; phase: string; text: string; timestamp: number; batch?: number }>> = JSON.parse(row.thinking_data);
      if (batch === undefined) return data;
      const filtered: Record<string, Array<any>> = {};
      for (const [nodeId, entries] of Object.entries(data)) {
        const matched = entries.filter(e => e.batch === batch);
        if (matched.length > 0) filtered[nodeId] = matched;
      }
      return Object.keys(filtered).length > 0 ? filtered : null;
    } catch {
      return null;
    }
  }

  getAgentLogs(runId: string, agent?: string, batch?: number): any[] {
    let rows: any[];
    if (agent && batch !== undefined) {
      rows = db.prepare(
        'SELECT * FROM test_gen_agent_logs WHERE run_id = ? AND agent_name = ? AND batch = ? ORDER BY created_at'
      ).all(runId, agent, batch);
    } else if (agent) {
      rows = db.prepare(
        'SELECT * FROM test_gen_agent_logs WHERE run_id = ? AND agent_name = ? ORDER BY created_at'
      ).all(runId, agent);
    } else if (batch !== undefined) {
      rows = db.prepare(
        'SELECT * FROM test_gen_agent_logs WHERE run_id = ? AND batch = ? ORDER BY created_at'
      ).all(runId, batch);
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
      tool_history: r.tool_history ? JSON.parse(r.tool_history) : null,
      error_message: r.error_message ?? null,
      error_raw_response: r.error_raw_response ?? null,
    }));
  }

  /** Get accumulated token usage and latency from completed agent logs for a run (used when resuming). */
  getAccumulatedTokenUsage(runId: string): { prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; latency_ms: number } {
    const row = db.prepare(
      `SELECT COALESCE(SUM(CAST(COALESCE(json_extract(token_usage, '$.input'), '0') AS INTEGER)), 0) as prompt_tokens,
              COALESCE(SUM(CAST(COALESCE(json_extract(token_usage, '$.output'), '0') AS INTEGER)), 0) as completion_tokens,
              COALESCE(SUM(CAST(COALESCE(json_extract(token_usage, '$.reasoning'), '0') AS INTEGER)), 0) as reasoning_tokens,
              COALESCE(SUM(COALESCE(latency_ms, 0)), 0) as latency_ms
       FROM test_gen_agent_logs WHERE run_id = ? AND status = 'COMPLETED'`
    ).get(runId) as any;
    return {
      prompt_tokens: row?.prompt_tokens ?? 0,
      completion_tokens: row?.completion_tokens ?? 0,
      reasoning_tokens: row?.reasoning_tokens ?? 0,
      latency_ms: row?.latency_ms ?? 0,
    };
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

  saveAgentLog(snapshot: {
    logId: string;
    batch: number;
    agentName: string;
    phase?: string;
    inputPrompt?: unknown;
    outputData?: unknown;
    tokenUsage?: { input: number; output: number; reasoning?: number };
    latencyMs?: number | null;
    rawTrace?: unknown[];
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    errorMessage?: string;
    errorRawResponse?: string;
    toolHistory?: unknown;
  }, runId: string): void {
    const json = (v: unknown) => v !== null && v !== undefined ? JSON.stringify(v) : null;
    db.prepare(`
      INSERT INTO test_gen_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status, error_message, error_raw_response, tool_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        input_prompt = COALESCE(excluded.input_prompt, input_prompt),
        output_data = COALESCE(excluded.output_data, output_data),
        token_usage = COALESCE(excluded.token_usage, token_usage),
        latency_ms = COALESCE(excluded.latency_ms, latency_ms),
        raw_trace = COALESCE(excluded.raw_trace, raw_trace),
        status = excluded.status,
        error_message = COALESCE(excluded.error_message, error_message),
        error_raw_response = COALESCE(excluded.error_raw_response, error_raw_response),
        tool_history = COALESCE(excluded.tool_history, tool_history)
    `).run(
      snapshot.logId, runId, snapshot.batch, snapshot.agentName,
      snapshot.phase ?? '',
      json(snapshot.inputPrompt), json(snapshot.outputData),
      json(snapshot.tokenUsage), snapshot.latencyMs ?? null,
      snapshot.rawTrace && (snapshot.rawTrace as any[]).length > 0 ? json(snapshot.rawTrace) : null,
      snapshot.status,
      snapshot.errorMessage ?? null,
      snapshot.errorRawResponse ?? null,
      json(snapshot.toolHistory),
    );
  }

  insertAuditLog(runId: string, checkpointId: string, action: string, snapshot: unknown, userId = 'anonymous'): void {
    const logId = randomId('audit');
    const json = (v: unknown) => v !== null && v !== undefined ? JSON.stringify(v) : null;
    db.prepare(`
      INSERT INTO test_gen_audit_log (id, run_id, checkpoint_id, action, user_id, snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now') || 'Z')
    `).run(logId, runId, checkpointId, action, userId, json(snapshot));
  }

  getAuditLogs(runId: string, checkpointId?: string): any[] {
    if (checkpointId) {
      return db.prepare(
        "SELECT * FROM test_gen_audit_log WHERE run_id = ? AND checkpoint_id = ? ORDER BY created_at DESC"
      ).all(runId, checkpointId).map((r: any) => ({
        ...r,
        snapshot: r.snapshot ? JSON.parse(r.snapshot) : null,
        created_at: r.created_at ? new Date(r.created_at.replace(/Z$/, '') + 'Z').toISOString() : r.created_at,
      }));
    }
    return db.prepare(
      'SELECT * FROM test_gen_audit_log WHERE run_id = ? ORDER BY created_at DESC'
    ).all(runId).map((r: any) => ({
      ...r,
      snapshot: r.snapshot ? JSON.parse(r.snapshot) : null,
      created_at: r.created_at ? new Date(r.created_at.replace(/Z$/, '') + 'Z').toISOString() : r.created_at,
    }));
  }

  // ---- Prompt Overrides ----

  getPromptOverrides(projectId: string): any[] {
    return db.prepare(
      'SELECT * FROM test_gen_prompt_overrides WHERE project_id = ?'
    ).all(projectId);
  }

  getPromptOverride(projectId: string, agentName: string): any | undefined {
    return db.prepare(
      'SELECT * FROM test_gen_prompt_overrides WHERE project_id = ? AND agent_name = ?'
    ).get(projectId, agentName);
  }

  upsertPromptOverride(projectId: string, agentName: string, customPrompt: string | null, modelOverride: string | null): void {
    const id = `${projectId}_${agentName}`;
    db.prepare(`
      INSERT INTO test_gen_prompt_overrides (id, project_id, agent_name, custom_prompt, model_override, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id, agent_name) DO UPDATE SET
        custom_prompt = excluded.custom_prompt,
        model_override = excluded.model_override,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, projectId, agentName, customPrompt, modelOverride);
  }

  deletePromptOverride(projectId: string, agentName: string): void {
    db.prepare(
      'DELETE FROM test_gen_prompt_overrides WHERE project_id = ? AND agent_name = ?'
    ).run(projectId, agentName);
  }

  // ============================================================
  // Persistent Coverage Matrix (per-condition rows)
  // ============================================================

  getProjectCoverage(projectId: string, rowType?: 'requirement' | 'flow'): any[] {
    const sql = rowType
      ? 'SELECT * FROM test_gen_persistent_coverage WHERE project_id = ? AND row_type = ? ORDER BY requirement_id, technique'
      : 'SELECT * FROM test_gen_persistent_coverage WHERE project_id = ? ORDER BY requirement_id, technique';
    const params = rowType ? [projectId, rowType] : [projectId];
    return db.prepare(sql).all(...params).map((r: any) => ({
      ...r,
      test_case_ids: r.test_case_ids ? JSON.parse(r.test_case_ids) : [],
    }));
  }

  getCoverageByRequirement(projectId: string, requirementId: string): any[] {
    return db.prepare(
      'SELECT * FROM test_gen_persistent_coverage WHERE project_id = ? AND requirement_id = ?'
    ).all(projectId, requirementId).map((r: any) => ({
      ...r,
      test_case_ids: r.test_case_ids ? JSON.parse(r.test_case_ids) : [],
    }));
  }

  upsertCoverageEntries(
    runId: string,
    projectId: string,
    entries: Array<{
      requirementId: string;
      conditionHash: string;
      conditionText: string;
      technique: string;
      testCaseIds: string[];
      rowType?: 'requirement' | 'flow';
    }>,
  ): void {
    const stmt = db.prepare(`
      INSERT INTO test_gen_persistent_coverage (id, project_id, requirement_id, condition_hash, condition_text, technique, test_case_ids, row_type, run_id, covered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project_id, requirement_id, condition_hash, technique) DO UPDATE SET
        condition_text = excluded.condition_text,
        test_case_ids = excluded.test_case_ids,
        row_type = excluded.row_type,
        run_id = excluded.run_id,
        covered_at = datetime('now')
    `);
    const tx = db.transaction(() => {
      for (const e of entries) {
        stmt.run(
          `${projectId}_${e.requirementId}_${e.conditionHash}_${e.technique}`,
          projectId,
          e.requirementId,
          e.conditionHash,
          e.conditionText,
          e.technique,
          JSON.stringify(e.testCaseIds),
          e.rowType ?? 'requirement',
          runId,
        );
      }
    });
    tx();
  }

  clearProjectCoverage(projectId: string): number {
    const result = db.prepare(
      'DELETE FROM test_gen_persistent_coverage WHERE project_id = ?'
    ).run(projectId);
    return result.changes;
  }

  // ============================================================
  // Global Blueprint cache (on test_gen_runs)
  // ============================================================

  getGlobalBlueprint(runId: string): any | null {
    const row = db.prepare(
      'SELECT global_blueprint FROM test_gen_runs WHERE id = ?'
    ).get(runId) as any;
    if (!row?.global_blueprint) return null;
    try {
      return JSON.parse(row.global_blueprint);
    } catch {
      return null;
    }
  }

  saveGlobalBlueprint(runId: string, blueprint: unknown): void {
    db.prepare(
      "UPDATE test_gen_runs SET global_blueprint = ?, updated_at = datetime('now') || 'Z' WHERE id = ?"
    ).run(JSON.stringify(blueprint), runId);
  }

  // ============================================================
  // Cross-run Architect Blueprint Cache (project + requirement hash)
  // ============================================================

  getCachedBlueprint(projectId: string, requirementHash: string): any | null {
    const row = db.prepare(
      'SELECT blueprint FROM test_gen_architect_cache WHERE project_id = ? AND requirement_hash = ?'
    ).get(projectId, requirementHash) as any;
    if (!row?.blueprint) return null;
    try {
      return JSON.parse(row.blueprint);
    } catch {
      return null;
    }
  }

  saveCachedBlueprint(projectId: string, requirementHash: string, blueprint: unknown): void {
    db.prepare(`
      INSERT OR REPLACE INTO test_gen_architect_cache (project_id, requirement_hash, blueprint, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(projectId, requirementHash, JSON.stringify(blueprint));
  }

  deleteCachedBlueprint(projectId: string, requirementHash: string): void {
    db.prepare(
      'DELETE FROM test_gen_architect_cache WHERE project_id = ? AND requirement_hash = ?'
    ).run(projectId, requirementHash);
  }

  clearProjectArchitectCache(projectId: string): void {
    db.prepare(
      'DELETE FROM test_gen_architect_cache WHERE project_id = ?'
    ).run(projectId);
  }
}

export const pipelineRepo = new TestGenRepository();
export { decryptApiKey };
