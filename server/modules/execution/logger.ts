import type { Response } from 'express';
import type { ExecutionLogEvent, ExecutionProgressEvent } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';

/**
 * ExecutionLogger manages dual-channel output:
 * 1. SSE (Server-Sent Events) for real-time push to connected clients
 * 2. In-memory log collection for final DB persistence
 */
export class ExecutionLogger {
  readonly reportId: string;
  private sseClients: Set<Response> = new Set();
  private logs: ExecutionLogEvent[] = [];
  private logPosition = 0;

  constructor(reportId: string) {
    this.reportId = reportId;
  }

  /**
   * Register an SSE client connection.
   */
  addClient(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send any logs that were already emitted before this client connected
    for (const log of this.logs) {
      res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
    }

    this.sseClients.add(res);

    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /**
   * Emit a log entry to all SSE clients and store in memory.
   */
  log(entry: Omit<ExecutionLogEvent, 'timestamp'>): void {
    const logEvent: ExecutionLogEvent = {
      ...entry,
      timestamp: Date.now(),
    };

    this.logs.push(logEvent);

    for (const client of this.sseClients) {
      try {
        client.write(`event: log\ndata: ${JSON.stringify(logEvent)}\n\n`);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Emit a progress update to all SSE clients.
   */
  progress(event: ExecutionProgressEvent): void {
    for (const client of this.sseClients) {
      try {
        client.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Signal execution completion to all SSE clients and close connections.
   */
  complete(data: { reportId: string; status: string; passRate: number }): void {
    for (const client of this.sseClients) {
      try {
        client.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
        client.end();
      } catch {
        // Client already disconnected
      }
    }
    this.sseClients.clear();
  }

  /**
   * Persist all collected logs into the report_logs table.
   */
  persistLogs(): void {
    const insert = db.prepare(`
      INSERT INTO report_logs (report_id, step_id, timestamp, status, message, screenshot, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const log of this.logs) {
        insert.run(
          this.reportId,
          log.stepId,
          log.timestamp,
          log.status,
          log.message,
          log.screenshot || null,
          this.logPosition++,
        );
      }
    });

    transaction();
  }

  /**
   * Get all collected logs.
   */
  getLogs(): ExecutionLogEvent[] {
    return [...this.logs];
  }

  /**
   * Check whether any SSE clients are connected.
   */
  hasClients(): boolean {
    return this.sseClients.size > 0;
  }
}
