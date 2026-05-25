import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';
import type { AgentRunSnapshot } from './pipeline-run-state.ts';

export interface RunPersister {
  saveAgentLog(snapshot: AgentRunSnapshot, runId: string): void;
  updateRunStatus(runId: string, status: string, phase: string, usage?: unknown): void;
  insertAuditLog(runId: string, checkpointId: string, action: string, userId: string, snapshot: unknown): void;
}

export class SqliteRunPersister implements RunPersister {
  saveAgentLog(snapshot: AgentRunSnapshot, runId: string): void {
    const json = (v: unknown) => v !== null && v !== undefined ? JSON.stringify(v) : null;
    db.prepare(`
      INSERT INTO pipeline_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        input_prompt = COALESCE(excluded.input_prompt, input_prompt),
        output_data = COALESCE(excluded.output_data, output_data),
        token_usage = COALESCE(excluded.token_usage, token_usage),
        latency_ms = COALESCE(excluded.latency_ms, latency_ms),
        raw_trace = COALESCE(excluded.raw_trace, raw_trace),
        status = excluded.status
    `).run(
      snapshot.logId, runId, snapshot.batch, snapshot.agentName,
      json(snapshot.inputPrompt), json(snapshot.outputData),
      json(snapshot.tokenUsage), snapshot.latencyMs ?? null,
      snapshot.rawTrace.length > 0 ? json(snapshot.rawTrace) : null,
      snapshot.status,
    );
  }

  updateRunStatus(runId: string, status: string, phase: string, usage?: unknown): void {
    if (usage) {
      db.prepare(`
        UPDATE pipeline_runs SET status = ?, phase = ?, token_usage = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, phase, JSON.stringify(usage), runId);
    } else {
      db.prepare(`
        UPDATE pipeline_runs SET status = ?, phase = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, phase, runId);
    }
  }

  insertAuditLog(runId: string, checkpointId: string, action: string, userId: string, snapshot: unknown): void {
    const logId = randomId('audit');
    const json = (v: unknown) => v !== null && v !== undefined ? JSON.stringify(v) : null;
    db.prepare(`
      INSERT INTO pipeline_audit_log (id, run_id, checkpoint_id, action, user_id, snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(logId, runId, checkpointId, action, userId, json(snapshot));
  }
}
