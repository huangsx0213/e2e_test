import 'dotenv/config';
import WebSocket from 'ws';
import { AgentLogger } from './AgentLogger.ts';
import { executeSingleCase, executeSuite, executeScenario, executePlan } from '../shared/core/executor.ts';
import { UIExecutor } from '../server/modules/execution/ui-executor.ts';
import { startRecording as startRecordingSession, stopRecording as stopRecordingSession } from './recording.ts';
import type { TaskPayload } from '../shared/contracts/index.ts';
import { CURRENT_AGENT_VERSION } from '../shared/constants/agent.ts';

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
const AGENT_VERSION = CURRENT_AGENT_VERSION;

let ws: WebSocket;
let isReconnect = false;
let pingInterval: NodeJS.Timeout;
let currentAbortController: AbortController | null = null;
let agentStatus: 'idle' | 'busy' = 'idle';
let localTaskQueue: TaskPayload[] = [];
let isProcessing = false;
let isRecordingActive = false;
let recordingStarted = false;

// ─── System Logger: Explicitly forward agent output to server ───
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

const sysLogger = {
  info: (...args: any[]) => {
    console.log(...args);
    emitAgentLog('info', args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
    emitAgentLog('warn', args);
  },
  error: (...args: any[]) => {
    console.error(...args);
    emitAgentLog('error', args);
  }
};

sysLogger.info(`[AGENT] Version: ${AGENT_VERSION}`);

async function processQueue() {
  if (isProcessing || isRecordingActive) return;
  isProcessing = true;

  while (localTaskQueue.length > 0) {
    const payload = localTaskQueue.shift();
    if (!payload) continue;

    agentStatus = 'busy';
    sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'busy' });

    sysLogger.info(`[AGENT] Starting execution of task: ${payload.runId}`);
    try {
      await handleExecution(payload);
    } catch (err) {
      sysLogger.error(`[AGENT] Fatal error executing task ${payload.runId}:`, err);
    }
  }

  isProcessing = false;
  agentStatus = 'idle';
  sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'idle' });
  sysLogger.info('[AGENT] Queue drained. Agent is now idle.');
}

function connect() {
  sysLogger.info(`[AGENT] Connecting to ${SERVER_URL} as ${AGENT_ID}...`);
  ws = new WebSocket(SERVER_URL, {
    headers: {
      'x-agent-secret': AGENT_SECRET
    }
  });

  ws.on('open', () => {
    sysLogger.info('[AGENT] Connected to Server.');
    isReconnect = true;

    // Register Agent identity
    sendMsg('AGENT_REGISTER', { agentId: AGENT_ID, platform: process.platform, version: AGENT_VERSION });

    // Keep alive
    pingInterval = setInterval(() => {
      sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: agentStatus });
    }, 15000);
  });

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      sysLogger.info(`[AGENT] WS event received: ${parsed.event}`);
      if (parsed.event === 'TASK_DISPATCH') {
        const payload: TaskPayload = parsed.data.payload;
        sysLogger.info(`[AGENT] Received Task Dispatch: ${payload.request.type} (${payload.runId}) - Adding to local queue`);
        
        localTaskQueue.push(payload);
        processQueue(); // Start processing if not already
        
      } else if (parsed.event === 'TASK_ABORT') {
        const { reportId } = parsed.data;
        sysLogger.info(`[AGENT] Received Remote Abort Request for report: ${reportId}`);
        if (currentAbortController) {
          currentAbortController.abort();
        }
      } else if (parsed.event === 'RECORDING_START') {
        const { targetUrl, projectId, apiFilter, environment, pageId } = parsed.data || {};
        sysLogger.info(`[AGENT] Received Recording Start: ${projectId}`);
        try {
          isRecordingActive = true;
          recordingStarted = false;
          agentStatus = 'busy';
          sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'busy' });
          emitRecordingEvent('recording-status', { status: 'RECEIVED' });
          await startRecordingSession(targetUrl, projectId, apiFilter, environment, pageId, emitRecordingEvent);
        } catch (error) {
          sysLogger.error('[AGENT] Failed to start recording:', error);
          isRecordingActive = false;
          recordingStarted = false;
          agentStatus = 'idle';
          sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'idle' });
          emitRecordingEvent('recording-status', { status: 'FAILED', message: error instanceof Error ? error.message : String(error) });
        }
      } else if (parsed.event === 'recorder-state-changed') {
        const { state } = parsed.data || {};
        if (!state || !isRecordingActive) return;

        if (state.action === 'STOP') {
          sysLogger.info('[AGENT] Recorder stop requested');
          try {
            await stopRecordingSession();
          } finally {
            isRecordingActive = false;
            recordingStarted = false;
            agentStatus = 'idle';
            sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'idle' });
            emitRecordingEvent('recording-status', { status: 'STOPPED' });
            processQueue();
          }
          return;
        }

        if (!state.isPaused) {
          recordingStarted = true;
          emitRecordingEvent('recording-status', { status: 'STARTED' });
          return;
        }

        if (recordingStarted) {
          sysLogger.info('[AGENT] Recorder paused');
          emitRecordingEvent('recording-status', { status: 'PAUSED' });
        }
      } else if (parsed.event === 'RECORDING_STOP') {
        sysLogger.info('[AGENT] Received Recording Stop');
        try {
          await stopRecordingSession();
        } finally {
          isRecordingActive = false;
          recordingStarted = false;
          agentStatus = 'idle';
          sendMsg('AGENT_HEARTBEAT', { agentId: AGENT_ID, status: 'idle' });
          emitRecordingEvent('recording-status', { status: 'STOPPED' });
          processQueue();
        }
      }
    } catch (e) {
      sysLogger.error('[AGENT] Error handling message:', e);
    }
  });

  ws.on('close', () => {
    sysLogger.info('[AGENT] Connection closed. Reconnecting in 5s...');
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    sysLogger.error(`[AGENT] WS Error: ${err.message}`);
    ws.close();
  });
}

function sendMsg(event: string, data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function emitRecordingEvent(event: string, data: any) {
  sendMsg('RECORDING_EVENT', {
    event,
    data: { ...data, agentId: AGENT_ID },
  });
}

async function handleExecution(payload: TaskPayload) {
  const logger = new AgentLogger(payload.reportId, sendMsg);
  const uiExecutor = new UIExecutor();
  currentAbortController = new AbortController();

  logger.log({ stepId: 'agent-init', status: 'INFO', message: `🚀 Task picked up by Remote Agent: ${AGENT_ID}` });

  const onEnvVarExtracted = (name: string, value: string) => {
    sysLogger.info(`[AGENT] Extracted environment variable: ${name} = ${value}`);
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
