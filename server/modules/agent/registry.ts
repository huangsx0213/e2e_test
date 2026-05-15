import { WebSocket } from 'ws';
import { saveAgent, getAgent, listAgents, AgentRecord } from './repository.ts';

export interface RemoteAgent extends AgentRecord {
  currentReportId?: string;
  ws?: WebSocket;
}

class AgentRegistry {
  private activeConnections = new Map<string, RemoteAgent>();

  registerOrUpdate(id: string, os: string, version: string, status: 'idle' | 'busy', ws: WebSocket) {
    const existing = getAgent(id);
    const labels = existing?.labels || [];
    const finalVersion = version || existing?.version || 'unknown';
    
    // Check if the agent was previously disabled in DB
    const finalStatus = existing?.status === 'disabled' ? 'disabled' : status;

    saveAgent({
      id,
      os,
      version: finalVersion,
      status: finalStatus,
      labels,
      lastSeen: Date.now()
    });

    this.activeConnections.set(id, {
      id,
      os,
      version: finalVersion,
      status: finalStatus,
      labels,
      lastSeen: Date.now(),
      ws,
    });
    console.log(`[AGENT_REGISTRY] Agent ${id} (${finalStatus}) updated.`);
  }

  remove(ws: WebSocket) {
    for (const [id, agent] of this.activeConnections.entries()) {
      if (agent.ws === ws) {
        if (agent.status !== 'disabled') {
            saveAgent({
                ...agent,
                status: 'offline',
                lastSeen: Date.now()
            });
        }
        console.log(`[AGENT_REGISTRY] Agent ${id} went offline.`);
        this.activeConnections.delete(id); 
      }
    }
  }

  get(id: string): RemoteAgent | undefined {
    // Return active connection if available, otherwise just db record without ws
    if (this.activeConnections.has(id)) {
        return this.activeConnections.get(id);
    }
    const dbRecord = getAgent(id);
    if (!dbRecord) return undefined;
    return { ...dbRecord };
  }

  list(): Omit<RemoteAgent, 'ws'>[] {
    const dbAgents = listAgents();
    const now = Date.now();
    return dbAgents.map(a => {
        const active = this.activeConnections.get(a.id);
        const isOffline = (now - a.lastSeen > 30000) && !active;
        let status = a.status;
        
        if (a.status !== 'disabled' && isOffline) {
            status = 'offline';
        } else if (active) {
            status = active.status;
        }

        return {
          id: a.id,
          os: a.os,
          version: a.version,
          status,
          labels: a.labels,
          lastSeen: active ? active.lastSeen : a.lastSeen,
          currentReportId: active?.currentReportId
        };
    });
  }
  
  markBusy(id: string, reportId: string) {
      const active = this.activeConnections.get(id);
      if (active) {
          if (active.status !== 'disabled') {
              active.status = 'busy';
              active.currentReportId = reportId;
              saveAgent({ ...active });
          }
      }
  }
  
  getActiveConnections(): ReadonlyMap<string, RemoteAgent> {
    return this.activeConnections;
  }

  markIdle(id: string) {
      const active = this.activeConnections.get(id);
      if (active) {
          if (active.status !== 'disabled') {
              active.status = 'idle';
              active.currentReportId = undefined;
              saveAgent({ ...active });
          }
      }
  }

  updateStatus(id: string, status: 'idle' | 'busy' | 'offline' | 'disabled'): boolean {
    const active = this.activeConnections.get(id);
    if (!active) return false;
    active.status = status;
    return true;
  }

  updateLabels(id: string, labels: string[]): boolean {
    const active = this.activeConnections.get(id);
    if (!active) return false;
    active.labels = labels;
    return true;
  }

  removeById(id: string): boolean {
    const active = this.activeConnections.get(id);
    if (!active) return false;
    active.ws?.close();
    this.activeConnections.delete(id);
    return true;
  }
}

export const agentRegistry = new AgentRegistry();
