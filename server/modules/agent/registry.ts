import { WebSocket } from 'ws';

export interface RemoteAgent {
  id: string;
  os: string;
  status: 'idle' | 'busy' | 'offline';
  lastSeen: number;
  currentReportId?: string;
  ws?: WebSocket;
}

class AgentRegistry {
  private agents = new Map<string, RemoteAgent>();

  registerOrUpdate(id: string, os: string, status: 'idle' | 'busy', ws: WebSocket) {
    this.agents.set(id, {
      id,
      os,
      status,
      lastSeen: Date.now(),
      currentReportId: undefined,
      ws,
    });
    console.log(`[AGENT_REGISTRY] Agent ${id} (${status}) updated.`);
  }

  remove(ws: WebSocket) {
    for (const [id, agent] of this.agents.entries()) {
      if (agent.ws === ws) {
        agent.status = 'offline';
        agent.ws = undefined;
        console.log(`[AGENT_REGISTRY] Agent ${id} went offline.`);
        // We keep it in memory for a while or remove it
        this.agents.delete(id); 
      }
    }
  }

  get(id: string): RemoteAgent | undefined {
    return this.agents.get(id);
  }

  list(): Omit<RemoteAgent, 'ws'>[] {
    const now = Date.now();
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      os: a.os,
      status: (now - a.lastSeen > 30000) ? 'offline' : a.status,
      lastSeen: a.lastSeen,
    }));
  }
}

export const agentRegistry = new AgentRegistry();
