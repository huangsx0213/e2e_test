import { agentRegistry } from './registry.ts';
import type { TaskPayload } from '../../../shared/contracts/index.ts';
import { taskQueue } from '../execution/queue.ts';
import EventEmitter from 'events';
import { getActiveRunLogger } from '../execution/run-registry.ts';
import { Log } from '../../shared/services/logger';

export const agentDispatcherEvents = new EventEmitter();

export function checkQueue() {
  const activeConn = agentRegistry.getActiveConnections();
  if (!activeConn) return;

  for (const agent of activeConn.values()) {
    if (agent.status === 'idle' && agent.ws && agent.ws.readyState === 1) {
      const task = taskQueue.dequeueNext(agent.id, agent.labels || []);
      if (task) {
        assignTaskToAgent(agent, task);
      }
    }
  }
}

function assignTaskToAgent(agent: any, task: any) {
  agentRegistry.markBusy(agent.id, task.payload.reportId);

  const packet = JSON.stringify({
    event: 'TASK_DISPATCH',
    data: { payload: task.payload },
  });

  agent.ws!.send(packet);

  const onComplete = (res: any) => {
    clearTimeout(timeout);
    // Note: We no longer mark agent as idle here. 
    // We wait for the Agent to send a heartbeat confirming it is ready for more work.
    agentDispatcherEvents.removeListener(`COMPLETE_${task.payload.reportId}`, onComplete);
    agentDispatcherEvents.removeListener(`REJECTED_${task.payload.reportId}`, onRejected);
    task.resolve(res);
  };

  const onRejected = () => {
    clearTimeout(timeout);
    agentRegistry.markIdle(agent.id);
    agentDispatcherEvents.removeListener(`COMPLETE_${task.payload.reportId}`, onComplete);
    agentDispatcherEvents.removeListener(`REJECTED_${task.payload.reportId}`, onRejected);
    
    Log.for('dispatcher').info(`Task ${task.payload.reportId} rejected by agent ${agent.id}. Re-queueing...`);
    task.status = 'pending';
    taskQueue.enqueue(task);
    // checkQueue is called inside enqueue
  };

  agentDispatcherEvents.addListener(`COMPLETE_${task.payload.reportId}`, onComplete);
  agentDispatcherEvents.addListener(`REJECTED_${task.payload.reportId}`, onRejected);

  const timeout = setTimeout(() => {
    agentDispatcherEvents.removeListener(`COMPLETE_${task.payload.reportId}`, onComplete);
    agentDispatcherEvents.removeListener(`REJECTED_${task.payload.reportId}`, onRejected);
    agentRegistry.markIdle(agent.id);
    task.reject(new Error(`Agent ${agent.id} timed out executing task ${task.payload.runId}`));
    checkQueue();
  }, 3600000);
}

export async function dispatchToAgent(agentId: string | undefined, payload: TaskPayload): Promise<void> {
  // If agentId explicitly requested but agent doesn't even exist/is disabled, we could reject early.
  // But enqueueing it allows waiting for an offline agent to come online!

  return new Promise((resolve, reject) => {
    const task = {
      id: payload.reportId,
      payload,
      agentId,
      tags: [],
      status: 'pending' as const,
      createdAt: Date.now(),
      resolve,
      reject
    };

    taskQueue.enqueue(task);
    checkQueue();

    // Ensure the client knows we've queued successfully, 
    // but timeout and send position if it wasn't immediately picked up by checkQueue().
    setTimeout(() => {
      const position = taskQueue.getQueuePosition(payload.reportId);
      if (position > 0) {
        // Still in queue
        const logger = getActiveRunLogger(payload.reportId);
        if (logger) {
          logger.log({
            stepId: 'queue',
            status: 'QUEUED' as any,
            message: `Task is queued and waiting for an available ${agentId ? 'node matching ' + agentId : 'node'}...`,
            metadata: { position }
          });
        }
      }
    }, 500);
  });
}

export function abortRemoteRun(reportId: string): boolean {
  // 1. Try to abort directly if it's already in the queue
  if (taskQueue.abortTask(reportId)) {
    return true;
  }

  // 2. Otherwise find agent currently running this report
  const activeConn = agentRegistry.getActiveConnections();
  if (!activeConn) return false;

  for (const agent of activeConn.values()) {
    if (agent.currentReportId === reportId && agent.ws) {
      agent.ws.send(JSON.stringify({
        event: 'TASK_ABORT',
        data: { reportId }
      }));
      agentRegistry.markIdle(agent.id);
      return true;
    }
  }
  return false;
}

