import type { Response } from 'express';

export interface AgentLogLine {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const MAX_BUFFER_SIZE = 500;

class AgentLogBuffer {
  private buffers = new Map<string, AgentLogLine[]>();
  private sseClients = new Map<string, Set<Response>>();

  /**
   * Push a log line into the ring buffer for a given agent.
   * Also forward to any active SSE subscribers.
   */
  push(agentId: string, line: AgentLogLine) {
    // Buffer
    if (!this.buffers.has(agentId)) {
      this.buffers.set(agentId, []);
    }
    const buffer = this.buffers.get(agentId)!;
    buffer.push(line);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift(); // Ring buffer: drop oldest
    }

    // Forward to any live SSE subscribers
    const clients = this.sseClients.get(agentId);
    if (clients) {
      const data = JSON.stringify(line);
      for (const client of clients) {
        try {
          client.write(`data: ${data}\n\n`);
        } catch {
          clients.delete(client);
        }
      }
    }
  }

  /**
   * Get the current buffer contents for a given agent.
   */
  getBuffer(agentId: string): AgentLogLine[] {
    return this.buffers.get(agentId) || [];
  }

  /**
   * Register an SSE client for live log streaming.
   * Sends existing buffer first, then live updates.
   */
  addSSEClient(agentId: string, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send existing buffer as initial payload
    const buffer = this.getBuffer(agentId);
    for (const line of buffer) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }

    // Register for live updates
    if (!this.sseClients.has(agentId)) {
      this.sseClients.set(agentId, new Set());
    }
    this.sseClients.get(agentId)!.add(res);

    res.on('close', () => {
      const clients = this.sseClients.get(agentId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          this.sseClients.delete(agentId);
        }
      }
    });
  }

  /**
   * Clear buffer when an agent is deleted.
   */
  clear(agentId: string) {
    this.buffers.delete(agentId);
    this.sseClients.delete(agentId);
  }
}

export const agentLogBuffer = new AgentLogBuffer();
