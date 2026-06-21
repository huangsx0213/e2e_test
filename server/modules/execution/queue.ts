import { Log } from '../../shared/services/logger';
import EventEmitter from 'events';
import type { TaskPayload } from '../../../shared/contracts/index.ts';

export interface QueuedTask {
  id: string; // runId or reportId
  payload: TaskPayload;
  agentId?: string; // Target specific agent, or undefined for any matching tag
  tags: string[];
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'aborted';
  createdAt: number;
}

export class TaskQueue extends EventEmitter {
  private queue: QueuedTask[] = [];

  enqueue(task: QueuedTask) {
    this.queue.push(task);
    this.emit('task_added', task);
    Log.for('queue').info(`Task ${task.id} entered queue at position ${this.queue.length}`);
  }

  dequeueNext(availableAgentId: string, tags: string[]): QueuedTask | undefined {
    // Find the next task that either specifically targets this agent or matches the tags
    for (let i = 0; i < this.queue.length; i++) {
        const task = this.queue[i];
        if (task.status !== 'pending') continue;

        if (task.agentId && !task.agentId.startsWith('QUEUE:')) {
            if (task.agentId === availableAgentId) {
                this.queue.splice(i, 1);
                return task;
            }
        } else {
            // Queue any or targeted tag matching logic
            if (task.agentId?.startsWith('QUEUE:LABEL:')) {
                const requiredTag = task.agentId.replace('QUEUE:LABEL:', '');
                if (!tags.includes(requiredTag)) {
                    continue; // Engine doesn't have the required tag
                }
            }
            
            // Wait! If they specify QUEUE:ANY, any agent can pick it up.
            // Matching logic succeeded
            this.queue.splice(i, 1);
            return task;
        }
    }
    return undefined;
  }

  abortTask(id: string): boolean {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx !== -1) {
        this.queue.splice(idx, 1);
        Log.for('queue').info(`Aborted queued task ${id}`);
        return true;
    }
    return false;
  }
  
  getQueuePosition(id: string): number {
    return this.queue.findIndex(t => t.id === id) + 1;
  }
  
  list(): QueuedTask[] {
    return [...this.queue];
  }
}

export const taskQueue = new TaskQueue();
