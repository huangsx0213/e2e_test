import { agentRegistry } from './registry.ts';
import type { TaskPayload } from '../../../shared/contracts/index.ts';

export async function dispatchToAgent(agentId: string, payload: TaskPayload): Promise<void> {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`Target Remote Agent [${agentId}] is not online or registered.`);
  }

  if (!agent.ws || agent.status !== 'idle') {
    throw new Error(`Target Remote Agent [${agentId}] is busy or lacks an active connection.`);
  }

  // Mark the agent as busy locally instantly so it doesn't get picked up by another concurrent run
  agent.status = 'busy';
  agent.currentReportId = payload.reportId;

  return new Promise((resolve, reject) => {
    // We send the task over WebSocket
    const packet = JSON.stringify({
      event: 'TASK_DISPATCH',
      data: { payload },
    });
    
    agent.ws!.send(packet);

    // Wait for the complete event to be emitted by the WS handler 
    // We'll use a global event emitter for this specific run ID
    const onComplete = (res: any) => {
      clearTimeout(timeout);
      agent.status = 'idle';
      agent.currentReportId = undefined;
      agentDispatcherEvents.removeListener(`COMPLETE_${payload.reportId}`, onComplete);
      resolve(res);
    };

    agentDispatcherEvents.addListener(`COMPLETE_${payload.reportId}`, onComplete);

    // Timeout if we don't hear back an execution summary in a generous 1 hour
    const timeout = setTimeout(() => {
      agentDispatcherEvents.removeListener(`COMPLETE_${payload.reportId}`, onComplete);
      agent.status = 'idle'; // release lock manually
      agent.currentReportId = undefined;
      reject(new Error(`Agent ${agentId} timed out executing task ${payload.runId}`));
    }, 3600000); 
  });
}

export function abortRemoteRun(reportId: string): boolean {
  // Find agent currently running this report
  const allAgents = agentRegistry.list(); // This only gives metadata
  // We need to iterate the actual registry map
  const registry = (agentRegistry as any).agents as Map<string, any>;
  if (!registry) return false;

  for (const agent of registry.values()) {
    if (agent.currentReportId === reportId && agent.ws) {
      agent.ws.send(JSON.stringify({
        event: 'TASK_ABORT',
        data: { reportId }
      }));
      agent.status = 'idle';
      agent.currentReportId = undefined;
      return true;
    }
  }
  return false;
}

// Simple event bus to coordinate WS incoming messages with the dispatcher promises
import EventEmitter from 'events';
export const agentDispatcherEvents = new EventEmitter();
