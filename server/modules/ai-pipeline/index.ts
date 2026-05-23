import crypto from 'node:crypto';
import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { db } from '../../shared/db/client.ts';
import { createNlPipeline } from '../../../shared/ai/pipeline.ts';
import { createAIProvider } from '../../../shared/ai/provider.ts';
import {
  TestAnalystRole,
  TestDesignerRole,
  QualityManagerRole,
} from '../../../shared/ai/roles/index.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';

const router = Router();

const MAX_CONCURRENT = 3;
let activeRuns = 0;
const runQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

function acquireSlot(): Promise<void> {
  if (activeRuns < MAX_CONCURRENT) {
    activeRuns++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    runQueue.push({ resolve, reject });
  });
}

function releaseSlot(): void {
  activeRuns--;
  const next = runQueue.shift();
  if (next) {
    activeRuns++;
    next.resolve();
  }
}

const resumeWaiters = new Map<string, {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}>();

function decryptApiKey(encrypted: string): string {
  if (!encrypted) return '';
  if (encrypted.startsWith('sk-') || encrypted.startsWith('nv-')) return encrypted;
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev-key-change-in-production-32b', 'salt', 32);
    const parts = encrypted.split(':');
    if (parts.length !== 3) return encrypted;
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    return (decipher.update(enc) as Buffer).toString('utf-8') + decipher.final('utf-8');
  } catch {
    throw new Error('Failed to decrypt API key. Check ENCRYPTION_KEY environment variable.');
  }
}

function insertAgentLog(params: {
  id: string;
  runId: string;
  batch: number;
  agentName: string;
  phase: string;
  inputPrompt?: any;
  outputData?: any;
  tokenUsage?: any;
  latencyMs?: number;
  rawTrace?: any[];
  status?: string;
}) {
  db.prepare(`
    INSERT INTO pipeline_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      output_data = excluded.output_data,
      token_usage = excluded.token_usage,
      latency_ms = excluded.latency_ms,
      raw_trace = excluded.raw_trace,
      status = excluded.status
  `).run(
    params.id,
    params.runId,
    params.batch,
    params.agentName,
    params.phase,
    params.inputPrompt ? JSON.stringify(params.inputPrompt) : null,
    params.outputData ? JSON.stringify(params.outputData) : null,
    params.tokenUsage ? JSON.stringify(params.tokenUsage) : null,
    params.latencyMs ?? null,
    params.rawTrace ? JSON.stringify(params.rawTrace) : null,
    params.status ?? 'RUNNING',
  );
}

// --- Pipeline Runs List ---
router.get('/runs/:projectId', withErrorHandling((req, res) => {
  const rows = db.prepare(
    'SELECT id, project_id, status, phase, current_batch, total_batches, mode, config, created_by, token_usage, created_at, updated_at FROM pipeline_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.projectId) as any[];
  res.json(rows.map(r => ({
    ...r,
    token_usage: r.token_usage ? JSON.parse(r.token_usage) : {},
    config: r.config ? JSON.parse(r.config) : null,
  })));
}));

// --- Pipeline Logs ---
router.get('/:runId/logs', withErrorHandling((req, res) => {
  const { runId } = req.params;
  const { agent } = req.query;
  let rows;
  if (agent) {
    rows = db.prepare(
      'SELECT * FROM pipeline_agent_logs WHERE run_id = ? AND agent_name = ? ORDER BY created_at'
    ).all(runId, agent as string);
  } else {
    rows = db.prepare(
      'SELECT * FROM pipeline_agent_logs WHERE run_id = ? ORDER BY created_at'
    ).all(runId);
  }
  res.json((rows as any[]).map(r => ({
    ...r,
    input_prompt: r.input_prompt ? JSON.parse(r.input_prompt) : null,
    output_data: r.output_data ? JSON.parse(r.output_data) : null,
    token_usage: r.token_usage ? JSON.parse(r.token_usage) : null,
    raw_trace: r.raw_trace ? JSON.parse(r.raw_trace) : [],
  })));
}));

// --- Pipeline Checkpoint ---
router.get('/:runId/checkpoint', withErrorHandling((req, res) => {
  const row = db.prepare(
    'SELECT status, phase, checkpoint_data FROM pipeline_runs WHERE id = ?'
  ).get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json({
    status: row.status,
    phase: row.phase,
    checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null,
  });
}));

// --- Pipeline Status ---
router.get('/:runId/status', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase, current_batch, total_batches, token_usage, created_by FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(row);
}));

// --- Pipeline State ---
router.get('/:runId/state', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(row);
}));

// --- Abort ---
router.post('/:runId/abort', withErrorHandling((req, res) => {
  const runId = req.params.runId as string;
  // Reject any waiting resume promise
  const waiter = resumeWaiters.get(runId);
  if (waiter) {
    resumeWaiters.delete(runId);
    waiter.reject(new Error('Pipeline aborted'));
  }
  db.prepare("UPDATE pipeline_runs SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?").run(runId);
  res.json({ success: true });
}));

// --- Resume (Interactive mode) ---
router.post('/:runId/resume', withErrorHandling((req, res) => {
  const { action, feedback, editedData } = req.body;
  const runId = req.params.runId as string;

  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }

  if (row.status !== 'WAITING_REVIEW') {
    res.status(400).json({ error: 'Pipeline is not waiting for review' }); return;
  }

  const logId = randomId('audit');
  db.prepare(`
    INSERT INTO pipeline_audit_log (id, run_id, checkpoint_id, action, user_id, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(logId, runId, row.phase, action, 'anonymous', editedData ? JSON.stringify(editedData) : null);

  db.prepare("UPDATE pipeline_runs SET status = 'RUNNING', updated_at = datetime('now') WHERE id = ?").run(runId);

  const waiter = resumeWaiters.get(runId);
  if (waiter) {
    resumeWaiters.delete(runId);
    waiter.resolve({ action, feedback, editedData });
  }

  res.json({ success: true, action });
}));

// --- Interactive batch runner ---
async function runBatchInteractive(
  pipeline: Awaited<ReturnType<typeof createNlPipeline>>,
  inputState: any,
  config: any,
  runId: string,
  batchIndex: number,
  sendEvent: (event: string, data: unknown) => void,
  aborted: () => boolean,
): Promise<any | null> {
  const phaseMap: Record<string, string> = {
    'agent_test_analyst': 'analysis',
    'checkpoint_1': 'review-conditions',
    'agent_test_designer': 'design',
    'checkpoint_2': 'review-draft',
    'agent_quality_manager': 'quality',
    'checkpoint_3': 'final-review',
  };

  const nodeLogIds: Record<string, string> = {};

  while (true) {
    if (aborted()) return null;

    const stream = await pipeline.stream(inputState, {
      ...config,
      streamMode: 'values' as const,
    });

    let lastState: any = null;

    for await (const chunk of stream) {
      if (aborted()) return null;
      lastState = chunk as any;

      const currentPhase = (chunk as any).phase;
      if (currentPhase) {
        for (const [nodeName, phase] of Object.entries(phaseMap)) {
          if (phase === currentPhase && nodeName.startsWith('agent_') && !nodeLogIds[nodeName]) {
            nodeLogIds[nodeName] = randomId('aglog');
            insertAgentLog({
              id: nodeLogIds[nodeName],
              runId,
              batch: batchIndex,
              agentName: nodeName.replace('agent_', ''),
              phase: currentPhase,
              status: 'RUNNING',
            });
            sendEvent('agent:start', {
              agentName: nodeName.replace('agent_', ''),
              phase: currentPhase,
              batch: batchIndex,
              timestamp: Date.now(),
            });
            break;
          }
        }
      }
    }

    const interruptValue = (lastState as any)?.__interrupt__;
    if (interruptValue && interruptValue.length > 0) {
      const interruptPayload = interruptValue[0].value;

      const checkpointNumber = lastState.phase === 'review-conditions' ? 1
        : lastState.phase === 'review-draft' ? 2 : 3;

      db.prepare("UPDATE pipeline_runs SET checkpoint_data = ?, status = 'WAITING_REVIEW', phase = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(interruptPayload), lastState.phase, runId);

      sendEvent('checkpoint:waiting', {
        checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
        checkpointNumber,
        type: lastState.phase,
        summary: checkpointNumber === 1 ? `${interruptPayload.conditions?.length || 0} Test Conditions`
          : checkpointNumber === 2 ? `${interruptPayload.cases?.length || 0} Draft Cases`
          : 'Final Review',
        payload: interruptPayload,
      });

      const resumeResult = await new Promise<any>((resolve, reject) => {
        resumeWaiters.set(runId, { resolve, reject });
        setTimeout(() => {
          if (resumeWaiters.has(runId)) {
            resumeWaiters.delete(runId);
            reject(new Error('Review timeout after 30 minutes'));
          }
        }, 30 * 60 * 1000);
      });

      sendEvent('checkpoint:resolved', {
        checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
        action: resumeResult.action,
        timestamp: Date.now(),
      });

      if (resumeResult.action === 'retry') {
        inputState = { projectId: inputState.projectId, requirementIds: inputState.requirementIds,
          currentBatch: inputState.currentBatch, batchContext: inputState.batchContext,
          projectContext: inputState.projectContext, phase: 'analysis', errors: [] };
        const lastAgentName = lastState.phase === 'review-conditions' ? 'test_analyst'
          : lastState.phase === 'review-draft' ? 'test_designer' : 'quality_manager';
        if (nodeLogIds[`agent_${lastAgentName}`]) {
          db.prepare("UPDATE pipeline_agent_logs SET status = 'FAILED' WHERE id = ?").run(nodeLogIds[`agent_${lastAgentName}`]);
          delete nodeLogIds[`agent_${lastAgentName}`];
        }
      } else {
        delete (lastState as any).__interrupt__;
        inputState = lastState;
      }

      continue;
    }

    // No interrupt — stream complete
    if (lastState) {
      for (const [nodeName, logId] of Object.entries(nodeLogIds)) {
        db.prepare("UPDATE pipeline_agent_logs SET status = 'COMPLETED' WHERE id = ?").run(logId);
        const agentName = nodeName.replace('agent_', '');
        let outputCount = 0;
        let outputLabel = '';
        if (agentName === 'test_analyst') {
          outputCount = lastState.testConditions?.length || 0;
          outputLabel = 'conditions';
        } else if (agentName === 'test_designer') {
          outputCount = lastState.draftTestCases?.length || 0;
          outputLabel = 'draft cases';
        } else {
          outputCount = lastState.finalTestCases?.length || 0;
          outputLabel = 'final cases';
        }
        sendEvent('agent:complete', {
          agentName,
          phase: phaseMap[nodeName] || '',
          outputSummary: `${outputCount} ${outputLabel}`,
          outputCount,
          outputLabel,
          timestamp: Date.now(),
          batch: batchIndex,
        });
      }
      return lastState;
    }

    return null;
  }
}

// --- Start Pipeline ---
router.post('/:projectId/start', (req, res) => {
  const { requirementIds, providerConfigName, mode, flowIds, name } = req.body;
  const { projectId } = req.params;
  const runId = randomId('run');
  const runMode = mode || 'auto';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    sendEvent('heartbeat', { ts: Date.now() });
  }, 15_000);

  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(heartbeat);
    releaseSlot();
    const waiter = resumeWaiters.get(runId);
    if (waiter) {
      resumeWaiters.delete(runId);
      waiter.reject(new Error('Client disconnected'));
    }
    db.prepare("UPDATE pipeline_runs SET status = 'PAUSED', updated_at = datetime('now') WHERE id = ?").run(runId);
  });

  db.prepare(`
    INSERT INTO pipeline_runs (id, project_id, status, phase, current_batch, total_batches, mode, created_by, config)
    VALUES (?, ?, 'RUNNING', 'init', 0, 0, ?, ?, ?)
  `).run(runId, projectId, runMode, 'anonymous',
    JSON.stringify({ requirementIds, flowIds: flowIds || [], mode: runMode, providerConfigName, name }));

  (async () => {
    try {
      await acquireSlot();
      if (aborted) return;

      const index = buildRequirementIndex(projectId);
      const epics = index.filter(i => i.level === 0);
      const totalBatches = epics.length;

      db.prepare('UPDATE pipeline_runs SET total_batches = ?, current_batch = 1 WHERE id = ?').run(totalBatches, runId);

      let providerConfigRow: any;
      if (providerConfigName) {
        providerConfigRow = db.prepare('SELECT * FROM provider_configs WHERE name = ? LIMIT 1').get(providerConfigName);
      } else {
        providerConfigRow = db.prepare('SELECT * FROM provider_configs WHERE is_active = 1 LIMIT 1').get();
      }
      if (!providerConfigRow) {
        throw new Error('No active AI provider configuration found. Go to Settings → AI Provider to configure one.');
      }

      const provider = createAIProvider({
        type: providerConfigRow.type,
        endpoint: providerConfigRow.endpoint,
        apiKey: decryptApiKey(providerConfigRow.encrypted_api_key),
        deployment: providerConfigRow.deployment,
        apiVersion: providerConfigRow.api_version,
        model: providerConfigRow.model,
      });

      const pipeline = await createNlPipeline(provider, {
        testAnalyst: TestAnalystRole,
        testDesigner: TestDesignerRole,
        qualityManager: QualityManagerRole,
      }, {
        onStep: (agentName, stepIndex, stepName) => {
          sendEvent('agent:step', { agentName, stepIndex, stepName, timestamp: Date.now() });
        },
        onThinking: (agentName, text) => {
          sendEvent('agent:thinking', { agentName, text, timestamp: Date.now() });
        },
      });

      const requirements = requirementRepo.listByProject(projectId);
      const businessFlows = buildBusinessFlowBlueprints({
        flows: businessFlowRepo.listByProject(projectId),
        requirements,
      });

      sendEvent('phase:start', { phase: 'preparation', message: `Building index for ${totalBatches} epics` });
      sendEvent('pipeline:context', { flows: businessFlows.length, indexEntries: index.length });

      const allResults: any[] = [];

      for (let i = 0; i < totalBatches; i++) {
        if (aborted) break;
        const epic = epics[i];
        sendEvent('batch:start', { batch: i + 1, total: totalBatches, epic: epic.title });

        const batchRequirementIds = new Set([epic.id, ...epic.children]);
        const batchRequirements = requirements.filter(r => batchRequirementIds.has(r.id));

        db.prepare('UPDATE pipeline_runs SET current_batch = ? WHERE id = ?').run(i + 1, runId);

        const config = { configurable: { thread_id: `${runId}-batch-${i}` } };

        const inputState = {
          projectId,
          requirementIds,
          currentBatch: batchRequirements,
          batchContext: { currentBatch: i, totalBatches, processedCount: i },
          projectContext: { name: epic.title, pages: [], endpoints: [] },
          phase: 'analysis',
          errors: [],
        };

        if (runMode === 'interactive') {
          try {
            const result = await runBatchInteractive(pipeline, inputState, config, runId, i, sendEvent, () => aborted);
            if (result?.finalTestCases?.length) {
              allResults.push(result);
            }
            sendEvent('batch:complete', { batch: i + 1, total: totalBatches, testCases: result?.finalTestCases?.length || 0 });
          } catch (err: any) {
            if (aborted) break;
            sendEvent('pipeline:error', {
              phase: 'batch',
              batch: i + 1,
              message: err.message,
              recoverable: true,
            });
          }
        } else {
          try {
            const result = await pipeline.invoke(inputState, config);
            if (result.finalTestCases?.length) {
              allResults.push(result);
            }
            sendEvent('batch:complete', { batch: i + 1, total: totalBatches, testCases: result.finalTestCases?.length || 0 });
          } catch (err: any) {
            if (aborted) break;
            sendEvent('pipeline:error', {
              phase: 'batch',
              batch: i + 1,
              message: err.message,
              recoverable: true,
            });
          }
        }
      }

      if (!aborted) {
        const allCases = allResults.flatMap(r => r.finalTestCases || []);
        for (const tc of allCases) {
          nlCaseRepo.save({ ...tc, projectId });
        }

        db.prepare(`
          UPDATE pipeline_runs SET status = 'COMPLETED', phase = 'complete', updated_at = datetime('now')
          WHERE id = ?
        `).run(runId);

        sendEvent('pipeline:complete', {
          summary: `Generated ${allCases.length} test cases across ${totalBatches} batches`,
          stats: { totalCases: allCases.length, totalBatches },
        });
      }
    } catch (err: any) {
      if (!aborted) {
        db.prepare("UPDATE pipeline_runs SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?").run(runId);
        sendEvent('pipeline:error', {
          phase: 'orchestrator',
          message: err.message,
          recoverable: false,
        });
      }
    } finally {
      releaseSlot();
      clearInterval(heartbeat);
      res.end();
    }
  })();
});

export const aiPipelineModule = { basePath: '/api/pipeline', router };