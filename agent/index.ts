import 'dotenv/config';
import WebSocket from 'ws';
import { AgentLogger } from './AgentLogger.ts';
import { executeSingleCase, executeSuite, executeScenario, executePlan } from '../shared/core/executor.ts';
import { UIExecutor } from '../server/modules/execution/ui-executor.ts';
import type { TaskPayload } from '../shared/contracts/index.ts';

const args = process.argv.slice(2);
function getArg(name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const SERVER_URL = getArg('--url') || process.env.SERVER_URL || 'ws://localhost:3000';
const AGENT_ID = getArg('--name') || process.env.AGENT_ID || `agent-${Math.random().toString(36).substring(7)}`;

let ws: WebSocket;
let isReconnect = false;
let pingInterval: NodeJS.Timeout;
let currentAbortController: AbortController | null = null;
let agentStatus: 'idle' | 'busy' = 'idle';
let taskQueue: TaskPayload[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (taskQueue.length > 0) {
    const payload = taskQueue.shift();
    if (!payload) continue;

    agentStatus = 'busy';
    sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'busy' });

    console.log(`[AGENT] Starting execution of task: ${payload.runId}`);
    try {
      await handleExecution(payload);
    } catch (err) {
      console.error(`[AGENT] Fatal error executing task ${payload.runId}:`, err);
    }
  }

  isProcessing = false;
  agentStatus = 'idle';
  sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'idle' });
  console.log('[AGENT] Queue drained. Agent is now idle.');
}

function connect() {
  console.log(`[AGENT] Connecting to ${SERVER_URL} as ${AGENT_ID}...`);
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('[AGENT] Connected to Server.');
    isReconnect = true;

    // Register Agent identity
    sendMsg('AGENT_REGISTER', { agentId: AGENT_ID, platform: process.platform });

    // Keep alive
    pingInterval = setInterval(() => {
      sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: agentStatus });
    }, 15000);
  });

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.event === 'TASK_DISPATCH') {
        const payload: TaskPayload = parsed.data.payload;
        console.log(`[AGENT] Received Task Dispatch: ${payload.request.type} (${payload.runId}) - Adding to local queue`);
        
        taskQueue.push(payload);
        processQueue(); // Start processing if not already
        
      } else if (parsed.event === 'TASK_ABORT') {
        const { reportId } = parsed.data;
        console.log(`[AGENT] Received Remote Abort Request for report: ${reportId}`);
        if (currentAbortController) {
          currentAbortController.abort();
        }
      }
    } catch (e) {
      console.error('[AGENT] Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[AGENT] Connection closed. Reconnecting in 5s...');
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error(`[AGENT] WS Error: ${err.message}`);
    ws.close();
  });
}

function sendMsg(event: string, data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

async function handleExecution(payload: TaskPayload) {
  const logger = new AgentLogger(payload.reportId, sendMsg);
  const uiExecutor = new UIExecutor();
  currentAbortController = new AbortController();

  logger.log({ stepId: 'agent-init', status: 'INFO', message: `🚀 Task picked up by Remote Agent: ${AGENT_ID}` });

  try {
    let result;
    if (payload.request.type === 'case') {
      result = await executeSingleCase(payload, logger, currentAbortController.signal, uiExecutor);
    } else if (payload.request.type === 'suite') {
      result = await executeSuite(payload, logger, currentAbortController.signal, uiExecutor);
    } else if (payload.request.type === 'scenario') {
      result = await executeScenario(payload, logger, currentAbortController.signal, uiExecutor);
    } else if (payload.request.type === 'plan') {
      result = await executePlan(payload, logger, currentAbortController.signal, uiExecutor);
    }

    if (result) {
      result.reportId = payload.reportId;
      logger.complete(result);
    }

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown agent error';
    logger.log({ stepId: 'agent-error', status: 'FAIL', message: `❌ Agent Exception: ${msg}` });
    logger.complete({ 
      reportId: payload.reportId, 
      status: 'FAILED', 
      passRate: 0,
       totalCases: 0,
       passedCases: 0,
       failedCases: 1,
       durationMs: 0
    });
  } finally {
    await uiExecutor.cleanup();
    currentAbortController = null;
  }
}

// Start Agent
connect();
