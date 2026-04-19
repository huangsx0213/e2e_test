import 'dotenv/config';
import WebSocket from 'ws';
import { AgentLogger } from './AgentLogger.ts';
import { executeSingleCase, executeSuite, executeScenario, executePlan } from '../shared/core/executor.ts';
import { UIExecutor } from '../server/modules/execution/ui-executor.ts';
import type { TaskPayload } from '../shared/contracts/index.ts';

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
function getArg(name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// Support for pre-packaged config (for one-click run downloaded agents)
let config: any = {};
try {
  const configPath = path.join(process.cwd(), 'agent-config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // Ignore config load errors
}

const SERVER_URL = getArg('--url') || process.env.SERVER_URL || config.serverUrl || 'ws://localhost:3000';
const AGENT_ID = getArg('--name') || process.env.AGENT_ID || config.agentName || `agent-${Math.random().toString(36).substring(7)}`;

const AGENT_SECRET = process.env.AGENT_SECRET || config.agentSecret || '';

let ws: WebSocket;
let isReconnect = false;
let pingInterval: NodeJS.Timeout;
let currentAbortController: AbortController | null = null;
let agentStatus: 'idle' | 'busy' = 'idle';
let localTaskQueue: TaskPayload[] = [];
let isProcessing = false;

// ─── Console Interception: Forward agent output to server ───
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function formatArgs(args: any[]): string {
  return args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
}

function emitAgentLog(level: 'info' | 'warn' | 'error', args: any[]) {
  const line = formatArgs(args);
  sendMsg('AGENT_LOG', {
    agentId: AGENT_ID,
    timestamp: Date.now(),
    level,
    message: line,
  });
}

console.log = (...args: any[]) => {
  originalConsoleLog.apply(console, args);
  emitAgentLog('info', args);
};
console.warn = (...args: any[]) => {
  originalConsoleWarn.apply(console, args);
  emitAgentLog('warn', args);
};
console.error = (...args: any[]) => {
  originalConsoleError.apply(console, args);
  emitAgentLog('error', args);
};

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (localTaskQueue.length > 0) {
    const payload = localTaskQueue.shift();
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
  ws = new WebSocket(SERVER_URL, {
    headers: {
      'x-agent-secret': AGENT_SECRET
    }
  });

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
        
        localTaskQueue.push(payload);
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

  const onEnvVarExtracted = (name: string, value: string) => {
    console.log(`[AGENT] Extracted environment variable: ${name} = ${value}`);
  };

  try {
    let result;
    if (payload.request.type === 'case') {
      result = await executeSingleCase(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === 'suite') {
      result = await executeSuite(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === 'scenario') {
      result = await executeScenario(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
    } else if (payload.request.type === 'plan') {
      result = await executePlan(payload, logger, currentAbortController.signal, uiExecutor, onEnvVarExtracted);
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
