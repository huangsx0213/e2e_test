import { db } from '../../shared/db/client.ts';

export interface AgentRecord {
  id: string;
  os: string;
  status: 'idle' | 'busy' | 'offline' | 'disabled';
  labels: string[];
  lastSeen: number;
}

export function saveAgent(agent: AgentRecord): AgentRecord {
  const stmt = db.prepare(`
    INSERT INTO agents (id, os, status, labels, last_seen)
    VALUES (@id, @os, @status, @labels, @lastSeen)
    ON CONFLICT(id) DO UPDATE SET
      os = @os,
      status = @status,
      labels = @labels,
      last_seen = @lastSeen
  `);
  
  stmt.run({
    id: agent.id,
    os: agent.os,
    status: agent.status,
    labels: JSON.stringify(agent.labels || []),
    lastSeen: agent.lastSeen
  });
  
  return getAgent(agent.id) as AgentRecord;
}

export function getAgent(id: string): AgentRecord | undefined {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  
  return {
    id: row.id,
    os: row.os,
    status: row.status,
    labels: JSON.parse(row.labels || '[]'),
    lastSeen: row.last_seen
  };
}

export function listAgents(): AgentRecord[] {
  const rows = db.prepare('SELECT * FROM agents').all() as any[];
  return rows.map(row => ({
    id: row.id,
    os: row.os,
    status: row.status,
    labels: JSON.parse(row.labels || '[]'),
    lastSeen: row.last_seen
  }));
}

export function deleteAgent(id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}
